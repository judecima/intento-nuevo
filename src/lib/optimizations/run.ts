import type { SupabaseClient } from "@supabase/supabase-js";
import { optimizationDomainErrors } from "@/lib/domain/optimizations";
import { getProjectEditorData, type ProjectEditorData } from "@/lib/projects/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/database.types";
import {
  getOptimizationInputHash,
  optimizerAlgorithmVersionForRuntime,
  optimizeProject,
  type OptimizationBoardResult,
  type OptimizationCut,
  type OptimizationPlacement,
  type OptimizationRemnant,
  type OptimizationResult,
  type OptimizerEffortMode,
  type OptimizerMotorVersion,
  type OptimizerPatternGenerator,
  type OptimizerProfile,
  type OptimizerStrategy
} from "@/lib/optimizer";
import { buildOptimizationInputFromProject, optimizerProfileForStrategy } from "./project-input";

type Supabase = SupabaseClient<Database, "public">;
type OptimizationResultInsert = Database["public"]["Tables"]["optimization_results"]["Insert"];
type OptimizationBoardInsert = Database["public"]["Tables"]["optimization_boards"]["Insert"];
type OptimizationPieceInsert = Database["public"]["Tables"]["optimization_pieces"]["Insert"];
type OptimizationCutInsert = Database["public"]["Tables"]["optimization_cuts"]["Insert"];
type OptimizationRemnantInsert = Database["public"]["Tables"]["optimization_remnants"]["Insert"];

export type RunOptimizationOutcome =
  | { ok: true; resultId: string; projectVersion: number }
  | { ok: false; error: string };

/**
 * Ejecuta y persiste la optimizacion contra el estado actual del proyecto.
 *
 * Productization V1 mantiene exactamente el mismo kernel. La unica extension
 * es que el runner puede consumir un job previamente encolado por un worker
 * interno y un cliente Supabase service-role.
 */
export async function runAndStoreOptimization({
  projectId,
  strategy,
  profile,
  requestedBy,
  preloaded,
  supabaseClient,
  existingJobId,
  existingJobClaimed = false,
  expectedProjectVersion,
  patternGenerator = "js",
  motorVersion = "v1",
  effortMode = "fixed"
}: {
  projectId: string;
  strategy: OptimizerStrategy;
  profile?: OptimizerProfile;
  requestedBy: string;
  /** Estado ya leido por quien llama, para no repetir la consulta. */
  preloaded?: Pick<ProjectEditorData, "project" | "material" | "items">;
  /** Worker interno: usa service-role. El flujo normal sigue usando RLS/cookies. */
  supabaseClient?: Supabase;
  /** Job queued ya creado. Si falta, se conserva el comportamiento inline historico. */
  existingJobId?: string;
  /** El worker reclama atomicamente el job antes de entrar al runner. */
  existingJobClaimed?: boolean;
  /** Protege al worker contra ejecutar una version de proyecto distinta de la encolada. */
  expectedProjectVersion?: number;
  /** Runtime del worker. Inline/preview conserva JS por defecto. */
  patternGenerator?: OptimizerPatternGenerator;
  /** Runtime algorítmico explícito; evita que un job cambie por flags globales. */
  motorVersion?: OptimizerMotorVersion;
  effortMode?: OptimizerEffortMode;
}): Promise<RunOptimizationOutcome> {
  const supabase = supabaseClient ?? createSupabaseServerClient();
  const data = preloaded ?? (await getProjectEditorData(projectId));

  if (!data) {
    return { ok: false, error: optimizationDomainErrors.projectNotFound };
  }

  if (data.items.length === 0) {
    return { ok: false, error: optimizationDomainErrors.noItems };
  }

  const projectVersion = Number(data.project.version);
  if (expectedProjectVersion != null && projectVersion !== expectedProjectVersion) {
    if (existingJobId) {
      await supabase
        .from("optimization_jobs")
        .update({
          status: "cancelled",
          completed_at: new Date().toISOString(),
          error: optimizationDomainErrors.projectVersionConflict
        })
        .eq("id", existingJobId);
    }
    return { ok: false, error: optimizationDomainErrors.projectVersionConflict };
  }

  const input = buildOptimizationInputFromProject({
    project: data.project,
    material: data.material,
    items: data.items,
    profile: profile ?? optimizerProfileForStrategy(strategy),
    strategy
  });
  const inputHash = getOptimizationInputHash(input);
  const requestedAlgorithmVersion = optimizerAlgorithmVersionForRuntime({
    strategy,
    patternGenerator,
    motorVersion,
    effortMode,
  });
  const cachedResultId = await findCachedOptimizationResultId({
    supabase,
    organizationId: data.project.organization_id,
    projectId: data.project.id,
    projectVersion,
    strategy,
    inputHash,
    algorithmVersion: requestedAlgorithmVersion
  });

  if (cachedResultId) {
    if (existingJobId) {
      await supabase
        .from("optimization_jobs")
        .update({
          status: "cancelled",
          completed_at: new Date().toISOString(),
          error: `CACHE_HIT:${cachedResultId}`
        })
        .eq("id", existingJobId);
    }

    if (data.project.status !== "optimized") {
      await supabase.from("projects").update({ status: "optimized" }).eq("id", data.project.id);
    }

    return { ok: true, resultId: cachedResultId, projectVersion };
  }

  let jobId: string | null = existingJobId ?? null;

  try {
    if (jobId) {
      if (!existingJobClaimed) {
        const { data: claimed, error: claimError } = await supabase
          .from("optimization_jobs")
          .update({ status: "running", started_at: new Date().toISOString(), error: null })
          .eq("id", jobId)
          .eq("status", "queued")
          .select("id")
          .maybeSingle();

        if (claimError) throw new Error(`OPTIMIZATION_JOB_CLAIM_FAILED: ${claimError.message}`);
        if (!claimed) throw new Error("OPTIMIZATION_JOB_NOT_QUEUED");
      }
    } else {
      const { data: job, error: jobError } = await supabase
        .from("optimization_jobs")
        .insert({
          organization_id: data.project.organization_id,
          project_id: data.project.id,
          project_version: projectVersion,
          status: "running",
          algorithm_version: requestedAlgorithmVersion,
          strategy,
          requested_by: requestedBy,
          started_at: new Date().toISOString()
        })
        .select("id")
        .single();

      if (jobError) throw new Error(`${optimizationDomainErrors.jobCreateFailed}: ${jobError.message}`);
      jobId = job.id;
    }

    if (jobId) {
      const { error: versionError } = await supabase
        .from("optimization_jobs")
        .update({ algorithm_version: requestedAlgorithmVersion })
        .eq("id", jobId);
      if (versionError) throw new Error(`OPTIMIZATION_JOB_VERSION_UPDATE_FAILED: ${versionError.message}`);
    }

    const result = optimizeProject(input, {
      patternGenerator,
      motorVersion,
      effortMode,
    });

    if (jobId && result.algorithmVersion !== requestedAlgorithmVersion) {
      const { error: fallbackVersionError } = await supabase
        .from("optimization_jobs")
        .update({ algorithm_version: result.algorithmVersion })
        .eq("id", jobId);
      if (fallbackVersionError) {
        throw new Error(`OPTIMIZATION_JOB_FALLBACK_VERSION_UPDATE_FAILED: ${fallbackVersionError.message}`);
      }
    }

    if (!result.validation.ok) {
      throw new Error(`${optimizationDomainErrors.invalidResult}: ${describeValidation(result)}`);
    }

    const resultId = await persistOptimizationResult({
      supabase,
      jobId,
      organizationId: data.project.organization_id,
      projectId: data.project.id,
      projectVersion,
      result
    });

    await persistOptimizationDetails({ supabase, resultId, result });

    const { error: jobCompleteError } = await supabase
      .from("optimization_jobs")
      .update({ status: "completed", completed_at: new Date().toISOString(), error: null })
      .eq("id", jobId);

    if (jobCompleteError) throw new Error(`OPTIMIZATION_JOB_UPDATE_FAILED: ${jobCompleteError.message}`);

    if (data.project.status !== "optimized") {
      // Marcar el estado ya no mueve la version (migracion 20260813210000),
      // asi que el resultado recien guardado sigue siendo el vigente.
      const { error: projectUpdateError } = await supabase
        .from("projects")
        .update({ status: "optimized" })
        .eq("id", data.project.id)
        .eq("version", projectVersion);

      if (projectUpdateError) throw new Error(`PROJECT_STATUS_UPDATE_FAILED: ${projectUpdateError.message}`);
    }

    return { ok: true, resultId, projectVersion };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (jobId) {
      await supabase
        .from("optimization_jobs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error: message.slice(0, 2000)
        })
        .eq("id", jobId);
    }

    // Solo el worker deja el proyecto en `optimizing`. Si falla esa version,
    // vuelve a draft para que el usuario pueda corregir/reintentar.
    if (data.project.status === "optimizing") {
      await supabase
        .from("projects")
        .update({ status: "draft" })
        .eq("id", data.project.id)
        .eq("version", projectVersion)
        .eq("status", "optimizing");
    }

    return { ok: false, error: message };
  }
}

/**
 * Traduce el resultado de los validadores a un motivo legible que se guarda en
 * el job y se muestra en la pantalla del proyecto.
 */
export function describeValidation(result: OptimizationResult): string {
  const reasons: string[] = [];
  const industrial = result.validation.industrial;

  if (industrial.piezasColocadas !== industrial.piezasEsperadas) {
    reasons.push(`se colocaron ${industrial.piezasColocadas} de ${industrial.piezasEsperadas} piezas`);
  }
  if (industrial.coberturaCompleta === false) reasons.push("cobertura incompleta del plan");
  if (industrial.geometriaValida === false) reasons.push("geometria invalida (piezas superpuestas o fuera de placa)");
  if (industrial.secuenciaCompleta === false) reasons.push("la secuencia de cortes no cierra");
  if (industrial.duplicados.length > 0) reasons.push(`${industrial.duplicados.length} piezas duplicadas`);
  reasons.push(...result.validation.independentSlices.errores.slice(0, 3));

  const detail = reasons.length > 0 ? reasons.join("; ") : "el plan no paso la validacion industrial";
  return `${detail}. Revisa que ninguna pieza supere el tablero util y volve a intentar.`;
}

async function findCachedOptimizationResultId({
  supabase,
  organizationId,
  projectId,
  projectVersion,
  strategy,
  inputHash,
  algorithmVersion
}: {
  supabase: Supabase;
  organizationId: string;
  projectId: string;
  projectVersion: number;
  strategy: OptimizerStrategy;
  inputHash: string;
  algorithmVersion: string;
}): Promise<string | null> {
  const { data: jobs, error: jobsError } = await supabase
    .from("optimization_jobs")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("project_id", projectId)
    .eq("project_version", projectVersion)
    .eq("strategy", strategy)
    .eq("algorithm_version", algorithmVersion)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(10);

  if (jobsError || !jobs?.length) return null;

  const jobIds = jobs.map((job) => job.id);
  const { data: results, error: resultsError } = await supabase
    .from("optimization_results")
    .select("id,result_json")
    .in("optimization_job_id", jobIds)
    .order("created_at", { ascending: false });

  if (resultsError || !results?.length) return null;

  const match = results.find((result) => resultInputHash(result.result_json) === inputHash);
  return match?.id ?? null;
}

function resultInputHash(value: Json): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const hash = (value as Record<string, unknown>).inputHash;
  return typeof hash === "string" ? hash : "";
}

async function persistOptimizationResult({
  supabase,
  jobId,
  organizationId,
  projectId,
  projectVersion,
  result
}: {
  supabase: Supabase;
  jobId: string;
  organizationId: string;
  projectId: string;
  projectVersion: number;
  result: OptimizationResult;
}): Promise<string> {
  const insert: OptimizationResultInsert = {
    optimization_job_id: jobId,
    organization_id: organizationId,
    project_id: projectId,
    project_version: projectVersion,
    board_count: result.metrics.boardCount,
    piece_count: result.metrics.pieceCount,
    utilization_percentage: result.metrics.utilizationPercentage,
    waste_percentage: result.metrics.wastePercentage,
    commercial_remnant_area: result.metrics.commercialRemnantAreaM2,
    cut_count: result.metrics.cutCount,
    saw_meters: result.metrics.sawMeters,
    edge_band_045_meters: result.metrics.edgeBand045Meters,
    edge_band_2mm_meters: result.metrics.edgeBand2mmMeters,
    result_json: toJson(result),
    validation_json: toJson(result.validation)
  };

  const { data, error } = await supabase.from("optimization_results").insert(insert).select("id").single();
  if (error) throw new Error(`${optimizationDomainErrors.resultCreateFailed}: ${error.message}`);
  return data.id;
}

async function persistOptimizationDetails({
  supabase,
  resultId,
  result
}: {
  supabase: Supabase;
  resultId: string;
  result: OptimizationResult;
}) {
  const boards: OptimizationBoardInsert[] = result.boards.map((board) => boardInsert(resultId, board));
  const pieces: OptimizationPieceInsert[] = result.placements.map((piece) => pieceInsert(resultId, piece));
  const cuts: OptimizationCutInsert[] = result.cuts.map((cut) => cutInsert(resultId, cut));
  const remnants: OptimizationRemnantInsert[] = result.remnants.map((remnant) => remnantInsert(resultId, remnant));

  const [boardsResult, piecesResult, cutsResult, remnantsResult] = await Promise.all([
    boards.length > 0 ? supabase.from("optimization_boards").insert(boards) : emptyWrite(),
    pieces.length > 0 ? supabase.from("optimization_pieces").insert(pieces) : emptyWrite(),
    cuts.length > 0 ? supabase.from("optimization_cuts").insert(cuts) : emptyWrite(),
    remnants.length > 0 ? supabase.from("optimization_remnants").insert(remnants) : emptyWrite()
  ]);

  if (boardsResult.error) throw new Error(`OPTIMIZATION_BOARDS_CREATE_FAILED: ${boardsResult.error.message}`);
  if (piecesResult.error) throw new Error(`OPTIMIZATION_PIECES_CREATE_FAILED: ${piecesResult.error.message}`);
  if (cutsResult.error) throw new Error(`OPTIMIZATION_CUTS_CREATE_FAILED: ${cutsResult.error.message}`);
  if (remnantsResult.error) throw new Error(`OPTIMIZATION_REMNANTS_CREATE_FAILED: ${remnantsResult.error.message}`);
}

function emptyWrite(): Promise<{ error: { message: string } | null }> {
  return Promise.resolve({ error: null });
}

function boardInsert(resultId: string, board: OptimizationBoardResult): OptimizationBoardInsert {
  return {
    optimization_result_id: resultId,
    board_index: board.boardIndex,
    width: board.width,
    height: board.height,
    placement_count: board.placements.length,
    cut_count: board.cuts.length,
    remnant_count: board.remnants.length,
    raw_json: toJson(board)
  };
}

function pieceInsert(resultId: string, piece: OptimizationPlacement): OptimizationPieceInsert {
  return {
    optimization_result_id: resultId,
    board_index: piece.boardIndex,
    piece_id: piece.pieceId,
    reference: piece.reference,
    description: piece.description,
    x: piece.x,
    y: piece.y,
    width: piece.width,
    height: piece.height,
    rotated: piece.rotated,
    level: piece.level,
    raw_json: toJson(piece)
  };
}

function cutInsert(resultId: string, cut: OptimizationCut): OptimizationCutInsert {
  return {
    optimization_result_id: resultId,
    board_index: cut.boardIndex,
    x1: cut.x1,
    y1: cut.y1,
    x2: cut.x2,
    y2: cut.y2,
    level: cut.level,
    length: cut.length,
    terminal: cut.terminal,
    raw_json: toJson(cut)
  };
}

function remnantInsert(resultId: string, remnant: OptimizationRemnant): OptimizationRemnantInsert {
  return {
    optimization_result_id: resultId,
    board_index: remnant.boardIndex,
    x: remnant.x,
    y: remnant.y,
    width: remnant.width,
    height: remnant.height,
    area: remnant.area,
    commercial: remnant.commercial,
    raw_json: toJson(remnant)
  };
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

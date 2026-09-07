import { optimizationDomainErrors } from "@/lib/domain/optimizations";
import { getProjectEditorData, type ProjectEditorData } from "@/lib/projects/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/database.types";
import {
  getOptimizationInputHash,
  LEGACY_OPTIMIZER_VERSION,
  type OptimizationBoardResult,
  type OptimizationCut,
  type OptimizationInput,
  type OptimizationPlacement,
  type OptimizationRemnant,
  type OptimizationResult,
  type OptimizerProfile,
  type OptimizerStrategy
} from "@/lib/optimizer";
import {
  executeOptimization,
  OptimizationSupersededError
} from "./executor";
import { buildOptimizationInputFromProject, optimizerProfileForStrategy } from "./project-input";

type OptimizationResultInsert = Database["public"]["Tables"]["optimization_results"]["Insert"];
type OptimizationBoardInsert = Database["public"]["Tables"]["optimization_boards"]["Insert"];
type OptimizationPieceInsert = Database["public"]["Tables"]["optimization_pieces"]["Insert"];
type OptimizationCutInsert = Database["public"]["Tables"]["optimization_cuts"]["Insert"];
type OptimizationRemnantInsert = Database["public"]["Tables"]["optimization_remnants"]["Insert"];
type OptimizationProjectData = Pick<ProjectEditorData, "project" | "material" | "items">;

export type RunOptimizationOutcome =
  | { ok: true; resultId: string; projectVersion: number }
  | { ok: false; error: string };

const inFlightOptimizationRuns = new Map<string, Promise<RunOptimizationOutcome>>();

/**
 * Ejecuta y persiste la optimizacion contra el estado actual del proyecto.
 *
 * Lee la version desde la base en el momento de correr, para que un guardado
 * previo en la misma request quede reflejado y el resultado no nazca vencido.
 * Los pedidos identicos concurrentes dentro del mismo proceso comparten una sola
 * ejecucion/persistencia; el cache persistido sigue resolviendo repeticiones ya
 * completadas.
 */
export async function runAndStoreOptimization({
  projectId,
  strategy,
  profile,
  requestedBy,
  preloaded
}: {
  projectId: string;
  strategy: OptimizerStrategy;
  profile?: OptimizerProfile;
  requestedBy: string;
  /** Estado ya leido por quien llama, para no repetir la consulta. */
  preloaded?: OptimizationProjectData;
}): Promise<RunOptimizationOutcome> {
  const data = preloaded ?? (await getProjectEditorData(projectId));

  if (!data) {
    return { ok: false, error: optimizationDomainErrors.projectNotFound };
  }

  if (data.items.length === 0) {
    return { ok: false, error: optimizationDomainErrors.noItems };
  }

  const supabase = createSupabaseServerClient();
  const projectVersion = Number(data.project.version);
  const input = buildOptimizationInputFromProject({
    project: data.project,
    material: data.material,
    items: data.items,
    profile: profile ?? optimizerProfileForStrategy(strategy),
    strategy
  });
  const inputHash = getOptimizationInputHash(input);
  const cachedResultId = await findCachedOptimizationResultId({
    supabase,
    organizationId: data.project.organization_id,
    projectId: data.project.id,
    projectVersion,
    strategy,
    inputHash
  });

  if (cachedResultId) {
    if (data.project.status !== "optimized") {
      await supabase.from("projects").update({ status: "optimized" }).eq("id", data.project.id);
    }

    return { ok: true, resultId: cachedResultId, projectVersion };
  }

  const dedupeKey = [
    data.project.organization_id,
    data.project.id,
    projectVersion,
    strategy,
    inputHash
  ].join(":");
  const existing = inFlightOptimizationRuns.get(dedupeKey);
  if (existing) return existing;

  const pending = runUncachedOptimization({
    supabase,
    data,
    input,
    inputHash,
    projectVersion,
    strategy,
    requestedBy
  });
  inFlightOptimizationRuns.set(dedupeKey, pending);

  try {
    return await pending;
  } finally {
    if (inFlightOptimizationRuns.get(dedupeKey) === pending) {
      inFlightOptimizationRuns.delete(dedupeKey);
    }
  }
}

async function runUncachedOptimization({
  supabase,
  data,
  input,
  inputHash,
  projectVersion,
  strategy,
  requestedBy
}: {
  supabase: ReturnType<typeof createSupabaseServerClient>;
  data: OptimizationProjectData;
  input: OptimizationInput;
  inputHash: string;
  projectVersion: number;
  strategy: OptimizerStrategy;
  requestedBy: string;
}): Promise<RunOptimizationOutcome> {
  let jobId: string | null = null;

  try {
    const { data: job, error: jobError } = await supabase
      .from("optimization_jobs")
      .insert({
        organization_id: data.project.organization_id,
        project_id: data.project.id,
        project_version: projectVersion,
        status: "queued",
        algorithm_version: LEGACY_OPTIMIZER_VERSION,
        strategy,
        requested_by: requestedBy
      })
      .select("id")
      .single();

    if (jobError) throw new Error(`${optimizationDomainErrors.jobCreateFailed}: ${jobError.message}`);
    jobId = job.id;

    const execution = await executeOptimization(input, {
      projectId: data.project.id,
      projectVersion,
      onStarted: async () => {
        const { error } = await supabase
          .from("optimization_jobs")
          .update({ status: "running", started_at: new Date().toISOString(), error: null })
          .eq("id", job.id);

        if (error) throw new Error(`OPTIMIZATION_JOB_UPDATE_FAILED: ${error.message}`);
      }
    });
    const result = execution.result;

    console.info(
      "OPTIMIZER_EXECUTION",
      JSON.stringify({
        jobId,
        projectId: data.project.id,
        projectVersion,
        inputHash,
        ...execution.telemetry
      })
    );

    if (!result.validation.ok) {
      throw new Error(`${optimizationDomainErrors.invalidResult}: ${describeValidation(result)}`);
    }

    await assertProjectVersionCurrent({
      supabase,
      projectId: data.project.id,
      expectedVersion: projectVersion
    });

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
        .eq("id", data.project.id);

      if (projectUpdateError) throw new Error(`PROJECT_STATUS_UPDATE_FAILED: ${projectUpdateError.message}`);
    }

    return { ok: true, resultId, projectVersion };
  } catch (error) {
    const superseded = error instanceof OptimizationSupersededError;
    const message = error instanceof Error ? error.message : String(error);

    if (jobId) {
      await supabase
        .from("optimization_jobs")
        .update({
          status: superseded ? "cancelled" : "failed",
          completed_at: new Date().toISOString(),
          error: message.slice(0, 2000)
        })
        .eq("id", jobId);
    }

    return {
      ok: false,
      error: superseded ? optimizationDomainErrors.projectVersionConflict : message
    };
  }
}

async function assertProjectVersionCurrent({
  supabase,
  projectId,
  expectedVersion
}: {
  supabase: ReturnType<typeof createSupabaseServerClient>;
  projectId: string;
  expectedVersion: number;
}) {
  const { data, error } = await supabase
    .from("projects")
    .select("version")
    .eq("id", projectId)
    .single();

  if (error) throw new Error(`PROJECT_VERSION_CHECK_FAILED: ${error.message}`);
  if (Number(data.version) !== expectedVersion) {
    throw new OptimizationSupersededError(projectId, expectedVersion);
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
  inputHash
}: {
  supabase: ReturnType<typeof createSupabaseServerClient>;
  organizationId: string;
  projectId: string;
  projectVersion: number;
  strategy: OptimizerStrategy;
  inputHash: string;
}): Promise<string | null> {
  const { data: jobs, error: jobsError } = await supabase
    .from("optimization_jobs")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("project_id", projectId)
    .eq("project_version", projectVersion)
    .eq("strategy", strategy)
    .eq("algorithm_version", LEGACY_OPTIMIZER_VERSION)
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
  supabase: ReturnType<typeof createSupabaseServerClient>;
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
  supabase: ReturnType<typeof createSupabaseServerClient>;
  resultId: string;
  result: OptimizationResult;
}) {
  const boards: OptimizationBoardInsert[] = result.boards.map((board) => boardInsert(resultId, board));
  const pieces: OptimizationPieceInsert[] = result.placements.map((piece) => pieceInsert(resultId, piece));
  const cuts: OptimizationCutInsert[] = result.cuts.map((cut) => cutInsert(resultId, cut));
  const remnants: OptimizationRemnantInsert[] = result.remnants.map((remnant) => remnantInsert(resultId, remnant));

  // Las cuatro tablas son independientes entre si: van en paralelo.
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

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type OptimizationJobRow = Database["public"]["Tables"]["optimization_jobs"]["Row"];
export type OptimizationResultRow = Database["public"]["Tables"]["optimization_results"]["Row"];
export type OptimizationBoardRow = Database["public"]["Tables"]["optimization_boards"]["Row"];
export type OptimizationPieceRow = Database["public"]["Tables"]["optimization_pieces"]["Row"];
export type OptimizationCutRow = Database["public"]["Tables"]["optimization_cuts"]["Row"];
export type OptimizationRemnantRow = Database["public"]["Tables"]["optimization_remnants"]["Row"];

export type StoredOptimization = {
  job: OptimizationJobRow;
  result: OptimizationResultRow;
  boards: OptimizationBoardRow[];
  pieces: OptimizationPieceRow[];
  cuts: OptimizationCutRow[];
  remnants: OptimizationRemnantRow[];
};

/**
 * Ultimo intento de optimizacion, sin importar como termino. Sirve para
 * explicar en pantalla por que el plano no se actualizo.
 */
export async function getLatestOptimizationAttempt(projectId: string): Promise<OptimizationJobRow | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("optimization_jobs")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`OPTIMIZATION_JOB_QUERY_FAILED: ${error.message}`);
  }

  return data ? coerceOptimizationJob(data as OptimizationJobRow) : null;
}

export async function getLatestOptimizationForProject(projectId: string): Promise<StoredOptimization | null> {
  const supabase = createSupabaseServerClient();
  const { data: jobData, error: jobError } = await supabase
    .from("optimization_jobs")
    .select("*")
    .eq("project_id", projectId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (jobError) {
    throw new Error(`OPTIMIZATION_JOB_QUERY_FAILED: ${jobError.message}`);
  }

  if (!jobData) return null;

  const job = coerceOptimizationJob(jobData as OptimizationJobRow);
  const { data: resultData, error: resultError } = await supabase
    .from("optimization_results")
    .select("*")
    .eq("optimization_job_id", job.id)
    .maybeSingle();

  if (resultError) {
    throw new Error(`OPTIMIZATION_RESULT_QUERY_FAILED: ${resultError.message}`);
  }

  if (!resultData) return null;

  const result = coerceOptimizationResult(resultData as OptimizationResultRow);

  const [boardsQuery, piecesQuery, cutsQuery, remnantsQuery] = await Promise.all([
    supabase
      .from("optimization_boards")
      .select("*")
      .eq("optimization_result_id", result.id)
      .order("board_index", { ascending: true }),
    supabase
      .from("optimization_pieces")
      .select("*")
      .eq("optimization_result_id", result.id)
      .order("board_index", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("optimization_cuts")
      .select("*")
      .eq("optimization_result_id", result.id)
      .order("board_index", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("optimization_remnants")
      .select("*")
      .eq("optimization_result_id", result.id)
      .order("board_index", { ascending: true })
      .order("created_at", { ascending: true })
  ]);

  if (boardsQuery.error) throw new Error(`OPTIMIZATION_BOARDS_QUERY_FAILED: ${boardsQuery.error.message}`);
  if (piecesQuery.error) throw new Error(`OPTIMIZATION_PIECES_QUERY_FAILED: ${piecesQuery.error.message}`);
  if (cutsQuery.error) throw new Error(`OPTIMIZATION_CUTS_QUERY_FAILED: ${cutsQuery.error.message}`);
  if (remnantsQuery.error) throw new Error(`OPTIMIZATION_REMNANTS_QUERY_FAILED: ${remnantsQuery.error.message}`);

  return {
    job,
    result,
    boards: ((boardsQuery.data ?? []) as OptimizationBoardRow[]).map(coerceOptimizationBoard),
    pieces: ((piecesQuery.data ?? []) as OptimizationPieceRow[]).map(coerceOptimizationPiece),
    cuts: ((cutsQuery.data ?? []) as OptimizationCutRow[]).map(coerceOptimizationCut),
    remnants: ((remnantsQuery.data ?? []) as OptimizationRemnantRow[]).map(coerceOptimizationRemnant)
  };
}

function coerceOptimizationJob(row: OptimizationJobRow): OptimizationJobRow {
  return {
    ...row,
    project_version: Number(row.project_version)
  };
}

function coerceOptimizationResult(row: OptimizationResultRow): OptimizationResultRow {
  return {
    ...row,
    project_version: Number(row.project_version),
    board_count: Number(row.board_count),
    piece_count: Number(row.piece_count),
    utilization_percentage: Number(row.utilization_percentage),
    waste_percentage: Number(row.waste_percentage),
    commercial_remnant_area: Number(row.commercial_remnant_area),
    cut_count: Number(row.cut_count),
    saw_meters: Number(row.saw_meters),
    edge_band_045_meters: Number(row.edge_band_045_meters),
    edge_band_2mm_meters: Number(row.edge_band_2mm_meters)
  };
}

function coerceOptimizationBoard(row: OptimizationBoardRow): OptimizationBoardRow {
  return {
    ...row,
    board_index: Number(row.board_index),
    width: Number(row.width),
    height: Number(row.height),
    placement_count: Number(row.placement_count),
    cut_count: Number(row.cut_count),
    remnant_count: Number(row.remnant_count)
  };
}

function coerceOptimizationPiece(row: OptimizationPieceRow): OptimizationPieceRow {
  return {
    ...row,
    board_index: Number(row.board_index),
    x: Number(row.x),
    y: Number(row.y),
    width: Number(row.width),
    height: Number(row.height),
    level: Number(row.level)
  };
}

function coerceOptimizationCut(row: OptimizationCutRow): OptimizationCutRow {
  return {
    ...row,
    board_index: Number(row.board_index),
    x1: Number(row.x1),
    y1: Number(row.y1),
    x2: Number(row.x2),
    y2: Number(row.y2),
    level: Number(row.level),
    length: Number(row.length)
  };
}

function coerceOptimizationRemnant(row: OptimizationRemnantRow): OptimizationRemnantRow {
  return {
    ...row,
    board_index: Number(row.board_index),
    x: Number(row.x),
    y: Number(row.y),
    width: Number(row.width),
    height: Number(row.height),
    area: Number(row.area)
  };
}

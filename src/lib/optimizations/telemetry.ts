import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/database.types";

export type OptimizationTimingSample = {
  jobId: string;
  status: Database["public"]["Tables"]["optimization_jobs"]["Row"]["status"];
  queuedMs: number | null;
  runMs: number | null;
  totalMs: number | null;
  engineMs: number | null;
  cacheHit: boolean | null;
  algorithmVersion?: string | null;
  effortMode?: string | null;
  stopReason?: string | null;
};

export type OptimizationTelemetrySummary = {
  sampleCount: number;
  completed: number;
  failed: number;
  cancelled: number;
  active: number;
  totalMs: Percentiles;
  queuedMs: Percentiles;
  runMs: Percentiles;
  engineMs: Percentiles;
  runtime: {
    algorithmVersions: Record<string, number>;
    effortModes: Record<string, number>;
    stopReasons: Record<string, number>;
  };
};

type Percentiles = {
  p50: number | null;
  p95: number | null;
  p99: number | null;
};

type JobTimingRow = Pick<
  Database["public"]["Tables"]["optimization_jobs"]["Row"],
  "id" | "status" | "created_at" | "started_at" | "completed_at" | "algorithm_version"
>;

type ResultTimingRow = Pick<
  Database["public"]["Tables"]["optimization_results"]["Row"],
  "optimization_job_id" | "result_json"
>;

/**
 * Resume las ejecuciones recientes sin agregar un segundo sistema de metricas.
 * Los timestamps del job miden cola/run/total y el resultado ya contiene
 * metrics.engineMs/cacheHit del kernel.
 */
export async function getOptimizationTelemetrySummary(
  organizationId: string,
  limit = 250
): Promise<OptimizationTelemetrySummary> {
  const supabase = createSupabaseServerClient();
  const safeLimit = Math.max(1, Math.min(1000, Math.trunc(limit)));
  const { data: jobData, error: jobError } = await supabase
    .from("optimization_jobs")
    .select("id,status,created_at,started_at,completed_at,algorithm_version")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (jobError) throw new Error(`OPTIMIZATION_TELEMETRY_JOBS_FAILED: ${jobError.message}`);

  const jobs = (jobData ?? []) as JobTimingRow[];
  if (jobs.length === 0) return summarizeOptimizationTimings([]);

  const ids = jobs.map((job) => job.id);
  const { data: resultData, error: resultError } = await supabase
    .from("optimization_results")
    .select("optimization_job_id,result_json")
    .in("optimization_job_id", ids);

  if (resultError) throw new Error(`OPTIMIZATION_TELEMETRY_RESULTS_FAILED: ${resultError.message}`);

  const resultByJob = new Map(
    ((resultData ?? []) as ResultTimingRow[]).map((result) => [result.optimization_job_id, result.result_json])
  );

  return summarizeOptimizationTimings(
    jobs.map((job) => timingSample(job, resultByJob.get(job.id)))
  );
}

export function summarizeOptimizationTimings(samples: OptimizationTimingSample[]): OptimizationTelemetrySummary {
  return {
    sampleCount: samples.length,
    completed: samples.filter((sample) => sample.status === "completed").length,
    failed: samples.filter((sample) => sample.status === "failed").length,
    cancelled: samples.filter((sample) => sample.status === "cancelled").length,
    active: samples.filter((sample) => sample.status === "queued" || sample.status === "running").length,
    totalMs: percentiles(samples.map((sample) => sample.totalMs)),
    queuedMs: percentiles(samples.map((sample) => sample.queuedMs)),
    runMs: percentiles(samples.map((sample) => sample.runMs)),
    engineMs: percentiles(samples.map((sample) => sample.engineMs)),
    runtime: {
      algorithmVersions: counts(samples.map((sample) => sample.algorithmVersion)),
      effortModes: counts(samples.map((sample) => sample.effortMode)),
      stopReasons: counts(samples.map((sample) => sample.stopReason)),
    }
  };
}

function timingSample(job: JobTimingRow, resultJson: Json | undefined): OptimizationTimingSample {
  const created = timestamp(job.created_at);
  const started = timestamp(job.started_at);
  const completed = timestamp(job.completed_at);
  const metrics = resultMetrics(resultJson);

  return {
    jobId: job.id,
    status: job.status,
    queuedMs: created != null && started != null ? Math.max(0, started - created) : null,
    runMs: started != null && completed != null ? Math.max(0, completed - started) : null,
    totalMs: created != null && completed != null ? Math.max(0, completed - created) : null,
    engineMs: metrics.engineMs,
    cacheHit: metrics.cacheHit,
    algorithmVersion: job.algorithm_version,
    effortMode: metrics.effortMode,
    stopReason: metrics.stopReason
  };
}

function resultMetrics(value: Json | undefined): {
  engineMs: number | null;
  cacheHit: boolean | null;
  effortMode: string | null;
  stopReason: string | null;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { engineMs: null, cacheHit: null, effortMode: null, stopReason: null };
  }

  const root = value as Record<string, unknown>;
  const metricsValue = root.metrics;
  const metrics =
    metricsValue && typeof metricsValue === "object" && !Array.isArray(metricsValue)
      ? metricsValue as Record<string, unknown>
      : null;

  const rawValue = root.raw;
  const raw =
    rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)
      ? rawValue as Record<string, unknown>
      : null;
  const metricasV10Value = raw?.metricasV10;
  const metricasV10 =
    metricasV10Value && typeof metricasV10Value === "object" && !Array.isArray(metricasV10Value)
      ? metricasV10Value as Record<string, unknown>
      : null;
  const effortControllerValue = metricasV10?.effortController;
  const effortController =
    effortControllerValue && typeof effortControllerValue === "object" && !Array.isArray(effortControllerValue)
      ? effortControllerValue as Record<string, unknown>
      : null;

  return {
    engineMs:
      typeof metrics?.engineMs === "number" && Number.isFinite(metrics.engineMs)
        ? metrics.engineMs
        : null,
    cacheHit: typeof metrics?.cacheHit === "boolean" ? metrics.cacheHit : null,
    effortMode: typeof metrics?.effortMode === "string" ? metrics.effortMode : null,
    stopReason:
      typeof effortController?.stopReason === "string"
        ? effortController.stopReason
        : null
  };
}

function timestamp(value: string | null): number | null {
  if (!value) return null;
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : null;
}

function percentiles(values: Array<number | null>): Percentiles {
  const sorted = values.filter((value): value is number => value != null && Number.isFinite(value)).sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99)
  };
}

function percentile(sorted: number[], ratio: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index] ?? null;
}


function counts(values: Array<string | null | undefined>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const value of values) {
    if (!value) continue;
    out[value] = (out[value] ?? 0) + 1;
  }
  return out;
}

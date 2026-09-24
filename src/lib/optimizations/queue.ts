import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  LEGACY_OPTIMIZER_VERSION,
  type OptimizerProfile,
  type OptimizerStrategy
} from "@/lib/optimizer";

type Supabase = SupabaseClient<Database, "public">;

type QueueOutcome =
  | { ok: true; jobId: string; reused: boolean }
  | { ok: false; error: string };

type JobRowWithProfile = Database["public"]["Tables"]["optimization_jobs"]["Row"] & {
  profile: OptimizerProfile | null;
};

/**
 * Encola una optimizacion grande sin cambiar algoritmo ni parametros.
 * La columna profile se agrega en la migracion de Productization V1; el cast
 * queda aislado aca hasta la proxima regeneracion automatica de tipos Supabase.
 */
export async function enqueueOptimizationJob({
  supabase,
  organizationId,
  projectId,
  projectVersion,
  strategy,
  profile,
  requestedBy,
  algorithmVersion = LEGACY_OPTIMIZER_VERSION
}: {
  supabase: Supabase;
  organizationId: string;
  projectId: string;
  projectVersion: number;
  strategy: OptimizerStrategy;
  profile?: OptimizerProfile;
  requestedBy: string;
  /** Complete immutable runtime identity for this queued execution. */
  algorithmVersion?: string;
}): Promise<QueueOutcome> {
  const jobs = supabase.from("optimization_jobs") as unknown as {
    select(columns: string): any;
    insert(values: Record<string, unknown>): any;
  };

  // Un project/version solo puede tener una optimizacion activa. Si la
  // solicitud coincide exactamente la reutilizamos; si pide otra variante,
  // debe esperar a que termine la actual para evitar dos resultados compitiendo
  // por el mismo estado/version del proyecto.
  const { data: active, error: activeError } = await jobs
    .select("id, profile, algorithm_version, strategy")
    .eq("organization_id", organizationId)
    .eq("project_id", projectId)
    .eq("project_version", projectVersion)
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeError) {
    return { ok: false, error: `OPTIMIZATION_QUEUE_LOOKUP_FAILED: ${activeError.message}` };
  }

  if (active) {
    const row = active as Pick<JobRowWithProfile, "id" | "profile" | "algorithm_version" | "strategy">;
    const sameVariant =
      row.algorithm_version === algorithmVersion &&
      row.strategy === strategy &&
      (row.profile ?? null) === (profile ?? null);

    if (sameVariant) {
      const projectOutcome = await markProjectOptimizing(supabase, projectId, projectVersion);
      if (!projectOutcome.ok) return projectOutcome;
      return { ok: true, jobId: row.id, reused: true };
    }

    return {
      ok: false,
      error: "OPTIMIZATION_ALREADY_RUNNING"
    };
  }

  const { data: job, error: jobError } = await jobs
    .insert({
      organization_id: organizationId,
      project_id: projectId,
      project_version: projectVersion,
      status: "queued",
      algorithm_version: algorithmVersion,
      strategy,
      profile: profile ?? null,
      requested_by: requestedBy,
      started_at: null,
      completed_at: null,
      error: null
    })
    .select("id")
    .single();

  if (jobError || !job) {
    return {
      ok: false,
      error: `OPTIMIZATION_QUEUE_CREATE_FAILED: ${jobError?.message ?? "job not returned"}`
    };
  }

  const projectOutcome = await markProjectOptimizing(supabase, projectId, projectVersion);
  if (!projectOutcome.ok) {
    await (supabase.from("optimization_jobs") as any)
      .update({ status: "cancelled", completed_at: new Date().toISOString(), error: projectOutcome.error })
      .eq("id", job.id)
      .eq("status", "queued");
    return projectOutcome;
  }

  return { ok: true, jobId: job.id as string, reused: false };
}

async function markProjectOptimizing(
  supabase: Supabase,
  projectId: string,
  projectVersion: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("projects")
    .update({ status: "optimizing" })
    .eq("id", projectId)
    .eq("version", projectVersion)
    .in("status", ["draft", "optimized", "optimizing"])
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: `PROJECT_OPTIMIZING_FAILED: ${error.message}` };
  if (!data) return { ok: false, error: "PROJECT_VERSION_CONFLICT" };
  return { ok: true };
}

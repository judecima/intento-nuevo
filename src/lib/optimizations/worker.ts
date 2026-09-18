import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import type { ProjectEditorData } from "@/lib/projects/queries";
import type { OptimizerProfile, OptimizerStrategy } from "@/lib/optimizer";
import { runAndStoreOptimization } from "./run";

type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
type ProjectItemRow = Database["public"]["Tables"]["project_items"]["Row"];
type MaterialRow = Database["public"]["Tables"]["materials"]["Row"];
type JobRow = Database["public"]["Tables"]["optimization_jobs"]["Row"] & {
  profile: OptimizerProfile | null;
};

export type OptimizerWorkerOutcome =
  | { status: "idle" }
  | { status: "contended"; jobId: string }
  | { status: "completed"; jobId: string; resultId: string }
  | { status: "failed"; jobId: string; error: string };

/**
 * Consume como maximo un job por invocacion. Esto mantiene acotado el tiempo
 * de una request del worker y permite escalar con varios consumidores sin que
 * dos ejecuten el mismo job (claim queued -> running atomico).
 */
export async function processNextQueuedOptimizationJob(): Promise<OptimizerWorkerOutcome> {
  const supabase = createSupabaseAdminClient();
  const jobs = supabase.from("optimization_jobs") as any;

  const { data: candidate, error: lookupError } = await jobs
    .select("id, organization_id, project_id, project_version, strategy, profile, requested_by")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (lookupError) throw new Error(`OPTIMIZATION_WORKER_LOOKUP_FAILED: ${lookupError.message}`);
  if (!candidate) return { status: "idle" };

  const { data: claimed, error: claimError } = await jobs
    .update({ status: "running", started_at: new Date().toISOString(), error: null })
    .eq("id", candidate.id)
    .eq("status", "queued")
    .select("id, organization_id, project_id, project_version, strategy, profile, requested_by")
    .maybeSingle();

  if (claimError) throw new Error(`OPTIMIZATION_WORKER_CLAIM_FAILED: ${claimError.message}`);
  if (!claimed) return { status: "contended", jobId: candidate.id as string };

  const job = claimed as JobRow;

  try {
    const preloaded = await loadProjectForWorker(supabase, job);
    if (!preloaded) {
      const error = "PROJECT_NOT_FOUND";
      await failClaimedJob(supabase, job, error);
      return { status: "failed", jobId: job.id, error };
    }

    const outcome = await runAndStoreOptimization({
      projectId: job.project_id,
      strategy: parseStrategy(job.strategy),
      profile: parseProfile(job.profile),
      requestedBy: job.requested_by,
      preloaded,
      supabaseClient: supabase,
      existingJobId: job.id,
      existingJobClaimed: true,
      expectedProjectVersion: Number(job.project_version)
    });

    if (!outcome.ok) {
      return { status: "failed", jobId: job.id, error: outcome.error };
    }

    return { status: "completed", jobId: job.id, resultId: outcome.resultId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failClaimedJob(supabase, job, message);
    return { status: "failed", jobId: job.id, error: message };
  }
}

async function loadProjectForWorker(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  job: JobRow
): Promise<Pick<ProjectEditorData, "project" | "material" | "items"> | null> {
  const [projectResult, itemsResult] = await Promise.all([
    supabase.from("projects").select("*").eq("id", job.project_id).maybeSingle(),
    supabase
      .from("project_items")
      .select("*")
      .eq("project_id", job.project_id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
  ]);

  if (projectResult.error) throw new Error(`PROJECT_QUERY_FAILED: ${projectResult.error.message}`);
  if (itemsResult.error) throw new Error(`PROJECT_ITEMS_QUERY_FAILED: ${itemsResult.error.message}`);
  if (!projectResult.data) return null;

  const project = projectResult.data as ProjectRow;
  if (project.organization_id !== job.organization_id) {
    throw new Error("OPTIMIZATION_JOB_PROJECT_ORGANIZATION_MISMATCH");
  }

  let material: ProjectEditorData["material"] = null;
  if (project.material_id) {
    const { data, error } = await supabase
      .from("materials")
      .select("id, code, description, texture_id, image_url, width, height, thickness, has_grain")
      .eq("id", project.material_id)
      .maybeSingle();

    if (error) throw new Error(`MATERIAL_QUERY_FAILED: ${error.message}`);
    if (data) {
      const row = data as Pick<
        MaterialRow,
        "id" | "code" | "description" | "texture_id" | "image_url" | "width" | "height" | "thickness" | "has_grain"
      >;
      material = {
        ...row,
        width: Number(row.width),
        height: Number(row.height),
        thickness: Number(row.thickness),
        dimensionsLabel: `${Number(row.width)} x ${Number(row.height)}`,
        displayImageUrl: row.image_url ?? null
      };
    }
  }

  return {
    project,
    material,
    items: (itemsResult.data ?? []) as ProjectItemRow[]
  };
}

async function failClaimedJob(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  job: JobRow,
  error: string
) {
  await supabase
    .from("optimization_jobs")
    .update({ status: "failed", completed_at: new Date().toISOString(), error: error.slice(0, 2000) })
    .eq("id", job.id);

  await supabase
    .from("projects")
    .update({ status: "draft" })
    .eq("id", job.project_id)
    .eq("version", Number(job.project_version))
    .eq("status", "optimizing");
}

function parseStrategy(value: string): OptimizerStrategy {
  return value === "v10" ? "v10" : "baseline";
}

function parseProfile(value: string | null): OptimizerProfile | undefined {
  return value === "fast" || value === "balanced" || value === "deep" ? value : undefined;
}

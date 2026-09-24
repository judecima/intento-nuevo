"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUserContext } from "@/lib/auth/context";
import { canManagePlatform } from "@/lib/domain/platform";
import { getProjectEditorData } from "@/lib/projects/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function cancelOptimizationJobAction(formData: FormData): Promise<void> {
  const projectId = stringField(formData, "projectId");
  const jobId = stringField(formData, "jobId");

  if (!projectId || !jobId) return;

  const context = await getCurrentUserContext();
  const projectData = await getProjectEditorData(projectId);
  const allowed =
    Boolean(context.user) &&
    Boolean(projectData) &&
    (
      canManagePlatform(context) ||
      context.role === "customer" ||
      context.role === "seller" ||
      context.role === "admin"
    );

  if (!allowed || !projectData) {
    throw new Error("FORBIDDEN");
  }

  const supabase = createSupabaseServerClient();
  const { data: cancelled, error } = await supabase
    .from("optimization_jobs")
    .update({
      status: "cancelled",
      completed_at: new Date().toISOString(),
      error: "CANCELLED_BY_USER",
    })
    .eq("id", jobId)
    .eq("project_id", projectId)
    .eq("organization_id", projectData.project.organization_id)
    .in("status", ["queued", "running"])
    .select("id,project_version")
    .maybeSingle();

  if (error) {
    throw new Error(`OPTIMIZATION_CANCEL_FAILED: ${error.message}`);
  }

  if (!cancelled) return;

  await supabase
    .from("projects")
    .update({ status: "draft" })
    .eq("id", projectId)
    .eq("version", Number(cancelled.project_version))
    .eq("status", "optimizing");

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
}

function stringField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

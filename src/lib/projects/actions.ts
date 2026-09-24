"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/auth/context";
import { edgeFlags, summaryEdgeType } from "@/lib/domain/edge-bands";
import { positiveThicknessOrUndefined } from "@/lib/domain/materials";
import {
  canCreateProject,
  canEditProject,
  createProjectSchema,
  projectDomainErrors,
  projectDraftSchema,
  type ProjectDraft,
  type SaveProjectDraftOutcome
} from "@/lib/domain/projects";
import { canManagePlatform } from "@/lib/domain/platform";
import { scopedPath } from "@/lib/routing/server";
import { getMaterialForOrganization } from "@/lib/materials/queries";
import { customerBelongsToOrganization } from "@/lib/customers/queries";
import { getDefaultMachineCutSettings } from "@/lib/production/queries";
import { optimizationExecutionPolicy } from "@/lib/optimizations/execution-policy";
import { enqueueOptimizationJob } from "@/lib/optimizations/queue";
import { runAndStoreOptimization } from "@/lib/optimizations/run";
import { resolveOptimizerRuntimeForExecution } from "@/lib/optimizations/runtime-policy";
import { createOptimizerTimingTrace } from "@/lib/optimizations/timing";
import { getProjectEditorData } from "@/lib/projects/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];

export async function createProjectAction(formData: FormData) {
  const context = await getCurrentUserContext();

  const parsed = createProjectSchema.parse({
    materialId: stringField(formData, "materialId"),
    organizationId: stringField(formData, "organizationId") || undefined,
    customerId: stringField(formData, "customerId") || undefined,
    name: stringField(formData, "name"),
    description: stringField(formData, "description"),
    kerf: stringField(formData, "kerf"),
    trimX: stringField(formData, "trimX"),
    trimY: stringField(formData, "trimY"),
    minRemnant: stringField(formData, "minRemnant")
  });

  // El super usuario elige la organizacion destino; el resto crea en la suya.
  const platformAdmin = canManagePlatform(context);
  const organizationId =
    platformAdmin && parsed.organizationId ? parsed.organizationId : context.activeOrganization?.id;

  if (!context.user || !organizationId || !canCreateProject(context.role, { platformAdmin })) {
    throw new Error(projectDomainErrors.forbidden);
  }

  // Solo el vendedor crea el proyecto a nombre de un cliente. Admin y
  // superusuario crean proyectos propios dentro de la organizacion elegida.
  const customerId = context.role === "seller" ? parsed.customerId : undefined;
  if (context.role === "seller" && (!customerId || !(await customerBelongsToOrganization(customerId, organizationId)))) {
    throw new Error(projectDomainErrors.forbidden);
  }

  const material = await getMaterialForOrganization(organizationId, parsed.materialId);
  if (!material || material.type !== "board") {
    throw new Error(projectDomainErrors.materialNotFound);
  }

  const materialThickness = positiveThicknessOrUndefined(material) ?? 0;
  const machineSettings = await getDefaultMachineCutSettings(organizationId);
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({
      organization_id: organizationId,
      owner_id: customerId ?? context.user.id,
      created_by: context.user.id,
      name: parsed.name,
      description: parsed.description || null,
      status: "draft",
      material_id: material.id,
      board_width: material.width,
      board_height: material.height,
      board_thickness: materialThickness,
      kerf: machineSettings.kerf,
      trim_x: machineSettings.trimX,
      trim_y: machineSettings.trimY,
      min_remnant: machineSettings.minRemnant,
      min_cut_size: machineSettings.minCutSize,
      grain_enabled: material.has_grain
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`PROJECT_CREATE_FAILED: ${error.message}`);
  }

  revalidatePath("/projects");
  redirect(scopedPath(`/projects/${data.id}`));
}

export async function saveProjectDraftAction(draft: ProjectDraft): Promise<SaveProjectDraftOutcome> {
  return persistProjectDraftAction(draft, true);
}

export async function saveProjectDraftOnlyAction(draft: ProjectDraft): Promise<SaveProjectDraftOutcome> {
  return persistProjectDraftAction(draft, false);
}

async function persistProjectDraftAction(
  draft: ProjectDraft,
  optimizeAfterSave: boolean
): Promise<SaveProjectDraftOutcome> {
  const parsed = projectDraftSchema.parse(draft);
  const timing = createOptimizerTimingTrace("save-project", {
    projectId: parsed.projectId,
    optimizeAfterSave,
  });
  const context = await getCurrentUserContext();
  timing.mark("auth");

  if (!context.user) {
    return { ok: false, error: "Sesion no iniciada." };
  }

  // Cada ida y vuelta a Supabase cuesta mas que el optimizador, asi que el
  // guardado usa escrituras en lote y reusa lo que ya trajo de la base.
  const supabase = createSupabaseServerClient();
  const data = await getProjectEditorData(parsed.projectId);
  timing.mark("loadProject");

  if (!data) {
    return { ok: false, error: "No se encontro el proyecto." };
  }

  const project = data.project;

  if (!canEditProject(context.role, project.status, { platformAdmin: canManagePlatform(context) })) {
    return { ok: false, error: "El proyecto no admite cambios en su estado actual." };
  }

  if (Number(project.version) !== parsed.expectedVersion) {
    return {
      ok: false,
      conflict: true,
      error: "El proyecto cambio en otra pestania u operacion. Actualiza la pagina para ver los datos vigentes."
    };
  }

  const selectedMaterial = await getMaterialForOrganization(project.organization_id, parsed.materialId);
  timing.mark("loadMaterial");
  if (!selectedMaterial || selectedMaterial.type !== "board") {
    return { ok: false, error: "El tablero seleccionado no esta disponible." };
  }
  const selectedThickness = positiveThicknessOrUndefined(selectedMaterial) ?? 0;

  const settingsChanged =
    project.material_id !== selectedMaterial.id ||
    Number(project.board_width) !== Number(selectedMaterial.width) ||
    Number(project.board_height) !== Number(selectedMaterial.height) ||
    Number(project.board_thickness) !== selectedThickness ||
    Boolean(project.grain_enabled) !== Boolean(selectedMaterial.has_grain) ||
    project.name !== parsed.name ||
    (project.description ?? "") !== parsed.description ||
    Number(project.kerf) !== parsed.kerf ||
    Number(project.trim_x) !== parsed.trimX ||
    Number(project.trim_y) !== parsed.trimY ||
    Number(project.min_remnant) !== parsed.minRemnant ||
    Number(project.min_cut_size) !== parsed.minCutSize;

  if (settingsChanged) {
    const { error } = await supabase
      .from("projects")
      .update({
        name: parsed.name,
        description: parsed.description || null,
        material_id: selectedMaterial.id,
        board_width: selectedMaterial.width,
        board_height: selectedMaterial.height,
        board_thickness: selectedThickness,
        grain_enabled: selectedMaterial.has_grain,
        kerf: parsed.kerf,
        trim_x: parsed.trimX,
        trim_y: parsed.trimY,
        min_remnant: parsed.minRemnant,
        min_cut_size: parsed.minCutSize
      })
      .eq("id", parsed.projectId);

    if (error) return { ok: false, error: `PROJECT_UPDATE_FAILED: ${error.message}` };
  }
  timing.mark("saveSettings");

  const existingIds = new Set(data.items.map((item) => item.id));
  const rows = parsed.items.map((item, index) => ({
    id: item.id && existingIds.has(item.id) ? item.id : randomUUID(),
    project_id: parsed.projectId,
    reference: item.reference,
    description: item.description || null,
    quantity: item.quantity,
    width: item.width,
    height: item.height,
    grain: item.grain,
    can_rotate: item.canRotate,
    // Los booleanos y edge_type son derivados: la fuente de verdad es el tipo
    // de cada lado. Se guardan igual para los lectores que todavia los usan.
    edge_top: edgeFlags(item).edgeTop,
    edge_bottom: edgeFlags(item).edgeBottom,
    edge_left: edgeFlags(item).edgeLeft,
    edge_right: edgeFlags(item).edgeRight,
    edge_type: summaryEdgeType(item),
    edge_top_type: item.edgeTopType,
    edge_bottom_type: item.edgeBottomType,
    edge_left_type: item.edgeLeftType,
    edge_right_type: item.edgeRightType,
    sort_order: (index + 1) * 10
  }));

  const keptIds = new Set(rows.map((row) => row.id));
  const removedIds = [...existingIds].filter((id) => !keptIds.has(id));

  const [upsertResult, deleteResult] = await Promise.all([
    rows.length > 0
      ? supabase.from("project_items").upsert(rows, { onConflict: "id" })
      : Promise.resolve({ error: null }),
    removedIds.length > 0
      ? supabase.from("project_items").delete().eq("project_id", parsed.projectId).in("id", removedIds)
      : Promise.resolve({ error: null })
  ]);

  if (upsertResult.error) {
    return { ok: false, error: `PROJECT_ITEM_SAVE_FAILED: ${upsertResult.error.message}` };
  }

  if (deleteResult.error) {
    return { ok: false, error: `PROJECT_ITEM_DELETE_FAILED: ${deleteResult.error.message}` };
  }
  timing.mark("saveItems");

  // Los triggers de project_items suben la version una vez por fila escrita.
  const { data: refreshed, error: versionError } = await supabase
    .from("projects")
    .select("version")
    .eq("id", parsed.projectId)
    .maybeSingle();

  if (versionError) {
    return { ok: false, error: `PROJECT_VERSION_QUERY_FAILED: ${versionError.message}` };
  }
  timing.mark("loadVersion");

  const version = Number(refreshed?.version ?? project.version);
  const preloaded = {
    project: {
      ...project,
      material_id: selectedMaterial.id,
      name: parsed.name,
      description: parsed.description || null,
      board_width: selectedMaterial.width,
      board_height: selectedMaterial.height,
      board_thickness: selectedThickness,
      kerf: parsed.kerf,
      trim_x: parsed.trimX,
      trim_y: parsed.trimY,
      min_remnant: parsed.minRemnant,
      min_cut_size: parsed.minCutSize,
      grain_enabled: selectedMaterial.has_grain,
      version
    },
    material: selectedMaterial,
    items: rows.map((row) => ({
      ...row,
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }))
  };

  let optimization: { ok: boolean; error?: string } = {
    ok: false,
    error: optimizeAfterSave ? "OPTIMIZATION_NO_ITEMS" : "NOT_REQUESTED"
  };

  let executionMode: "inline" | "queued-worker" | null = null;
  if (optimizeAfterSave && rows.length > 0) {
    const policy = optimizationExecutionPolicy(rows);
    executionMode = policy.mode;

    if (policy.mode === "inline") {
      const runtime = resolveOptimizerRuntimeForExecution({
        strategy: parsed.strategy,
        queuedWorker: false,
        rolloutKey: parsed.projectId,
      });
      optimization = await runAndStoreOptimization({
        projectId: parsed.projectId,
        strategy: parsed.strategy,
        profile: parsed.profile,
        requestedBy: context.user.id,
        preloaded,
        patternGenerator: runtime.patternGenerator,
        motorVersion: runtime.motorVersion,
        effortMode: runtime.effortMode
      });
    } else {
      const runtime = resolveOptimizerRuntimeForExecution({
        strategy: parsed.strategy,
        queuedWorker: true,
        rolloutKey: parsed.projectId,
      });
      optimization = await enqueueOptimizationJob({
        supabase,
        organizationId: project.organization_id,
        projectId: parsed.projectId,
        projectVersion: version,
        strategy: parsed.strategy,
        profile: parsed.profile,
        requestedBy: context.user.id,
        algorithmVersion: runtime.algorithmVersion
      });
    }
    timing.mark(executionMode === "inline" ? "optimizationInline" : "enqueueOptimization");
  }

  revalidateProject(parsed.projectId);
  timing.mark("revalidate");
  timing.log({
    ok: true,
    executionMode,
    optimizationOk: optimization.ok,
    itemRows: rows.length,
  });

  return {
    ok: true,
    version,
    optimization: optimization.ok ? { ok: true } : { ok: false, error: optimization.error }
  };
}

function revalidateProject(projectId: string) {
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
}

function stringField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

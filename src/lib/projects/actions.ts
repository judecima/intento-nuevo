"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/auth/context";
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
import { getMaterialForOrganization } from "@/lib/materials/queries";
import { runAndStoreOptimization } from "@/lib/optimizations/run";
import { getProjectEditorData } from "@/lib/projects/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];

export async function createProjectAction(formData: FormData) {
  const context = await getCurrentUserContext();

  const parsed = createProjectSchema.parse({
    materialId: stringField(formData, "materialId"),
    organizationId: stringField(formData, "organizationId") || undefined,
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

  const material = await getMaterialForOrganization(organizationId, parsed.materialId);
  if (!material || material.type !== "board") {
    throw new Error(projectDomainErrors.materialNotFound);
  }

  const materialThickness = positiveThicknessOrUndefined(material) ?? 0;
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({
      organization_id: organizationId,
      owner_id: context.user.id,
      name: parsed.name,
      description: parsed.description || null,
      status: "draft",
      material_id: material.id,
      board_width: material.width,
      board_height: material.height,
      board_thickness: materialThickness,
      kerf: parsed.kerf,
      trim_x: parsed.trimX,
      trim_y: parsed.trimY,
      min_remnant: parsed.minRemnant,
      grain_enabled: material.has_grain
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`PROJECT_CREATE_FAILED: ${error.message}`);
  }

  revalidatePath("/projects");
  redirect(`/projects/${data.id}`);
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
  const context = await getCurrentUserContext();

  if (!context.user) {
    return { ok: false, error: "Sesion no iniciada." };
  }

  // Cada ida y vuelta a Supabase cuesta mas que el optimizador, asi que el
  // guardado usa escrituras en lote y reusa lo que ya trajo de la base.
  const supabase = createSupabaseServerClient();
  const data = await getProjectEditorData(parsed.projectId);

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
    Number(project.min_remnant) !== parsed.minRemnant;

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
        min_remnant: parsed.minRemnant
      })
      .eq("id", parsed.projectId);

    if (error) return { ok: false, error: `PROJECT_UPDATE_FAILED: ${error.message}` };
  }

  const existingIds = new Set(data.items.map((item) => item.id));
  const rows = parsed.items.map((item, index) => ({
    // Las filas nuevas llevan id generado aca para poder escribirlas en lote.
    id: item.id && existingIds.has(item.id) ? item.id : randomUUID(),
    project_id: parsed.projectId,
    reference: item.reference,
    description: item.description || null,
    quantity: item.quantity,
    width: item.width,
    height: item.height,
    grain: item.grain,
    can_rotate: item.canRotate,
    edge_top: item.edgeTop,
    edge_bottom: item.edgeBottom,
    edge_left: item.edgeLeft,
    edge_right: item.edgeRight,
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

  // Los triggers de project_items suben la version una vez por fila escrita.
  const { data: refreshed, error: versionError } = await supabase
    .from("projects")
    .select("version")
    .eq("id", parsed.projectId)
    .maybeSingle();

  if (versionError) {
    return { ok: false, error: `PROJECT_VERSION_QUERY_FAILED: ${versionError.message}` };
  }

  const version = Number(refreshed?.version ?? project.version);

  const optimization =
    optimizeAfterSave && rows.length > 0
      ? await runAndStoreOptimization({
          projectId: parsed.projectId,
          strategy: parsed.strategy,
          profile: parsed.profile,
          requestedBy: context.user.id,
          // Ya tenemos proyecto, material y piezas: evita releer todo.
          preloaded: {
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
          }
        })
      : { ok: false as const, error: optimizeAfterSave ? "OPTIMIZATION_NO_ITEMS" : "NOT_REQUESTED" };

  revalidateProject(parsed.projectId);

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

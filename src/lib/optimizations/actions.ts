"use server";

import { getCurrentUserContext } from "@/lib/auth/context";
import { canEditProject, projectDraftSchema, type ProjectDraft } from "@/lib/domain/projects";
import { canManagePlatform } from "@/lib/domain/platform";
import { getMaterialForOrganization } from "@/lib/materials/queries";
import { getProjectEditorData } from "@/lib/projects/queries";
import { optimizeProject } from "@/lib/optimizer";
import { cutPlanViewFromResult, type CutPlanView } from "./plan-view";
import { buildOptimizationInputFromDraft } from "./project-input";
import { describeValidation } from "./run";

export type PreviewOptimizationOutcome =
  | { ok: true; plan: CutPlanView }
  | { ok: false; error: string };

/**
 * Corre el optimizador con lo que el usuario tiene en pantalla, sin tocar la
 * base. Permite probar cambios de medidas o cantidades antes de guardarlos.
 */
export async function previewProjectOptimizationAction(draft: ProjectDraft): Promise<PreviewOptimizationOutcome> {
  const parsed = projectDraftSchema.parse(draft);
  const context = await getCurrentUserContext();
  const data = await getProjectEditorData(parsed.projectId);

  if (!context.user || !data) {
    return { ok: false, error: "No se encontro el proyecto." };
  }

  if (!canEditProject(context.role, data.project.status, { platformAdmin: canManagePlatform(context) })) {
    return { ok: false, error: "No tenes permisos para optimizar este proyecto." };
  }

  if (parsed.items.length === 0) {
    return { ok: false, error: "Carga al menos una pieza antes de optimizar." };
  }

  const material = await getMaterialForOrganization(data.project.organization_id, parsed.materialId);
  if (!material || material.type !== "board") {
    return { ok: false, error: "El tablero seleccionado no esta disponible." };
  }

  try {
    const input = buildOptimizationInputFromDraft({
      project: data.project,
      material,
      draft: parsed,
      profile: parsed.profile
    });
    const result = optimizeProject(input);

    if (!result.validation.ok) {
      return { ok: false, error: describeValidation(result) };
    }

    return {
      ok: true,
      plan: cutPlanViewFromResult(result, {
        strategy: parsed.strategy,
        project: {
          version: input.projectVersion ?? Number(data.project.version),
          board_width: input.board.width,
          board_height: input.board.height,
          board_thickness: input.board.thickness ?? 0,
          kerf: input.kerf,
          trim_x: input.trim.x,
          trim_y: input.trim.y,
          min_remnant: input.constraints.minRemnant,
          grain_enabled: input.material.hasGrain
        },
        material: { code: input.material.code ?? null, description: input.material.description }
      })
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

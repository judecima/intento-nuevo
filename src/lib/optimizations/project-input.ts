import type { Database } from "@/lib/supabase/database.types";
import { positiveThicknessOrUndefined } from "@/lib/domain/materials";
import type { ProjectDraft } from "@/lib/domain/projects";
import type { OptimizationInput, OptimizerProfile, OptimizerStrategy } from "@/lib/optimizer";

type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
type ProjectItemRow = Database["public"]["Tables"]["project_items"]["Row"];
type MaterialRow = Database["public"]["Tables"]["materials"]["Row"];
type ProjectForOptimization = Pick<
  ProjectRow,
  "id" | "version" | "material_id" | "board_width" | "board_height" | "board_thickness" | "kerf" | "trim_x" | "trim_y" | "min_remnant" | "grain_enabled"
>;
type MaterialForOptimization = Pick<MaterialRow, "id" | "code" | "description" | "thickness" | "has_grain"> | null;
type BoardMaterialForDraft = Pick<
  MaterialRow,
  "id" | "code" | "description" | "width" | "height" | "thickness" | "has_grain"
>;

export function optimizerProfileForStrategy(strategy: OptimizerStrategy): OptimizerProfile {
  return strategy === "baseline" ? "fast" : "balanced";
}

export function buildOptimizationInputFromProject({
  project,
  material,
  items,
  profile,
  strategy = "baseline"
}: {
  project: ProjectForOptimization;
  material: MaterialForOptimization;
  items: ProjectItemRow[];
  profile?: OptimizerProfile;
  strategy?: OptimizerStrategy;
}): OptimizationInput {
  const boardThickness = positiveThicknessOrUndefined({
    description: material?.description,
    thickness: Number(project.board_thickness)
  });
  const materialThickness = positiveThicknessOrUndefined({
    description: material?.description,
    thickness: material?.thickness ?? project.board_thickness
  });

  return {
    projectId: project.id,
    projectVersion: Number(project.version),
    strategy,
    board: {
      width: Number(project.board_width),
      height: Number(project.board_height),
      ...(boardThickness ? { thickness: boardThickness } : {})
    },
    material: {
      id: material?.id ?? project.material_id,
      code: material?.code ?? undefined,
      description: material?.description ?? "Material snapshot",
      hasGrain: Boolean(project.grain_enabled || material?.has_grain),
      ...(materialThickness ? { thickness: materialThickness } : {})
    },
    kerf: Number(project.kerf),
    trim: {
      x: Number(project.trim_x),
      y: Number(project.trim_y)
    },
    constraints: optimizationConstraints({
      profile: profile ?? optimizerProfileForStrategy(strategy),
      minRemnant: Number(project.min_remnant)
    }),
    pieces: items.map((item) => ({
      id: item.id,
      reference: item.reference,
      description: item.description ?? "",
      quantity: Number(item.quantity),
      width: Number(item.width),
      height: Number(item.height),
      grain: Boolean(item.grain),
      canRotate: Boolean(item.can_rotate),
      edges: {
        top: Boolean(item.edge_top),
        bottom: Boolean(item.edge_bottom),
        left: Boolean(item.edge_left),
        right: Boolean(item.edge_right)
      },
      metadata: {
        sortOrder: Number(item.sort_order)
      }
    }))
  };
}

export function buildOptimizationInputFromDraft({
  project,
  material,
  draft,
  profile
}: {
  project: Pick<ProjectRow, "id" | "version">;
  material: BoardMaterialForDraft;
  draft: ProjectDraft;
  profile?: OptimizerProfile;
}): OptimizationInput {
  const thickness = positiveThicknessOrUndefined({
    description: material.description,
    thickness: material.thickness
  });
  const resolvedProfile = profile ?? optimizerProfileForStrategy(draft.strategy);

  return {
    projectId: project.id,
    projectVersion: Number(project.version),
    strategy: draft.strategy,
    board: {
      width: Number(material.width),
      height: Number(material.height),
      ...(thickness ? { thickness } : {})
    },
    material: {
      id: material.id,
      code: material.code ?? undefined,
      description: material.description,
      hasGrain: Boolean(material.has_grain),
      ...(thickness ? { thickness } : {})
    },
    kerf: draft.kerf,
    trim: {
      x: draft.trimX,
      y: draft.trimY
    },
    constraints: optimizationConstraints({
      profile: resolvedProfile,
      minRemnant: draft.minRemnant
    }),
    pieces: draft.items.map((item, index) => ({
      id: item.id,
      reference: item.reference,
      description: item.description,
      quantity: item.quantity,
      width: item.width,
      height: item.height,
      grain: item.grain,
      canRotate: item.canRotate,
      edges: {
        top: item.edgeTop,
        bottom: item.edgeBottom,
        left: item.edgeLeft,
        right: item.edgeRight
      },
      metadata: {
        sortOrder: (index + 1) * 10
      }
    }))
  };
}

function optimizationConstraints({
  profile,
  minRemnant
}: {
  profile: OptimizerProfile;
  minRemnant: number;
}): OptimizationInput["constraints"] {
  return {
    profile,
    stages: 4,
    minRemnant,
    minCommercialRemnantLongSide: Math.max(minRemnant, 400)
  };
}

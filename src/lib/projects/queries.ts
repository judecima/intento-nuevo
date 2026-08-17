import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { formatMaterialDimensions, textureThumbnailUrl } from "@/lib/domain/materials";

export type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
export type ProjectItemRow = Database["public"]["Tables"]["project_items"]["Row"];
type MaterialRow = Database["public"]["Tables"]["materials"]["Row"];

export type ProjectListItem = ProjectRow & {
  material: Pick<MaterialRow, "id" | "code" | "description" | "texture_id" | "image_url"> | null;
  itemCount: number;
  totalPieces: number;
};

export type ProjectEditorData = {
  project: ProjectRow;
  material:
    | (Pick<
        MaterialRow,
        "id" | "code" | "description" | "texture_id" | "image_url" | "width" | "height" | "thickness" | "has_grain"
      > & {
        dimensionsLabel: string;
        displayImageUrl: string | null;
      })
    | null;
  items: ProjectItemRow[];
  metrics: {
    itemRows: number;
    totalPieces: number;
    totalAreaM2: number;
  };
};

type ProjectListQueryRow = ProjectRow & {
  materials:
    | Pick<MaterialRow, "id" | "code" | "description" | "texture_id" | "image_url">
    | Array<Pick<MaterialRow, "id" | "code" | "description" | "texture_id" | "image_url">>
    | null;
  project_items: Array<Pick<ProjectItemRow, "quantity">> | null;
};

type ProjectEditorQueryRow = ProjectRow & {
  materials:
    | Pick<
        MaterialRow,
        "id" | "code" | "description" | "texture_id" | "image_url" | "width" | "height" | "thickness" | "has_grain"
      >
    | Array<
        Pick<
          MaterialRow,
          "id" | "code" | "description" | "texture_id" | "image_url" | "width" | "height" | "thickness" | "has_grain"
        >
      >
    | null;
};

export async function listProjectsForOrganization(organizationId: string): Promise<ProjectListItem[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("projects")
    .select(
      "*, materials(id, code, description, texture_id, image_url), project_items(quantity)"
    )
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(`PROJECTS_QUERY_FAILED: ${error.message}`);
  }

  return ((data ?? []) as unknown as ProjectListQueryRow[]).map((row) => {
    const items = row.project_items ?? [];

    return {
      ...coerceProjectRow(row),
      material: firstRelation(row.materials),
      itemCount: items.length,
      totalPieces: items.reduce((sum, item) => sum + Number(item.quantity), 0)
    };
  });
}

export async function getProjectEditorData(projectId: string): Promise<ProjectEditorData | null> {
  const supabase = createSupabaseServerClient();
  const [projectResult, itemsResult] = await Promise.all([
    supabase
      .from("projects")
      .select("*, materials(id, code, description, texture_id, image_url, width, height, thickness, has_grain)")
      .eq("id", projectId)
      .maybeSingle(),
    supabase
      .from("project_items")
      .select("*")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
  ]);

  if (projectResult.error) {
    throw new Error(`PROJECT_QUERY_FAILED: ${projectResult.error.message}`);
  }

  if (itemsResult.error) {
    throw new Error(`PROJECT_ITEMS_QUERY_FAILED: ${itemsResult.error.message}`);
  }

  if (!projectResult.data) return null;

  const projectRow = projectResult.data as unknown as ProjectEditorQueryRow;
  const items = ((itemsResult.data ?? []) as ProjectItemRow[]).map(coerceProjectItemRow);
  const material = normalizeMaterial(firstRelation(projectRow.materials));

  return {
    project: coerceProjectRow(projectRow),
    material,
    items,
    metrics: {
      itemRows: items.length,
      totalPieces: items.reduce((sum, item) => sum + Number(item.quantity), 0),
      totalAreaM2: items.reduce(
        (sum, item) => sum + (Number(item.width) * Number(item.height) * Number(item.quantity)) / 1_000_000,
        0
      )
    }
  };
}

function coerceProjectRow(row: ProjectRow): ProjectRow {
  return {
    ...row,
    board_width: Number(row.board_width),
    board_height: Number(row.board_height),
    board_thickness: Number(row.board_thickness),
    kerf: Number(row.kerf),
    trim_x: Number(row.trim_x),
    trim_y: Number(row.trim_y),
    min_remnant: Number(row.min_remnant),
    version: Number(row.version)
  };
}

function coerceProjectItemRow(row: ProjectItemRow): ProjectItemRow {
  return {
    ...row,
    quantity: Number(row.quantity),
    width: Number(row.width),
    height: Number(row.height),
    sort_order: Number(row.sort_order)
  };
}

function normalizeMaterial(
  material:
    | Pick<
        MaterialRow,
        "id" | "code" | "description" | "texture_id" | "image_url" | "width" | "height" | "thickness" | "has_grain"
      >
    | null
) {
  if (!material) return null;

  const normalized = {
    ...material,
    width: Number(material.width),
    height: Number(material.height),
    thickness: Number(material.thickness)
  };

  return {
    ...normalized,
    dimensionsLabel: formatMaterialDimensions(normalized),
    displayImageUrl: normalized.image_url ?? textureThumbnailUrl(normalized.texture_id)
  };
}

function firstRelation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

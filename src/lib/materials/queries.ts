import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import {
  defaultMaterialFilters,
  formatMaterialDimensions,
  materialFilterSchema,
  positiveThicknessOrUndefined,
  textureThumbnailUrl,
  type MaterialFilters
} from "@/lib/domain/materials";

export type MaterialRow = Database["public"]["Tables"]["materials"]["Row"];

export type MaterialListItem = MaterialRow & {
  dimensionsLabel: string;
  displayImageUrl: string | null;
};

export type MaterialFacetOptions = {
  thicknesses: number[];
  sizes: Array<{
    value: string;
    label: string;
  }>;
};

export type MaterialSearchParams = Record<string, string | string[] | undefined> | undefined;

export function materialFiltersFromSearchParams(searchParams: MaterialSearchParams): MaterialFilters {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

  // La query string la edita el usuario: un valor invalido cae a los filtros
  // por defecto en vez de tumbar la pantalla del catalogo.
  const parsed = materialFilterSchema.safeParse({
    q: first(searchParams?.q),
    kind: first(searchParams?.kind),
    thickness: first(searchParams?.thickness),
    size: first(searchParams?.size),
    grain: first(searchParams?.grain)
  });

  return parsed.success ? parsed.data : defaultMaterialFilters;
}

export async function listMaterialsForOrganization(
  organizationId: string,
  filters: MaterialFilters,
  displayLimit = 120
): Promise<{
  materials: MaterialListItem[];
  facets: MaterialFacetOptions;
  matchingCount: number;
  sourceCount: number;
}> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("materials")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("enabled", true)
    .order("description", { ascending: true })
    .limit(1000);

  if (error) {
    throw new Error(`MATERIALS_QUERY_FAILED: ${error.message}`);
  }

  const source = ((data ?? []) as MaterialRow[]).map(toMaterialListItem);
  const facetSource = source.filter((material) => material.type === filters.kind);
  const filtered = source.filter((material) => matchesFilters(material, filters));

  return {
    materials: filtered.slice(0, displayLimit),
    facets: buildFacetOptions(facetSource),
    matchingCount: filtered.length,
    sourceCount: source.length
  };
}

export async function listBoardMaterialsForOrganization(
  organizationId: string,
  // El catalogo legado ronda los 450 tableros y el selector los filtra en el
  // cliente: traerlos todos evita que falten opciones en el modal.
  limit = 1000
): Promise<MaterialListItem[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("materials")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("enabled", true)
    .eq("type", "board")
    .order("description", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`BOARD_MATERIALS_QUERY_FAILED: ${error.message}`);
  }

  return ((data ?? []) as MaterialRow[]).map(toMaterialListItem);
}

export async function getMaterialForOrganization(
  organizationId: string,
  materialId: string
): Promise<MaterialListItem | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("materials")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", materialId)
    .eq("enabled", true)
    .maybeSingle();

  if (error) {
    throw new Error(`MATERIAL_QUERY_FAILED: ${error.message}`);
  }

  return data ? toMaterialListItem(data as MaterialRow) : null;
}

export async function getMaterialByIdForOrganization(organizationId: string, materialId: string): Promise<MaterialListItem | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("materials")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", materialId)
    .maybeSingle();

  if (error) throw new Error(`MATERIAL_QUERY_FAILED: ${error.message}`);
  return data ? toMaterialListItem(data as MaterialRow) : null;
}

export function buildFacetOptions(materials: MaterialListItem[]): MaterialFacetOptions {
  const thicknesses = [...new Set(materials.map((material) => material.thickness))]
    .filter((thickness) => thickness > 0)
    .sort((a, b) => a - b);

  const sizes = [...new Map(materials.map((material) => [sizeValue(material), sizeOption(material)])).values()].sort(
    (a, b) => a.label.localeCompare(b.label)
  );

  return { thicknesses, sizes };
}

function toMaterialListItem(material: MaterialRow): MaterialListItem {
  const numericThickness = Number(material.thickness);
  const normalized = {
    ...material,
    width: Number(material.width),
    height: Number(material.height),
    thickness: positiveThicknessOrUndefined({
      description: material.description,
      thickness: numericThickness
    }) ?? numericThickness,
    price_m2: Number(material.price_m2),
    ref_x: Number(material.ref_x),
    ref_y: Number(material.ref_y),
    min_cut: Number(material.min_cut)
  };

  return {
    ...normalized,
    dimensionsLabel: formatMaterialDimensions(normalized),
    displayImageUrl: normalized.image_url ?? textureThumbnailUrl(normalized.texture_id)
  };
}

function matchesFilters(material: MaterialListItem, filters: MaterialFilters): boolean {
  if (material.type !== filters.kind) return false;
  if (filters.thickness && material.thickness !== filters.thickness) return false;
  if (filters.size && sizeValue(material) !== filters.size) return false;
  if (filters.grain === "yes" && !material.has_grain) return false;
  if (filters.grain === "no" && material.has_grain) return false;

  const query = filters.q.toLowerCase();
  if (!query) return true;

  return [material.code, material.code_ext, material.description, material.texture_id?.toString()]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query));
}

function sizeValue(material: Pick<MaterialRow, "width" | "height">): string {
  return `${material.width}x${material.height}`;
}

function sizeOption(material: MaterialListItem) {
  return {
    value: sizeValue(material),
    label: `${material.width} x ${material.height} mm`
  };
}

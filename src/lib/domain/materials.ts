import { z } from "zod";

export const materialKinds = ["board", "edge_band", "other"] as const;
export type MaterialKind = (typeof materialKinds)[number];

export const materialKindLabels: Record<MaterialKind, string> = {
  board: "Tablero",
  edge_band: "Tapacanto",
  other: "Otro"
};

/**
 * Los filtros llegan de la query string, donde "sin filtro" viaja como cadena
 * vacia (`?thickness=`). Sin este paso previo, `z.coerce.number()` la convierte
 * en 0 y `.positive()` rompe la pagina al elegir "Todos".
 */
const dropEmptyValues = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      ([, entry]) => entry !== "" && entry !== null && entry !== undefined
    )
  );
};

export const materialFilterSchema = z.preprocess(
  dropEmptyValues,
  z.object({
    q: z.string().trim().optional().default(""),
    kind: z.enum(materialKinds).optional().default("board"),
    thickness: z.coerce.number().positive().optional(),
    size: z.string().trim().optional().default(""),
    grain: z.enum(["all", "yes", "no"]).optional().default("all")
  })
);

export const defaultMaterialFilters: MaterialFilters = {
  q: "",
  kind: "board",
  thickness: undefined,
  size: "",
  grain: "all"
};

export type MaterialFilters = z.infer<typeof materialFilterSchema>;

export const legacyMaterialSchema = z.object({
  id: z.number().int(),
  idEmpresa: z.number().int().optional(),
  idTextura: z.number().int().nullable().optional(),
  code: z.string(),
  codeExt: z.string().nullable().optional(),
  description: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
  thickness: z.number().nonnegative(),
  hasGrain: z.boolean(),
  priceM2: z.number().nonnegative().optional().default(0),
  refX: z.number().nonnegative().optional().default(0),
  refY: z.number().nonnegative().optional().default(0),
  min_corte: z.number().nonnegative().optional().default(0)
});

export type LegacyMaterial = z.infer<typeof legacyMaterialSchema>;

const textureBaseUrl = "https://optionline-prod-files.s3.amazonaws.com";
const boardKeywords = /AGL|CHAPADUR|FENOLICO|MDF|MDP|MELAMINA|PLAC|TERCIADO/i;
const edgeBandKeywords = /TAPACANTO|TAPA\s*CANTO|CANTO\s*(ABS|PVC)?|FILO|BORDE/i;

export function textureThumbnailUrl(textureId: number | null | undefined): string | null {
  if (!textureId || textureId <= 0) return null;
  return `${textureBaseUrl}/6-${textureId}-thumbnail.jpg`;
}

export function inferThicknessFromDescription(description: string): number | null {
  const matches = [...description.matchAll(/(\d+(?:[.,]\d+)?)\s*MM\b/gi)];
  if (!matches.length) return null;
  const lastMatch = matches[matches.length - 1]?.[1];
  if (!lastMatch) return null;
  return Number(lastMatch.replace(",", "."));
}

export function normalizeLegacyThickness(material: Pick<LegacyMaterial, "description" | "thickness">) {
  const inferred = inferThicknessFromDescription(material.description);

  if (inferred && material.thickness > 0 && material.thickness < 6 && inferred >= 6) {
    return {
      thickness: inferred,
      normalized: true,
      inferredFromDescription: inferred,
      rawThickness: material.thickness
    };
  }

  return {
    thickness: material.thickness,
    normalized: false,
    inferredFromDescription: inferred,
    rawThickness: material.thickness
  };
}

export function positiveThicknessOrUndefined(material: {
  description?: string | null;
  thickness?: number | null;
}): number | undefined {
  const thickness = Number(material.thickness);
  if (Number.isFinite(thickness) && thickness > 0) return thickness;

  const inferred = material.description ? inferThicknessFromDescription(material.description) : null;
  return inferred && inferred > 0 ? inferred : undefined;
}

export function classifyLegacyMaterial(material: Pick<LegacyMaterial, "description" | "width" | "height">): MaterialKind {
  if (edgeBandKeywords.test(material.description)) return "edge_band";

  if (Math.min(material.width, material.height) < 500 && !boardKeywords.test(material.description)) {
    return "other";
  }

  return "board";
}

export function formatMillimeters(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1).replace(/\.0$/, "");
}

export function formatMaterialDimensions(material: {
  width: number;
  height: number;
  thickness: number;
}) {
  return `${formatMillimeters(material.width)} x ${formatMillimeters(material.height)} x ${formatMillimeters(
    material.thickness
  )} mm`;
}

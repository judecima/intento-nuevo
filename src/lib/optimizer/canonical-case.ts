import { optimizationInputSchema } from "./schema";
import type { OptimizationEdgeBandType, OptimizationInput } from "./types";

export type CanonicalCaseSource = "optimization-input" | "xml-project" | "xml-order";
export type CanonicalGrainSource = "optimization-input" | "xml" | "material-inference" | "unknown";
export type CanonicalRotationSource = "optimization-input" | "xml" | "grain-rule" | "unknown";

export interface CanonicalPanel {
  width: number;
  height: number;
  thickness?: number;
}

export interface CanonicalTrim {
  x: number;
  y: number;
}

export interface CanonicalMaterial {
  id?: string;
  code?: string;
  description: string;
  hasGrain: boolean | null;
  grainSource: CanonicalGrainSource;
  grainConfidence?: number;
  rawGrain?: string;
  thickness?: number;
}

export interface CanonicalPieceEdges {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
}

export interface CanonicalOptimizationPiece {
  reference: string;
  description?: string;
  width: number;
  height: number;
  quantity: number;
  grain: boolean | null;
  grainSource: CanonicalGrainSource;
  grainConfidence?: number;
  rawGrain?: string;
  rotationAllowed: boolean | null;
  rotationSource: CanonicalRotationSource;
  family?: string;
  edges: CanonicalPieceEdges;
  edgeType?: OptimizationEdgeBandType;
}

export interface CanonicalOptimizationCase {
  source: CanonicalCaseSource;
  panel: CanonicalPanel;
  trim: CanonicalTrim;
  kerf: number;
  material: CanonicalMaterial;
  constraints: {
    stages?: number;
    minRemnant: number;
    minCommercialRemnantLongSide?: number;
  };
  pieces: CanonicalOptimizationPiece[];
}

export function canonicalizeOptimizationInput(input: OptimizationInput): CanonicalOptimizationCase {
  const parsed = optimizationInputSchema.parse(input);
  const pieces = parsed.pieces.map(toCanonicalPiece).sort(compareCanonicalPieces);

  return stripUndefined({
    source: "optimization-input",
    panel: {
      width: parsed.board.width,
      height: parsed.board.height,
      thickness: parsed.board.thickness
    },
    trim: {
      x: parsed.trim.x,
      y: parsed.trim.y
    },
    kerf: parsed.kerf,
    material: {
      id: parsed.material.id,
      code: parsed.material.code,
      description: parsed.material.description,
      hasGrain: parsed.material.hasGrain,
      grainSource: "optimization-input",
      grainConfidence: 1,
      thickness: parsed.material.thickness
    },
    constraints: {
      stages: parsed.constraints.stages,
      minRemnant: parsed.constraints.minRemnant,
      minCommercialRemnantLongSide: parsed.constraints.minCommercialRemnantLongSide
    },
    pieces
  });
}

export function normalizeCanonicalOptimizationCase(value: CanonicalOptimizationCase): CanonicalOptimizationCase {
  return stripUndefined({
    ...value,
    pieces: value.pieces.slice().sort(compareCanonicalPieces)
  });
}

export function serializeCanonicalOptimizationCase(value: CanonicalOptimizationCase): string {
  return stableStringify(stripUndefined(value));
}

function toCanonicalPiece(piece: OptimizationInput["pieces"][number]): CanonicalOptimizationPiece {
  return stripUndefined({
    reference: piece.reference,
    description: piece.description,
    width: piece.width,
    height: piece.height,
    quantity: piece.quantity,
    grain: Boolean(piece.grain),
    grainSource: "optimization-input",
    grainConfidence: 1,
    rotationAllowed: piece.canRotate !== false,
    rotationSource: "optimization-input",
    family: metadataString(piece.metadata, "family"),
    edges: {
      top: Boolean(piece.edges?.top),
      bottom: Boolean(piece.edges?.bottom),
      left: Boolean(piece.edges?.left),
      right: Boolean(piece.edges?.right)
    },
    edgeType: piece.edgeType
  });
}

function compareCanonicalPieces(a: CanonicalOptimizationPiece, b: CanonicalOptimizationPiece): number {
  return stableStringify(a).localeCompare(stableStringify(b));
}

function metadataString(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripUndefined) as T;
  if (!value || typeof value !== "object") return value;

  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (nested === undefined) continue;
    out[key] = stripUndefined(nested);
  }

  return out as T;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

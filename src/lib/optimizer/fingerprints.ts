import { createHash } from "node:crypto";

import type { CanonicalOptimizationCase, CanonicalOptimizationPiece } from "./canonical-case";

/**
 * Version del esquema del exact fingerprint. Forma parte de la entrada del hash para que
 * un cambio de esquema nunca reutilice hashes viejos por accidente.
 */
export const EXACT_FINGERPRINT_VERSION = "experience-exact-v1";

export interface ExactFingerprintOptions {
  /** Solo para pruebas y migraciones: permite calcular el hash con otra version. */
  version?: string;
}

type TriState = "true" | "false" | "unknown";

interface ExactPiece {
  width: number;
  height: number;
  quantity: number;
  grain: TriState;
  rotationAllowed: TriState;
  edges: { top: boolean; bottom: boolean; left: boolean; right: boolean };
  edgeType: string | null;
}

interface ExactProblem {
  panel: { width: number; height: number; thickness: number | null };
  trim: { x: number; y: number };
  kerf: number;
  material: { code: string | null; description: string; hasGrain: TriState; thickness: number | null };
  constraints: { stages: number | null; minRemnant: number; minCommercialRemnantLongSide: number | null };
  pieces: ExactPiece[];
}

/**
 * Identidad exacta del problema de optimizacion.
 *
 * Incluye todo lo que cambia el problema: tablero, refilado, kerf, material, veta del
 * material, restricciones y, por cada pieza, dimensiones, cantidad, veta, rotacion,
 * cantos y tipo de canto.
 *
 * Deja afuera lo que solo identifica al pedido y no cambia la geometria ni la
 * factibilidad: el origen del caso, los codigos/descripciones/familia de pieza, el id
 * interno del material y la procedencia de la veta (grainSource, grainConfidence,
 * rawGrain, rotationSource). Dos pedidos con la misma geometria y las mismas
 * restricciones son el mismo problema aunque etiqueten distinto sus piezas.
 *
 * La veta y la rotacion se codifican con tres estados explicitos: "unknown" nunca
 * equivale a "false".
 */
export function exactFingerprint(value: CanonicalOptimizationCase, options: ExactFingerprintOptions = {}): string {
  return createHash("sha256").update(exactFingerprintPayload(value, options), "utf8").digest("hex");
}

/** Entrada exacta del hash. Expuesta para poder auditarla y diffearla sin recalcular. */
export function exactFingerprintPayload(
  value: CanonicalOptimizationCase,
  options: ExactFingerprintOptions = {}
): string {
  return stableStringify({
    version: options.version ?? EXACT_FINGERPRINT_VERSION,
    problem: exactProblem(value)
  });
}

function exactProblem(value: CanonicalOptimizationCase): ExactProblem {
  return {
    panel: {
      width: num(value.panel.width),
      height: num(value.panel.height),
      thickness: optionalNum(value.panel.thickness)
    },
    trim: { x: num(value.trim.x), y: num(value.trim.y) },
    kerf: num(value.kerf),
    material: {
      code: value.material.code ?? null,
      description: value.material.description,
      hasGrain: triState(value.material.hasGrain),
      thickness: optionalNum(value.material.thickness)
    },
    constraints: {
      stages: optionalNum(value.constraints.stages),
      minRemnant: num(value.constraints.minRemnant),
      minCommercialRemnantLongSide: optionalNum(value.constraints.minCommercialRemnantLongSide)
    },
    pieces: exactPieces(value.pieces)
  };
}

/**
 * Multiset determinista de piezas.
 *
 * Dos entradas se suman solo si coinciden en TODOS los campos que afectan el problema,
 * nunca solo por ancho/alto. Asi un pedido con dos lineas identicas de 2 y 3 unidades
 * es el mismo problema que un pedido con una sola linea de 5 unidades.
 *
 * El orden se resuelve por comparacion de code points, no con localeCompare, para que
 * el fingerprint no dependa del locale ni de la build de ICU del runtime.
 */
function exactPieces(pieces: CanonicalOptimizationPiece[]): ExactPiece[] {
  const grouped = new Map<string, ExactPiece>();

  for (const piece of pieces) {
    const exact = toExactPiece(piece);
    const key = exactPieceKey(piece);
    const existing = grouped.get(key);
    if (existing) existing.quantity += exact.quantity;
    else grouped.set(key, exact);
  }

  return [...grouped.entries()].sort((a, b) => compareCodePoints(a[0], b[0])).map(([, piece]) => piece);
}

/**
 * Clave de equivalencia de una pieza dentro del problema: todo lo que afecta la
 * optimizacion, sin la cantidad y sin las etiquetas.
 *
 * Dos piezas con la misma clave son intercambiables para el motor, y por eso un plan
 * reutilizado puede reasignarles las etiquetas del pedido nuevo.
 */
export function exactPieceKey(piece: CanonicalOptimizationPiece): string {
  return stableStringify({ ...toExactPiece(piece), quantity: 0 });
}

function toExactPiece(piece: CanonicalOptimizationPiece): ExactPiece {
  return {
    width: num(piece.width),
    height: num(piece.height),
    quantity: num(piece.quantity),
    grain: triState(piece.grain),
    rotationAllowed: triState(piece.rotationAllowed),
    edges: {
      top: Boolean(piece.edges.top),
      bottom: Boolean(piece.edges.bottom),
      left: Boolean(piece.edges.left),
      right: Boolean(piece.edges.right)
    },
    edgeType: piece.edgeType ?? null
  };
}

function triState(value: boolean | null | undefined): TriState {
  if (value === null || value === undefined) return "unknown";
  return value ? "true" : "false";
}

function num(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function optionalNum(value: number | undefined): number | null {
  return value === undefined ? null : num(value);
}

function compareCodePoints(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort(compareCodePoints)
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

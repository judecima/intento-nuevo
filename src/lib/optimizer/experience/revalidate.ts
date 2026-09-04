import { createRequire } from "node:module";

import { canonicalizeOptimizationInput, type CanonicalOptimizationCase } from "../canonical-case";
import { exactPieceKey } from "../fingerprints";
import type {
  LegacyBoard,
  LegacyIndustrialValidation,
  LegacyPlan,
  LegacyTreeNode,
  OptimizationInput,
  OptimizationPlacement,
  OptimizationResult
} from "../types";
import { validateIndependentSlices } from "../validators/independent-slices";
import { isEntryCompatible } from "./store";
import type { ExactExperienceEntry } from "./types";

const require = createRequire(import.meta.url);

interface LegacyValidatorModule {
  validarPlanIndustrial(plan: LegacyPlan, expectedPieceCount?: number): LegacyIndustrialValidation;
}

// Mismo validador que usa el motor al producir un plan. Se reutiliza tal cual, sin copiarlo.
const legacyV10 = require("../legacy/v10.cjs") as LegacyValidatorModule;

const TOLERANCE = 0.001;

export type ExactHitRevalidation =
  | { ok: true; result: OptimizationResult }
  | { ok: false; reason: string };

/**
 * Revalidacion de un plan guardado contra el pedido actual.
 *
 * Un hit NUNCA se acepta solo por fingerprint. Se comprueba version, tablero, kerf,
 * refilado, restricciones, cantidad de piezas y cobertura; se remapean las etiquetas del
 * pedido nuevo; y recien entonces se vuelven a correr los validadores existentes del
 * proyecto sobre el plan remapeado: validarPlanIndustrial (geometria, overlaps, piezas
 * dentro del panel, secuencia guillotina, cobertura) y validateIndependentSlices.
 */
export function revalidateExactHit(
  entry: ExactExperienceEntry,
  input: OptimizationInput,
  canonical?: CanonicalOptimizationCase
): ExactHitRevalidation {
  if (!isEntryCompatible(entry)) return { ok: false, reason: "incompatible-version" };

  const stored = entry.plan;
  if (!stored.validation?.ok) return { ok: false, reason: "stored-plan-invalid" };

  const problem = canonical ?? canonicalizeOptimizationInput(input);
  const expected = problem.pieces.reduce((total, piece) => total + piece.quantity, 0);
  if (stored.metrics.expectedPieceCount !== expected) return { ok: false, reason: "piece-count-mismatch" };
  if (stored.placements.length !== expected) return { ok: false, reason: "placement-count-mismatch" };

  const optionsMismatch = checkLegacyOptions(stored.raw, input);
  if (optionsMismatch) return { ok: false, reason: optionsMismatch };

  const usableWidth = input.board.width - input.trim.x;
  const usableHeight = input.board.height - input.trim.y;
  for (const board of stored.boards) {
    if (!near(board.width, usableWidth) || !near(board.height, usableHeight)) {
      return { ok: false, reason: "board-format-mismatch" };
    }
  }
  for (const placement of stored.placements) {
    if (placement.x < -TOLERANCE || placement.y < -TOLERANCE) return { ok: false, reason: "placement-out-of-board" };
    if (placement.x + placement.width > usableWidth + TOLERANCE) return { ok: false, reason: "placement-out-of-board" };
    if (placement.y + placement.height > usableHeight + TOLERANCE) return { ok: false, reason: "placement-out-of-board" };
  }

  const remapped = remapLabels(entry, stored, problem, input);
  if (!remapped.ok) return remapped;

  // Validadores existentes, sobre el plan ya remapeado.
  const industrial = legacyV10.validarPlanIndustrial(remapped.result.raw, expected);
  if (!industrial.ok) return { ok: false, reason: "industrial-validation-failed" };

  const independentSlices = validateIndependentSlices(remapped.result.raw);
  if (!independentSlices.ok) return { ok: false, reason: "independent-slices-failed" };

  return {
    ok: true,
    result: { ...remapped.result, validation: { ok: true, industrial, independentSlices } }
  };
}

/**
 * El fingerprint ya distingue tablero, kerf y restricciones, asi que esto es defensa en
 * profundidad contra un store corrupto o editado a mano, no un chequeo redundante inutil.
 */
function checkLegacyOptions(raw: LegacyPlan, input: OptimizationInput): string | null {
  const opts = raw?.opts;
  if (!opts) return "stored-plan-without-options";

  if (!near(Number(opts.placaBase), input.board.width)) return "board-width-mismatch";
  if (!near(Number(opts.placaAltura), input.board.height)) return "board-height-mismatch";
  if (!near(Number(opts.refiladoX), input.trim.x)) return "trim-x-mismatch";
  if (!near(Number(opts.refiladoY), input.trim.y)) return "trim-y-mismatch";
  if (!near(Number(opts.sierra), input.kerf)) return "kerf-mismatch";
  if (Number(opts.etapas) !== (input.constraints.stages ?? 4)) return "stages-mismatch";
  if (!near(Number(opts.restoMin), input.constraints.minRemnant)) return "min-remnant-mismatch";

  const grainConstrained = input.material.hasGrain || input.pieces.some((piece) => piece.canRotate === false);
  if (Boolean(opts.materialConVeta) !== grainConstrained) return "grain-constraint-mismatch";

  return null;
}

interface RelabeledPiece {
  reference: string;
  description: string;
  pieceId: string;
}

/**
 * El exact fingerprint ignora deliberadamente reference, description y demas etiquetas
 * que no cambian el problema geometrico. Por eso un plan reutilizado llega con las
 * etiquetas del pedido historico y hay que reasignarle las del pedido actual, en
 * placements, en boards y tambien dentro del plan legacy raw y su arbol de corte.
 */
function remapLabels(
  entry: ExactExperienceEntry,
  stored: OptimizationResult,
  problem: CanonicalOptimizationCase,
  input: OptimizationInput
): ExactHitRevalidation {
  const idByReference = new Map<string, string>();
  for (const piece of input.pieces) {
    if (piece.id) idByReference.set(piece.reference, piece.id);
  }

  const demand = new Map<string, RelabeledPiece[]>();
  for (const piece of problem.pieces) {
    const key = exactPieceKey(piece);
    const units = demand.get(key) ?? [];
    for (let unit = 0; unit < piece.quantity; unit++) {
      units.push({
        reference: piece.reference,
        description: piece.description ?? "",
        pieceId: idByReference.get(piece.reference) ?? piece.reference
      });
    }
    demand.set(key, units);
  }

  const placements: OptimizationPlacement[] = [];
  for (const [index, placement] of stored.placements.entries()) {
    const pieceKey = entry.pieceKeys[index];
    if (pieceKey === undefined) return { ok: false, reason: "missing-piece-keys" };
    const unit = demand.get(pieceKey)?.shift();
    if (!unit) return { ok: false, reason: "piece-key-not-in-demand" };
    placements.push({ ...placement, reference: unit.reference, description: unit.description, pieceId: unit.pieceId });
  }

  for (const units of demand.values()) {
    if (units.length > 0) return { ok: false, reason: "demand-not-covered" };
  }

  const raw = remapLegacyPlan(stored.raw, placements);

  const byBoard = new Map<number, OptimizationPlacement[]>();
  for (const placement of placements) {
    const list = byBoard.get(placement.boardIndex) ?? [];
    list.push(placement);
    byBoard.set(placement.boardIndex, list);
  }

  return {
    ok: true,
    result: {
      ...stored,
      raw,
      placements,
      boards: stored.boards.map((board) => ({ ...board, placements: byBoard.get(board.boardIndex) ?? [] }))
    }
  };
}

/**
 * result.placements se construye recorriendo raw.placas[].colocadas[] en orden, asi que
 * la unidad i de placements corresponde a la colocacion i. Con eso se arma un mapa por id
 * de unidad, que el motor asigna unico por pieza, y se reescribe tambien el arbol de corte.
 * Sin esto, generateMachineXml de un plan reutilizado emitiria los codigos del pedido viejo.
 */
function remapLegacyPlan(plan: LegacyPlan, placements: OptimizationPlacement[]): LegacyPlan {
  const byUnitId = new Map<string, RelabeledPiece>();
  let index = 0;

  const placas = (plan.placas ?? []).map((board): LegacyBoard => {
    const colocadas = (board.colocadas ?? []).map((placed) => {
      const placement = placements[index++];
      if (!placement || !placed.pieza) return placed;

      const relabeled: RelabeledPiece = {
        reference: placement.reference,
        description: placement.description,
        pieceId: placement.pieceId
      };
      const unitId = placed.pieza.id;
      if (unitId !== undefined && unitId !== null) byUnitId.set(String(unitId), relabeled);

      return {
        ...placed,
        pieza: {
          ...placed.pieza,
          ref: relabeled.reference,
          detalle: relabeled.description,
          _codigoXml: relabeled.reference
        }
      };
    });

    return { ...board, colocadas, ...(board.arbol ? { arbol: remapTree(board.arbol, byUnitId) } : {}) };
  });

  return { ...plan, placas };
}

function remapTree(node: LegacyTreeNode, byUnitId: Map<string, RelabeledPiece>): LegacyTreeNode {
  if (!node.partes) return node;

  return {
    ...node,
    partes: node.partes.map((part) => {
      const relabeled = part.pieza?.id === undefined ? undefined : byUnitId.get(String(part.pieza.id));
      return {
        ...part,
        ...(part.pieza && relabeled
          ? {
              pieza: {
                ...part.pieza,
                ref: relabeled.reference,
                detalle: relabeled.description,
                _codigoXml: relabeled.reference
              }
            }
          : {}),
        ...(part.hijo ? { hijo: remapTree(part.hijo, byUnitId) } : {})
      };
    })
  };
}

/**
 * Clave de equivalencia por colocacion. Devuelve null si el pedido tiene una referencia
 * repetida entre piezas que no son equivalentes: en ese caso no se podria remapear sin
 * ambiguedad, asi que el plan no se guarda y nunca se reutiliza.
 */
export function buildPieceKeys(result: OptimizationResult, input: OptimizationInput): string[] | null {
  const canonical = canonicalizeOptimizationInput(input);
  const byReference = new Map<string, string>();
  for (const piece of canonical.pieces) {
    const key = exactPieceKey(piece);
    const previous = byReference.get(piece.reference);
    if (previous !== undefined && previous !== key) return null;
    byReference.set(piece.reference, key);
  }

  const keys: string[] = [];
  for (const placement of result.placements) {
    const key = byReference.get(placement.reference);
    if (key === undefined) return null;
    keys.push(key);
  }
  return keys;
}

function near(a: number, b: number): boolean {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= TOLERANCE;
}

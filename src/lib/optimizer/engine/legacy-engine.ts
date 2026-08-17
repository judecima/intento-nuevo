import { createHash } from "node:crypto";
import { createRequire } from "node:module";

import { optimizationInputSchema } from "../schema";
import type {
  LegacyDiagStep,
  LegacyBoard,
  LegacyIndustrialValidation,
  LegacyLineInput,
  LegacyOptimizerOptions,
  LegacyOptimizerReturn,
  LegacyPlan,
  LegacyRemnantQuality,
  OptimizationBoardResult,
  OptimizationCut,
  OptimizationInput,
  OptimizationMetrics,
  OptimizationPlacement,
  OptimizationPlacementTrace,
  OptimizationRemnant,
  OptimizationResult,
  OptimizerStrategy
} from "../types";
import { validateIndependentSlices } from "../validators/independent-slices";

const require = createRequire(import.meta.url);

interface LegacyMotorModule {
  optimizar(lineas: LegacyLineInput[], config: LegacyOptimizerOptions): LegacyPlan;
  calidadPlanPlacas?(placas: LegacyBoard[], options: LegacyOptimizerOptions): LegacyRemnantQuality;
}

interface LegacyV10Module {
  optimizarV10(
    lineas: LegacyLineInput[],
    config: LegacyOptimizerOptions,
    metricas?: unknown,
  ): LegacyOptimizerReturn;
  nuevasMetricas(): unknown;
  validarPlanIndustrial(plan: LegacyPlan, expectedPieceCount?: number): LegacyIndustrialValidation;
}

const legacyMotor = require("../legacy/motor.cjs") as LegacyMotorModule;
const legacyV10 = require("../legacy/v10.cjs") as LegacyV10Module;

export const LEGACY_OPTIMIZER_VERSION = "legacy-guillotine-v10-lepton-remnants-20260813";
const MAX_OPTIMIZATION_CACHE_ENTRIES = 50;
const optimizationCache = new Map<string, OptimizationResult>();

export function getOptimizationInputHash(input: OptimizationInput): string {
  return optimizationInputHash(optimizationInputSchema.parse(input));
}

export function optimizeProject(input: OptimizationInput): OptimizationResult {
  const startedAt = Date.now();
  const parsed = optimizationInputSchema.parse(input);
  const inputHash = optimizationInputHash(parsed);
  const cached = optimizationCache.get(inputHash);

  if (cached) {
    const result = cloneOptimizationResult(cached);
    result.metrics = { ...result.metrics, cacheHit: true, engineMs: Date.now() - startedAt };
    return result;
  }

  const strategy = parsed.strategy ?? "baseline";
  const lineas = toLegacyLines(parsed);
  const options = toLegacyOptions(parsed, strategy);
  const profile = parsed.constraints.profile ?? "balanced";
  const expectedPieceCount = lineas.reduce((total, line) => total + line.cant, 0);

  const raw =
    strategy === "v10"
      ? completeLegacyPlan(legacyV10.optimizarV10(lineas, options, legacyV10.nuevasMetricas()), lineas, "v10")
      : completeLegacyPlan(
          {
            plan: legacyMotor.optimizar(lineas, { ...options, multiVariantes: false }),
            metricas: legacyV10.nuevasMetricas(),
            cota: areaLowerBound(lineas, options)
          },
          lineas,
          "baseline",
        );

  const industrial = legacyV10.validarPlanIndustrial(raw, expectedPieceCount);
  const independentSlices = validateIndependentSlices(raw);
  const normalized = normalizeLegacyPlan(raw, expectedPieceCount);

  const result: OptimizationResult = {
    algorithmVersion: LEGACY_OPTIMIZER_VERSION,
    inputHash,
    strategy,
    profile,
    projectId: parsed.projectId,
    projectVersion: parsed.projectVersion,
    ...normalized,
    metrics: { ...normalized.metrics, cacheHit: false, engineMs: Date.now() - startedAt },
    validation: {
      ok: industrial.ok && independentSlices.ok,
      industrial,
      independentSlices
    },
    raw
  };

  rememberOptimizationResult(inputHash, result);
  return result;
}

function toLegacyLines(input: OptimizationInput): LegacyLineInput[] {
  return input.pieces.map((piece, index) => ({
    ref: piece.reference || String(index + 1),
    detalle: piece.description || piece.reference || `Piece ${index + 1}`,
    cant: piece.quantity,
    base: piece.width,
    altura: piece.height,
    veta: Boolean(piece.grain || piece.canRotate === false),
    cantos: piece.edges
      ? {
          arr: Boolean(piece.edges.top),
          aba: Boolean(piece.edges.bottom),
          izq: Boolean(piece.edges.left),
          der: Boolean(piece.edges.right)
        }
      : null
  }));
}

function toLegacyOptions(input: OptimizationInput, strategy: OptimizerStrategy): LegacyOptimizerOptions {
  const minLongSide = input.constraints.minCommercialRemnantLongSide;
  const totalPieces = input.pieces.reduce((total, piece) => total + piece.quantity, 0);

  const options: LegacyOptimizerOptions = {
    placaBase: input.board.width,
    placaAltura: input.board.height,
    refiladoX: input.trim.x,
    refiladoY: input.trim.y,
    sierra: input.kerf,
    etapas: input.constraints.stages ?? 4,
    materialConVeta: input.material.hasGrain || input.pieces.some((piece) => piece.canRotate === false),
    descontarCanto: false,
    cantoEspesor: 0,
    restoMin: input.constraints.minRemnant,
    restoMax: minLongSide ?? Math.max(input.constraints.minRemnant, 400),
    usarOneBoard: strategy === "v10" ? input.constraints.allowOneBoard !== false : false,
    usarMaster: strategy === "v10" ? input.constraints.allowPatternMaster !== false : false,
    usarMultiSlice: strategy === "v10" ? input.constraints.allowMultiSlice !== false : false,
    usarCompactacion: strategy === "v10" ? input.constraints.allowDeadStripCompaction !== false : false
  };

  return {
    ...options,
    ...profileOptions(input.constraints.profile ?? "balanced", totalPieces)
  };
}

function profileOptions(profile: NonNullable<OptimizationInput["constraints"]["profile"]>, totalPieces: number) {
  const cacheLimit = totalPieces <= 160 ? 160 : 0;

  if (profile === "fast") {
    return {
      pases: 2,
      restartsPorPlaca: 4,
      presupuestoBeamMs: 250,
      maxPiezasBeam: 80,
      usarRescue: false,
      maxPiezasRescue: 0,
      usarOneBoard: false,
      usarMaster: false,
      usarMultiSlice: false,
      usarCompactacion: false,
      rondasPatrones: 8,
      msMaster: 500,
      usarCache: cacheLimit > 0,
      maxPiezasCache: cacheLimit
    };
  }

  if (profile === "deep") {
    return {
      usarCache: cacheLimit > 0,
      maxPiezasCache: cacheLimit,
      presupuestoBeamMs: 2500,
      msMaster: 8000,
      rondasPatrones: 60
    };
  }

  return {
    usarCache: cacheLimit > 0,
    maxPiezasCache: cacheLimit
  };
}

function completeLegacyPlan(
  result: LegacyOptimizerReturn,
  lineas: LegacyLineInput[],
  origin: "baseline" | "v10",
): LegacyPlan {
  const plan = result.plan;
  const opts = plan.opts ?? ({} as LegacyOptimizerOptions);
  plan.sobrantes = [];

  for (let boardIndex = 0; boardIndex < (plan.placas ?? []).length; boardIndex++) {
    for (const remnant of plan.placas[boardIndex].restos ?? []) {
      if (isCommercialRemnant(remnant.w, remnant.h, opts)) {
        plan.sobrantes.push({ ...remnant, placa: boardIndex + 1 });
      }
    }
  }

  plan.sobrantes.sort((a, b) => b.w * b.h - a.w * a.h);

  let edgeBandMeters = 0;
  let edgeBandSides = 0;
  for (const line of lineas) {
    const edges = line.cantos ?? {};
    for (const [side, enabled] of Object.entries(edges)) {
      if (!enabled) continue;
      edgeBandSides += line.cant;
      edgeBandMeters += line.cant * ((side === "izq" || side === "der" ? line.altura : line.base) / 1000);
    }
  }

  const summary = plan.resumen ?? {};
  summary.placas = plan.placas.length;
  summary.piezas = plan.placas.reduce((total, board) => total + (board.colocadas ?? []).length, 0);

  const cutArea = plan.placas.reduce(
    (total, board) => total + (board.colocadas ?? []).reduce((area, placement) => area + placement.base * placement.altura, 0),
    0,
  );
  const grossArea = summary.placas * (opts.placaBase || 0) * (opts.placaAltura || 0);

  summary.m2Totales = grossArea / 1e6;
  summary.m2Cortados = cutArea / 1e6;
  summary.aprovechamiento = grossArea ? (cutArea / grossArea) * 100 : 0;
  summary.desperdicio = 100 - summary.aprovechamiento;
  summary.mlCanto = edgeBandMeters;
  summary.ladosCanto = edgeBandSides;
  summary.cortes = plan.placas.reduce((total, board) => total + (board.cortes ?? []).length, 0);
  summary.metrosSierra =
    plan.placas.reduce(
      (total, board) => total + (board.cortes ?? []).reduce((length, cut) => length + (cut.largo ?? 0), 0),
      0,
    ) / 1000;
  summary.sobrantes = plan.sobrantes.length;
  summary.m2Sobrantes = plan.sobrantes.reduce((total, remnant) => total + remnant.w * remnant.h, 0) / 1e6;
  const remnantQuality = remnantQualityForPlan(plan, opts);
  summary.mayorSobranteM2 = remnantQuality.mayor / 1e6;
  summary.segundoSobranteM2 = remnantQuality.segundo / 1e6;
  summary.fragmentosComerciales = remnantQuality.fragmentos;
  summary.origen = summary.origen ?? (origin === "v10" ? "v10" : "v8-baseline");

  plan.resumen = summary;
  plan.metricasV10 = result.metricas;
  plan.cotaV10 = result.cota;

  return plan;
}

function areaLowerBound(lineas: LegacyLineInput[], options: LegacyOptimizerOptions): number {
  const areaTotal = lineas.reduce((total, line) => total + line.cant * line.base * line.altura, 0);
  const areaPlaca = (options.placaBase - (options.refiladoX || 0)) * (options.placaAltura - (options.refiladoY || 0));
  return Math.ceil(areaTotal / areaPlaca - 1e-9);
}

function normalizeLegacyPlan(
  plan: LegacyPlan,
  expectedPieceCount: number,
): Omit<OptimizationResult, "algorithmVersion" | "strategy" | "projectId" | "projectVersion" | "validation" | "raw"> {
  const boards: OptimizationBoardResult[] = [];
  const placements: OptimizationPlacement[] = [];
  const cuts: OptimizationCut[] = [];
  const remnants: OptimizationRemnant[] = [];

  for (let boardIndex = 0; boardIndex < plan.placas.length; boardIndex++) {
    const legacyBoard = plan.placas[boardIndex];
    const boardPlacements = (legacyBoard.colocadas ?? []).map((placement, placementIndex): OptimizationPlacement => {
      const edges = placement.pieza?.cantos ?? null;
      const normalized = {
        id: `${boardIndex + 1}:${placementIndex + 1}:${placement.pieza?.id ?? "piece"}`,
        boardIndex,
        pieceId: String(placement.pieza?.id ?? placement.pieza?._codigoXml ?? placement.pieza?.ref ?? placementIndex + 1),
        reference: String(placement.pieza?.ref ?? placement.pieza?._codigoXml ?? placementIndex + 1),
        description: placement.pieza?.detalle ?? "",
        x: placement.x,
        y: placement.y,
        width: placement.base,
        height: placement.altura,
        rotated: Boolean(placement.rotada),
        level: placement.nivel ?? 0,
        sourceWidth: Number(placement.pieza?.base ?? placement.base),
        sourceHeight: Number(placement.pieza?.altura ?? placement.altura),
        edges: {
          top: Boolean(edges?.arr),
          bottom: Boolean(edges?.aba),
          left: Boolean(edges?.izq),
          right: Boolean(edges?.der)
        },
        trace: normalizeTrace(placement._diagPath)
      };
      placements.push(normalized);
      return normalized;
    });

    const boardCuts = (legacyBoard.cortes ?? []).map((cut): OptimizationCut => {
      const normalized = {
        boardIndex,
        x1: cut.x1,
        y1: cut.y1,
        x2: cut.x2,
        y2: cut.y2,
        level: cut.nivel ?? 0,
        length: cut.largo ?? Math.abs(cut.x2 - cut.x1) + Math.abs(cut.y2 - cut.y1),
        terminal: Boolean(cut.terminal)
      };
      cuts.push(normalized);
      return normalized;
    });

    const boardRemnants = (legacyBoard.restos ?? []).map((remnant): OptimizationRemnant => {
      const normalized = {
        boardIndex,
        x: remnant.x,
        y: remnant.y,
        width: remnant.w,
        height: remnant.h,
        area: remnant.w * remnant.h,
        commercial: isCommercialRemnant(remnant.w, remnant.h, plan.opts)
      };
      remnants.push(normalized);
      return normalized;
    });

    boards.push({
      boardIndex,
      width: legacyBoard.ancho,
      height: legacyBoard.alto,
      placements: boardPlacements,
      cuts: boardCuts,
      remnants: boardRemnants
    });
  }

  const summary = plan.resumen ?? {};
  const commercialAreas = remnants
    .filter((remnant) => remnant.commercial)
    .map((remnant) => remnant.area)
    .sort((a, b) => b - a);
  const metrics: OptimizationMetrics = {
    boardCount: summary.placas ?? boards.length,
    pieceCount: summary.piezas ?? placements.length,
    expectedPieceCount,
    utilizationPercentage: summary.aprovechamiento ?? 0,
    wastePercentage: summary.desperdicio ?? 0,
    totalAreaM2: summary.m2Totales ?? 0,
    cutAreaM2: summary.m2Cortados ?? 0,
    commercialRemnantAreaM2: summary.m2Sobrantes ?? 0,
    largestCommercialRemnantM2: numberOr(summary.mayorSobranteM2, (commercialAreas[0] ?? 0) / 1e6),
    secondLargestCommercialRemnantM2: numberOr(summary.segundoSobranteM2, (commercialAreas[1] ?? 0) / 1e6),
    commercialRemnantCount: numberOr(summary.fragmentosComerciales, commercialAreas.length),
    cutCount: summary.cortes ?? cuts.length,
    sawMeters: summary.metrosSierra ?? cuts.reduce((total, cut) => total + cut.length, 0) / 1000
  };

  return { boards, placements, cuts, remnants, metrics };
}

function normalizeTrace(steps: LegacyDiagStep[] | undefined): OptimizationPlacementTrace[] {
  if (!Array.isArray(steps)) return [];

  return steps.map((step) => ({
    level: numberOrNull(step.nivel),
    type: String(step.tipo ?? "decision"),
    region: rectOrNull(step.region),
    block: rectOrNull(step.bloque),
    slice: numberOrNull(step.rebanada),
    provisionalSlice: numberOrNull(step.rebanadaProvisional),
    direction: step.dir == null ? null : String(step.dir),
    multiplier: numberOrNull(step.mult),
    anchorPiece: String(step.piezaAncla ?? step.piezaFinal ?? ""),
    anchorWidth: numberOrNull(step.baseAncla),
    anchorHeight: numberOrNull(step.alturaAncla),
    anchorRotated: Boolean(step.rotadaAncla)
  }));
}

function rectOrNull(rect: { x?: number; y?: number; w?: number; h?: number } | undefined) {
  if (!rect) return null;
  return {
    x: Number(rect.x ?? 0),
    y: Number(rect.y ?? 0),
    width: Number(rect.w ?? 0),
    height: Number(rect.h ?? 0)
  };
}

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberOr(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isCommercialRemnant(width: number, height: number, options: LegacyOptimizerOptions): boolean {
  const minSide = Number(options.restoMin ?? 0);
  const longSide = Number(options.restoMax ?? 0);
  return Math.min(width, height) >= minSide && Math.max(width, height) >= longSide;
}

function remnantQualityForPlan(plan: LegacyPlan, options: LegacyOptimizerOptions): LegacyRemnantQuality {
  const quality = legacyMotor.calidadPlanPlacas?.(plan.placas ?? [], options);
  if (quality) return quality;

  const areas = (plan.sobrantes ?? [])
    .map((remnant) => remnant.w * remnant.h)
    .sort((a, b) => b - a);

  return {
    mayor: areas[0] ?? 0,
    segundo: areas[1] ?? 0,
    fragmentos: areas.length,
    total: areas.reduce((total, area) => total + area, 0),
    areas
  };
}

function optimizationInputHash(input: OptimizationInput): string {
  return createHash("sha256")
    .update(stableStringify({ algorithmVersion: LEGACY_OPTIMIZER_VERSION, input }))
    .digest("hex");
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

function rememberOptimizationResult(inputHash: string, result: OptimizationResult) {
  if (optimizationCache.has(inputHash)) optimizationCache.delete(inputHash);
  optimizationCache.set(inputHash, cloneOptimizationResult(result));

  while (optimizationCache.size > MAX_OPTIMIZATION_CACHE_ENTRIES) {
    const oldest = optimizationCache.keys().next().value as string | undefined;
    if (!oldest) break;
    optimizationCache.delete(oldest);
  }
}

function cloneOptimizationResult(result: OptimizationResult): OptimizationResult {
  return JSON.parse(JSON.stringify(result)) as OptimizationResult;
}

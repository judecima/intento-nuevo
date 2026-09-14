import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { optimizar, calidadPlanPlacas, compararCalidad } = require("../../../../src/lib/optimizer/legacy/motor.cjs");

export const PARTIAL_COMMON_BAND_VERSION = "partial-common-band-focused-v2";
export const PARTIAL_COMMON_BAND_POLICY = "exact-dimension>=60%-types+max160pieces+4cheap+1escalation+complete-incumbent-v2";
export const PARTIAL_COMMON_BAND_SEEDS = Object.freeze([1000, 1001, 1004, 1020]);

function bestExactDimension(lines) {
  const groups = [];
  for (const orientation of ["horizontal", "vertical"]) {
    const byDimension = new Map();
    for (let i = 0; i < lines.length; i++) {
      const dimension = Number(orientation === "horizontal" ? lines[i].altura : lines[i].base);
      if (!Number.isFinite(dimension) || dimension <= 0) continue;
      if (!byDimension.has(dimension)) byDimension.set(dimension, []);
      byDimension.get(dimension).push(i);
    }
    for (const [dimension, types] of byDimension) groups.push({ orientation, dimension, types });
  }
  groups.sort((a, b) => b.types.length - a.types.length || (a.orientation === "horizontal" ? -1 : 1) || a.dimension - b.dimension);
  return groups[0] ?? null;
}

export function detectPartialCommonBand(lines, _config = {}, {
  minTypeRatio = 0.60,
  maxTypes = 20,
  maxPieces = 160,
} = {}) {
  if (!Array.isArray(lines) || lines.length < 3 || lines.length > maxTypes) return null;
  const totalQuantity = lines.reduce((sum, line) => sum + Number(line.cant || 0), 0);
  if (!(totalQuantity > 0) || totalQuantity > maxPieces) return null;
  const best = bestExactDimension(lines);
  if (!best) return null;
  const ratio = best.types.length / lines.length;
  if (ratio + 1e-12 < minTypeRatio) return null;
  const bandQuantity = best.types.reduce((sum, i) => sum + Number(lines[i].cant || 0), 0);
  return { ...best, typeRatio: ratio, bandQuantity, totalQuantity, quantityRatio: bandQuantity / totalQuantity };
}

function usageVector(plate, typeCount) {
  const vector = new Array(typeCount).fill(0);
  for (const placement of plate.colocadas ?? []) {
    const type = placement.pieza?.ref;
    if (!Number.isSafeInteger(type) || type < 0 || type >= typeCount) throw new Error("partial-common-band: invalid internal type reference");
    vector[type]++;
  }
  return vector;
}

function platePattern(plate, typeCount) {
  const vector = usageVector(plate, typeCount);
  return {
    uso: new Map(vector.map((count, type) => [type, count]).filter(([, count]) => count > 0)),
    area: plate.colocadas.reduce((sum, c) => sum + c.base * c.altura, 0),
    placa: plate,
  };
}

function betterPlan(a, b) {
  if (!b) return true;
  if (a.placas.length !== b.placas.length) return a.placas.length < b.placas.length;
  return compararCalidad(a.calidad, b.calidad) > 0;
}

export function generatePartialCommonBandPatterns(lines, config, {
  seeds = PARTIAL_COMMON_BAND_SEEDS,
  minTypeRatio = 0.60,
  maxTypes = 20,
  maxPieces = 160,
} = {}) {
  const detection = detectPartialCommonBand(lines, config, { minTypeRatio, maxTypes, maxPieces });
  if (!detection) return { status: "NOT_APPLICABLE", patterns: [], incumbent: null, telemetry: { version: PARTIAL_COMMON_BAND_VERSION, policy: PARTIAL_COMMON_BAND_POLICY, calls: 0 } };

  const indexed = lines.map((line, index) => ({ ...structuredClone(line), ref: index, _refOriginal: line.ref }));
  const byUsage = new Map();
  let incumbent = null;
  const calls = [];

  const registerResult = (result, meta) => {
    const calidad = calidadPlanPlacas(result.placas ?? [], config);
    const candidate = { placas: result.placas ?? [], calidad, ...meta };
    if (betterPlan(candidate, incumbent)) incumbent = candidate;
    for (const plate of result.placas ?? []) {
      const pattern = platePattern(plate, indexed.length);
      const vector = usageVector(plate, indexed.length);
      const key = vector.join(",");
      const q = calidadPlanPlacas([plate], config);
      const previous = byUsage.get(key);
      if (!previous || compararCalidad(q, previous.quality) > 0) byUsage.set(key, { pattern, quality: q });
    }
    calls.push({ ...meta, boards: result.placas?.length ?? 0, rootAxes: result.placas?.map((plate) => plate.arbol?.dir ?? null) ?? [] });
  };

  for (const seed of seeds) {
    const focused = {
      ...structuredClone(config), ruido: 0.3, pases: 1, restartsPorPlaca: 2,
      usarRescue: false, maxPiezasBeam: 0, multiVariantes: false, semilla: seed,
    };
    registerResult(optimizar(indexed.map((line) => ({ ...line })), focused), { kind: "cheap", seed });
  }

  // One deterministic escalation equivalent to the useful part of legacy round 0:
  // more passes/adaptive restarts, Beam and MultiVariantes still disabled. Rescue
  // remains enabled for small cases where it is physically useful.
  const escalation = {
    ...structuredClone(config), ruido: 0.3, pases: 2,
    maxPiezasBeam: 0, multiVariantes: false, usarRescue: true, semilla: 1000,
  };
  registerResult(optimizar(indexed.map((line) => ({ ...line })), escalation), { kind: "escalation", seed: 1000 });

  return {
    status: "COMPLETE",
    patterns: [...byUsage.values()].map((entry) => entry.pattern),
    incumbent,
    telemetry: {
      version: PARTIAL_COMMON_BAND_VERSION,
      policy: PARTIAL_COMMON_BAND_POLICY,
      detection,
      seeds: [...seeds],
      calls: calls.length,
      details: calls,
    },
  };
}

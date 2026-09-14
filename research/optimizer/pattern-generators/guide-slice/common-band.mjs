import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { optimizar, calidadPlanPlacas } = require("../../../../src/lib/optimizer/legacy/motor.cjs");

export const COMMON_BAND_VERSION = "common-band-triples-v1";
export const COMMON_BAND_POLICY = "exact-common-dimension+all-triples+seeds-1000-1005-v1";
export const COMMON_BAND_SEEDS = Object.freeze([1000, 1005]);

function usageVector(plate, typeCount) {
  const vector = new Array(typeCount).fill(0);
  for (const placement of plate.colocadas ?? []) {
    const type = placement.pieza?.ref;
    if (!Number.isSafeInteger(type) || type < 0 || type >= typeCount) throw new Error("common-band: invalid internal type reference");
    vector[type]++;
  }
  return vector;
}

function qualityTuple(plate, config) {
  const q = calidadPlanPlacas([plate], config);
  return [q.mayor, q.segundo, -q.fragmentos, q.total];
}

function tupleGreater(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

export function detectCommonBand(lines, { maxTypes = 4 } = {}) {
  if (!Array.isArray(lines) || lines.length < 3 || lines.length > maxTypes) return null;
  const heights = new Set(lines.map((line) => Number(line.altura)));
  if (heights.size === 1) {
    const dimension = Number(lines[0].altura);
    if (Number.isFinite(dimension) && dimension > 0) return { orientation: "horizontal", dimension };
  }
  const widths = new Set(lines.map((line) => Number(line.base)));
  if (widths.size === 1) {
    const dimension = Number(lines[0].base);
    if (Number.isFinite(dimension) && dimension > 0) return { orientation: "vertical", dimension };
  }
  return null;
}

function combinationsOfThree(n) {
  const out = [];
  for (let a = 0; a < n - 2; a++) for (let b = a + 1; b < n - 1; b++) for (let c = b + 1; c < n; c++) out.push([a, b, c]);
  return out;
}

export function generateCommonBandPatterns(lines, config, { seeds = COMMON_BAND_SEEDS, maxTypes = 4 } = {}) {
  const band = detectCommonBand(lines, { maxTypes });
  if (!band) return { status: "NOT_APPLICABLE", patterns: [], telemetry: { version: COMMON_BAND_VERSION, policy: COMMON_BAND_POLICY, calls: 0 } };
  const indexed = lines.map((line, index) => ({ ...structuredClone(line), ref: index, _refOriginal: line.ref }));
  const deterministic = {
    ...structuredClone(config), ruido: 0.3, pases: 1, restartsPorPlaca: 1,
    usarRescue: false, maxPiezasBeam: 0, multiVariantes: false,
  };
  const byUsage = new Map();
  const calls = [];
  for (const triple of combinationsOfThree(indexed.length)) for (const seed of seeds) {
    const result = optimizar(triple.map((type) => ({ ...indexed[type] })), { ...deterministic, semilla: seed });
    const produced = [];
    for (const plate of result.placas ?? []) {
      const vector = usageVector(plate, indexed.length);
      if (!vector.some(Boolean)) continue;
      const key = vector.join(",");
      const area = plate.colocadas.reduce((sum, c) => sum + c.base * c.altura, 0);
      const quality = qualityTuple(plate, config);
      const previous = byUsage.get(key);
      if (!previous || tupleGreater(quality, previous.quality)) {
        const usage = new Map(vector.map((count, type) => [type, count]).filter(([, count]) => count > 0));
        byUsage.set(key, { pattern: { uso: usage, area, placa: plate }, quality });
      }
      produced.push({ usageVector: vector, rootAxis: plate.arbol?.dir ?? null });
    }
    calls.push({ triple, seed, boards: result.placas?.length ?? 0, produced });
  }
  return {
    status: "COMPLETE",
    patterns: [...byUsage.values()].map((entry) => entry.pattern),
    telemetry: { version: COMMON_BAND_VERSION, policy: COMMON_BAND_POLICY, band, seeds: [...seeds], calls: calls.length, triples: combinationsOfThree(indexed.length).length, details: calls },
  };
}

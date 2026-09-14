import { createRequire } from "node:module";
import { detectRepeatedStrips } from "./repeated-strips.mjs";
const require = createRequire(import.meta.url);
const { optimizar, calidadPlanPlacas, compararCalidad } = require("../../../../src/lib/optimizer/legacy/motor.cjs");

export const WEAK_REPEATED_STRIPS_VERSION = "weak-repeated-strips-round0-v1";
export const WEAK_REPEATED_STRIPS_POLICY = "repeat>=2+narrow<=25%+qty>=30%+types<=19+two-full-round0-seeds-v1";
export const WEAK_REPEATED_STRIPS_SEEDS = Object.freeze([1000, 1004]);

export function detectWeakRepeatedStrips(lines, config, {
  minRepeat = 2,
  narrowRatio = 0.25,
  minStripTypes = 2,
  minStripQuantityRatio = 0.30,
  maxTypes = 19,
  maxPieces = 160,
} = {}) {
  return detectRepeatedStrips(lines, config, {
    minRepeat,
    narrowRatio,
    minStripTypes,
    minStripQuantityRatio,
    maxTypes,
    maxPieces,
  });
}

function usageVector(plate, typeCount) {
  const vector = new Array(typeCount).fill(0);
  for (const placement of plate.colocadas ?? []) {
    const type = placement.pieza?.ref;
    if (!Number.isSafeInteger(type) || type < 0 || type >= typeCount) throw new Error("weak-repeated-strips: invalid internal type reference");
    vector[type]++;
  }
  return vector;
}

function patternFromPlate(plate, typeCount) {
  const vector = usageVector(plate, typeCount);
  return {
    vector,
    pattern: {
      uso: new Map(vector.map((count, type) => [type, count]).filter(([, count]) => count > 0)),
      area: plate.colocadas.reduce((sum, placement) => sum + placement.base * placement.altura, 0),
      placa: plate,
    },
  };
}

function betterPlan(a, b) {
  if (!b) return true;
  if (a.placas.length !== b.placas.length) return a.placas.length < b.placas.length;
  return compararCalidad(a.calidad, b.calidad) > 0;
}

export function generateWeakRepeatedStripPatterns(lines, config, {
  seeds = WEAK_REPEATED_STRIPS_SEEDS,
  minRepeat = 2,
  narrowRatio = 0.25,
  minStripTypes = 2,
  minStripQuantityRatio = 0.30,
  maxTypes = 19,
  maxPieces = 160,
} = {}) {
  const detection = detectWeakRepeatedStrips(lines, config, {
    minRepeat,
    narrowRatio,
    minStripTypes,
    minStripQuantityRatio,
    maxTypes,
    maxPieces,
  });
  if (!detection) {
    return {
      status: "NOT_APPLICABLE",
      patterns: [],
      incumbent: null,
      telemetry: { version: WEAK_REPEATED_STRIPS_VERSION, policy: WEAK_REPEATED_STRIPS_POLICY, calls: 0 },
    };
  }

  const indexed = lines.map((line, index) => ({ ...structuredClone(line), ref: index, _refOriginal: line.ref }));
  const byUsage = new Map();
  let incumbent = null;
  const calls = [];

  for (const seed of seeds) {
    // Exact full-order equivalent of Legacy round 0: preserve all industrial
    // mechanisms present in config; only fix seed and passes deterministically.
    const result = optimizar(indexed.map((line) => ({ ...line })), {
      ...structuredClone(config),
      semilla: seed,
      pases: 2,
    });
    const calidad = calidadPlanPlacas(result.placas ?? [], config);
    const candidate = { placas: result.placas ?? [], calidad, seed };
    if (betterPlan(candidate, incumbent)) incumbent = candidate;

    const produced = [];
    for (const plate of result.placas ?? []) {
      const { vector, pattern } = patternFromPlate(plate, indexed.length);
      if (!vector.some(Boolean)) continue;
      const key = vector.join(",");
      const quality = calidadPlanPlacas([plate], config);
      const previous = byUsage.get(key);
      if (!previous || compararCalidad(quality, previous.quality) > 0) byUsage.set(key, { pattern, quality });
      produced.push({ usageVector: vector, rootAxis: plate.arbol?.dir ?? null });
    }
    calls.push({ seed, boards: result.placas?.length ?? 0, produced });
  }

  return {
    status: "COMPLETE",
    patterns: [...byUsage.values()].map((entry) => entry.pattern),
    incumbent,
    telemetry: {
      version: WEAK_REPEATED_STRIPS_VERSION,
      policy: WEAK_REPEATED_STRIPS_POLICY,
      detection,
      seeds: [...seeds],
      calls: calls.length,
      details: calls,
    },
  };
}

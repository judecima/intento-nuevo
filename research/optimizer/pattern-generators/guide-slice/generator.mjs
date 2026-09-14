import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { optimizar } = require("../../../../src/lib/optimizer/legacy/motor.cjs");

export const GUIDE_SLICE_VERSION = "guide-slice-hub-pairs-v1";
export const GUIDE_SLICE_POLICY = "highest-demand-hub+single-guide+deterministic-greedy-v1";

function usageVector(plate, typeCount) {
  const vector = new Array(typeCount).fill(0);
  for (const placement of plate.colocadas ?? []) {
    const type = placement.pieza?.ref;
    if (!Number.isSafeInteger(type) || type < 0 || type >= typeCount) throw new Error("guide-slice: invalid internal type reference");
    vector[type]++;
  }
  return vector;
}

export function selectHubType(lines) {
  if (!Array.isArray(lines) || !lines.length) throw new TypeError("guide-slice: nonempty lines required");
  let best = 0;
  for (let i = 1; i < lines.length; i++) {
    const a = Number(lines[i].cant), b = Number(lines[best].cant);
    if (!Number.isSafeInteger(a) || a <= 0 || !Number.isSafeInteger(b) || b <= 0) throw new RangeError("guide-slice: invalid demand");
    if (a > b) best = i;
  }
  return best;
}

export function generateGuideSlicePatterns(lines, config, { hubType = selectHubType(lines) } = {}) {
  if (!Number.isSafeInteger(hubType) || hubType < 0 || hubType >= lines.length) throw new RangeError("guide-slice: invalid hub type");
  const indexed = lines.map((line, index) => ({ ...structuredClone(line), ref: index, _refOriginal: line.ref }));
  const deterministic = {
    ...structuredClone(config),
    ruido: 0,
    pases: 1,
    restartsPorPlaca: 1,
    usarRescue: false,
    maxPiezasBeam: 0,
    multiVariantes: false,
    semilla: 1000,
  };
  const patterns = [];
  const calls = [];
  for (let guideType = 0; guideType < indexed.length; guideType++) {
    if (guideType === hubType) continue;
    const result = optimizar([{ ...indexed[guideType] }, { ...indexed[hubType] }], deterministic);
    const produced = [];
    for (const plate of result.placas ?? []) {
      const vector = usageVector(plate, indexed.length);
      if (!vector.some(Boolean)) continue;
      const usage = new Map(vector.map((count, type) => [type, count]).filter(([, count]) => count > 0));
      patterns.push({ uso: usage, area: plate.colocadas.reduce((sum, c) => sum + c.base * c.altura, 0), placa: plate });
      produced.push({ usageVector: vector, rootAxis: plate.arbol?.dir ?? null, cuts: plate.cortes?.length ?? 0 });
    }
    calls.push({ guideType, hubType, boards: result.placas?.length ?? 0, produced });
  }
  return { patterns, telemetry: { version: GUIDE_SLICE_VERSION, policy: GUIDE_SLICE_POLICY, hubType, calls: calls.length, pairs: calls } };
}

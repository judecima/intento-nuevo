import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { optimizar, calidadPlanPlacas, compararCalidad } = require("../../../../src/lib/optimizer/legacy/motor.cjs");

export const LARGE_REPEATED_STRIPS_VERSION = "large-repeated-strips-round0-v1";
export const LARGE_REPEATED_STRIPS_POLICY = "types20-40+repeat>=2+narrow<=25%+qty>=70%+three-full-round0-seeds-v1";
export const LARGE_REPEATED_STRIPS_SEEDS = Object.freeze([1000, 1004, 1005]);

function legalOrientations(line, config) {
  const out = [[Number(line.base), Number(line.altura)]];
  if (!(config.materialConVeta && line.veta) && Number(line.base) !== Number(line.altura)) out.push([Number(line.altura), Number(line.base)]);
  return out;
}

export function detectLargeRepeatedStrips(lines, config, {
  minRepeat = 2, narrowRatio = 0.25, minStripTypes = 2, minStripQuantityRatio = 0.70,
  minTypes = 20, maxTypes = 40, maxPieces = 160,
} = {}) {
  if (!Array.isArray(lines) || lines.length < minTypes || lines.length > maxTypes) return null;
  const totalPieces = lines.reduce((sum, line) => sum + Number(line.cant || 0), 0);
  if (!Number.isSafeInteger(totalPieces) || totalPieces <= 0 || totalPieces > maxPieces) return null;
  const width = Number(config.placaBase) - Number(config.refiladoX || 0);
  const height = Number(config.placaAltura) - Number(config.refiladoY || 0);
  if (!(width > 0 && height > 0)) return null;
  const stripTypes = []; let stripQuantity = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i], quantity = Number(line.cant);
    if (!Number.isSafeInteger(quantity) || quantity < minRepeat) continue;
    const qualifies = legalOrientations(line, config).some(([b, h]) => Math.min(b / width, h / height) <= narrowRatio + 1e-12);
    if (!qualifies) continue;
    stripTypes.push(i); stripQuantity += quantity;
  }
  const ratio = stripQuantity / totalPieces;
  if (stripTypes.length < minStripTypes || ratio + 1e-12 < minStripQuantityRatio) return null;
  return { stripTypes, stripQuantity, totalPieces, ratio, narrowRatio, minRepeat };
}

function usageVector(plate, typeCount) {
  const vector = new Array(typeCount).fill(0);
  for (const placement of plate.colocadas ?? []) {
    const type = placement.pieza?.ref;
    if (!Number.isSafeInteger(type) || type < 0 || type >= typeCount) throw new Error("large-repeated-strips: invalid internal type reference");
    vector[type]++;
  }
  return vector;
}
function betterPlan(a, b) {
  if (!b) return true;
  if (a.placas.length !== b.placas.length) return a.placas.length < b.placas.length;
  return compararCalidad(a.calidad, b.calidad) > 0;
}
export function generateLargeRepeatedStripPatterns(lines, config, { seeds = LARGE_REPEATED_STRIPS_SEEDS, ...detectOptions } = {}) {
  const detection = detectLargeRepeatedStrips(lines, config, detectOptions);
  if (!detection) return { status: "NOT_APPLICABLE", patterns: [], incumbent: null, telemetry: { version: LARGE_REPEATED_STRIPS_VERSION, policy: LARGE_REPEATED_STRIPS_POLICY, calls: 0 } };
  const indexed = lines.map((line, index) => ({ ...structuredClone(line), ref: index, _refOriginal: line.ref }));
  const byUsage = new Map(); let incumbent = null; const calls = [];
  for (const seed of seeds) {
    const result = optimizar(indexed.map((line) => ({ ...line })), { ...structuredClone(config), semilla: seed, pases: 2 });
    const calidad = calidadPlanPlacas(result.placas ?? [], config);
    const candidate = { placas: result.placas ?? [], calidad, seed };
    if (betterPlan(candidate, incumbent)) incumbent = candidate;
    for (const plate of result.placas ?? []) {
      const vector = usageVector(plate, indexed.length), key = vector.join(",");
      if (!vector.some(Boolean)) continue;
      const q = calidadPlanPlacas([plate], config), prev = byUsage.get(key);
      const pattern = { uso: new Map(vector.map((count, type) => [type, count]).filter(([, count]) => count > 0)), area: plate.colocadas.reduce((s, p) => s + p.base * p.altura, 0), placa: plate };
      if (!prev || compararCalidad(q, prev.quality) > 0) byUsage.set(key, { pattern, quality: q });
    }
    calls.push({ seed, boards: result.placas?.length ?? 0 });
  }
  return { status: "COMPLETE", patterns: [...byUsage.values()].map((x) => x.pattern), incumbent, telemetry: { version: LARGE_REPEATED_STRIPS_VERSION, policy: LARGE_REPEATED_STRIPS_POLICY, detection, seeds: [...seeds], calls: calls.length, details: calls } };
}

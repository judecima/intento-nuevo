import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { optimizar, calidadPlanPlacas, compararCalidad } = require("../../../../src/lib/optimizer/legacy/motor.cjs");
export const WEAK_PARTIAL_BAND_VERSION = "weak-partial-band-v1";
export const WEAK_PARTIAL_BAND_POLICY = "exact-dimension-40-60%-types+max19types+max160pieces+4cheap+1escalation-v1";
export const WEAK_PARTIAL_BAND_SEEDS = Object.freeze([1000, 1001, 1004, 1020]);
function bestExactDimension(lines) {
  let best = null;
  for (const [orientation, key] of [["horizontal", "altura"], ["vertical", "base"]]) {
    const groups = new Map();
    for (let i = 0; i < lines.length; i++) { const d = Number(lines[i][key]); if (!Number.isFinite(d) || d <= 0) continue; if (!groups.has(d)) groups.set(d, []); groups.get(d).push(i); }
    for (const [dimension, types] of groups) if (!best || types.length > best.types.length) best = { orientation, dimension, types };
  }
  return best;
}
export function detectWeakPartialBand(lines, _config = {}, { minTypeRatio = 0.40, maxTypeRatio = 0.60, maxTypes = 19, maxPieces = 160 } = {}) {
  if (!Array.isArray(lines) || lines.length < 3 || lines.length > maxTypes) return null;
  const totalQuantity = lines.reduce((s, l) => s + Number(l.cant || 0), 0);
  if (!(totalQuantity > 0) || totalQuantity > maxPieces) return null;
  const best = bestExactDimension(lines); if (!best) return null;
  const typeRatio = best.types.length / lines.length;
  if (typeRatio + 1e-12 < minTypeRatio || typeRatio >= maxTypeRatio - 1e-12) return null;
  const bandQuantity = best.types.reduce((s, i) => s + Number(lines[i].cant || 0), 0);
  return { ...best, typeRatio, bandQuantity, totalQuantity, quantityRatio: bandQuantity / totalQuantity };
}
function vector(plate, n) { const v = new Array(n).fill(0); for (const p of plate.colocadas ?? []) { const t = p.pieza?.ref; if (!Number.isSafeInteger(t) || t < 0 || t >= n) throw new Error("weak-partial-band: invalid internal type reference"); v[t]++; } return v; }
function better(a, b) { if (!b) return true; if (a.placas.length !== b.placas.length) return a.placas.length < b.placas.length; return compararCalidad(a.calidad, b.calidad) > 0; }
export function generateWeakPartialBandPatterns(lines, config, { seeds = WEAK_PARTIAL_BAND_SEEDS, ...detectOptions } = {}) {
  const detection = detectWeakPartialBand(lines, config, detectOptions);
  if (!detection) return { status: "NOT_APPLICABLE", patterns: [], incumbent: null, telemetry: { version: WEAK_PARTIAL_BAND_VERSION, policy: WEAK_PARTIAL_BAND_POLICY, calls: 0 } };
  const indexed = lines.map((l, i) => ({ ...structuredClone(l), ref: i, _refOriginal: l.ref }));
  const byUsage = new Map(); let incumbent = null; const calls = [];
  const register = (result, meta) => { const calidad = calidadPlanPlacas(result.placas ?? [], config); const cand = { placas: result.placas ?? [], calidad, ...meta }; if (better(cand, incumbent)) incumbent = cand; for (const plate of result.placas ?? []) { const v = vector(plate, indexed.length), key = v.join(","), q = calidadPlanPlacas([plate], config), prev = byUsage.get(key); const pattern = { uso: new Map(v.map((c, t) => [t, c]).filter(([, c]) => c > 0)), area: plate.colocadas.reduce((s, p) => s + p.base * p.altura, 0), placa: plate }; if (!prev || compararCalidad(q, prev.quality) > 0) byUsage.set(key, { pattern, quality: q }); } calls.push({ ...meta, boards: result.placas?.length ?? 0 }); };
  for (const seed of seeds) register(optimizar(indexed.map(l => ({ ...l })), { ...structuredClone(config), ruido: .3, pases: 1, restartsPorPlaca: 2, usarRescue: false, maxPiezasBeam: 0, multiVariantes: false, semilla: seed }), { kind: "cheap", seed });
  register(optimizar(indexed.map(l => ({ ...l })), { ...structuredClone(config), ruido: .3, pases: 2, usarRescue: true, maxPiezasBeam: 0, multiVariantes: false, semilla: 1000 }), { kind: "escalation", seed: 1000 });
  return { status: "COMPLETE", patterns: [...byUsage.values()].map(x => x.pattern), incumbent, telemetry: { version: WEAK_PARTIAL_BAND_VERSION, policy: WEAK_PARTIAL_BAND_POLICY, detection, seeds: [...seeds], calls: calls.length, details: calls } };
}

import { createRequire } from "node:module";
import { join } from "node:path";
import { digest } from "../canonical.mjs";
import { ROOT } from "./identity.mjs";
const require = createRequire(import.meta.url);
export function serialize(value) {
  if (value instanceof Map) return [...value].sort((a, b) => a[0] - b[0]).map(([k, v]) => [k, serialize(v)]);
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serialize(v)]));
  return value;
}
export function poolEvidence(pool, lines, config, bridge) {
  const { validarPlacaIndustrial } = require(join(ROOT, "src/lib/optimizer/legacy/validador_industrial_v3.cjs"));
  const { resolverDiagPath } = require(join(ROOT, "src/lib/optimizer/legacy/motor.cjs"));
  const invalid = [];
  for (const [index, p] of pool.entries()) {
    const errors = [];
    try {
      if (!(p.uso instanceof Map) || !p.uso.size) errors.push("usage-not-map-or-empty");
      else {
        const actual = new Map(), ids = new Set();
        for (const c of p.placa.colocadas) {
          actual.set(c.pieza.ref, (actual.get(c.pieza.ref) ?? 0) + 1);
          if (ids.has(c.pieza.id)) errors.push("duplicate-piece-id"); ids.add(c.pieza.id);
          if (!(c._diagPath ?? resolverDiagPath(c._diagLink)).length) errors.push("missing-trace");
        }
        if (digest(serialize(actual)) !== digest(serialize(p.uso))) errors.push("usage-placement-mismatch");
        for (const [type, count] of p.uso) if (!Number.isSafeInteger(type) || !lines[type] || !Number.isSafeInteger(count) || count <= 0 || count > lines[type].cant) errors.push("demand-exceeded");
        const v = validarPlacaIndustrial(p.placa, config);
        if (!v.geometriaValida || !v.secuenciaCompleta) errors.push("invalid-physical-sequence");
        if (bridge && !bridge.validateIndependentSlices({ placas: [p.placa], opts: config }).ok) errors.push("invalid-independent-slices");
        const area = p.placa.colocadas.reduce((sum, c) => sum + c.base * c.altura, 0);
        if (!Number.isFinite(p.area) || Math.abs(area - p.area) > 1e-6) errors.push("area-placement-mismatch");
        if (bridge?.readB0PhysicalXml) {
          const { exportarProjectXml } = require(join(ROOT, "src/lib/optimizer/legacy/xml-exporter.cjs"));
          const xml = exportarProjectXml(structuredClone({ placas: [p.placa], opts: config }));
          const physical = physicalXmlEvidence(xml, { placas: [p.placa], opts: config }, bridge);
          if (!physical.ok) errors.push(`invalid-physical-xml: ${physical.error}`);
        }
      }
    } catch (error) { errors.push(`validation-exception: ${error.message}`); }
    if (errors.length) invalid.push({ index, errors });
  }
  // Hash the full serialized templates, including traces. No Map can collapse
  // silently to {}. Order-independent identity remains a multiset, not a set.
  const patterns = pool.map(serialize), hashes = patterns.map(digest);
  return { patterns, invalid, patternPoolHash: digest({ lines, patterns: [...hashes].sort() }),
    orderedPoolHash: digest({ lines, patterns: hashes }) };
}
export function physicalXmlEvidence(xml, plan, bridge) {
  try {
    const panels = [...xml.matchAll(/<panel\d+\b[^>]*>[\s\S]*?<\/panel\d+>/g)];
    if (panels.length !== plan.placas.length) throw new Error("XML panel count mismatch");
    let placements = 0;
    for (const [index, panel] of panels.entries()) {
      const original = plan.placas[index];
      const [board] = bridge.readB0PhysicalXml(panel[0], plan.opts, original.arbol.dir);
      const geometry = (p) => [p.x, p.y, p.base, p.altura];
      const expected = original.colocadas.map(geometry).map(JSON.stringify).sort();
      const actual = board.colocadas.map(geometry).map(JSON.stringify).sort();
      if (digest(actual) !== digest(expected)) throw new Error(`XML placement mismatch on board ${index}`);
      placements += board.colocadas.length;
    }
    return { ok: true, panels: panels.length, placements };
  } catch (error) { return { ok: false, error: String(error.message) }; }
}
function geometryOnly(value) {
  if (Array.isArray(value)) return value.map(geometryOnly);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !["_diagPath", "_diagLink", "_xmlId"].includes(key)).map(([key, v]) => [key, geometryOnly(v)]));
  return value;
}
export function finalEvidence(result, bridge, lines) {
  const { engineMs, cacheHit, ...quality } = result.metrics;
  const fullPlan = { geometry: geometryOnly({ boards: result.boards, placements: result.placements, cuts: result.cuts,
    remnants: result.remnants, trees: result.raw.placas.map((p) => p.arbol) }),
    traces: result.placements.map((p) => p.trace ?? []), quality };
  const before = digest(serialize(result.raw));
  const { exportarProjectXml } = require(join(ROOT, "src/lib/optimizer/legacy/xml-exporter.cjs"));
  const xml = exportarProjectXml(structuredClone(result.raw));
  const imported = bridge.parseCanonicalXml(xml);
  const key = (ref, a, b) => JSON.stringify([String(ref), Math.min(a, b), Math.max(a, b)]);
  const demand = new Map(), actual = new Map();
  const { medidaCorte } = require(join(ROOT, "src/lib/optimizer/legacy/motor.cjs"));
  for (const line of lines) {
    const cut = medidaCorte(line, result.raw.opts);
    const k = key(line.ref, cut.base, cut.altura); demand.set(k, (demand.get(k) ?? 0) + line.cant);
  }
  for (const piece of imported.case.pieces) { const k = key(piece.reference, piece.width, piece.height); actual.set(k, (actual.get(k) ?? 0) + piece.quantity); }
  const demandOk = digest([...demand].sort()) === digest([...actual].sort());
  const tracesOk = fullPlan.traces.every((t) => t.length > 0);
  const xmlPhysical = physicalXmlEvidence(xml, result.raw, bridge);
  const { calidadPlanPlacas } = require(join(ROOT, "src/lib/optimizer/legacy/motor.cjs"));
  const exportUnchanged = digest(serialize(result.raw)) === before;
  return { fullPlanHash: digest(fullPlan), fullPlan, xml, xmlDemandOk: demandOk, tracesOk, cacheHit: Boolean(cacheHit),
    exportUnchanged, xmlPhysical, validation: result.validation,
    ok: result.validation.ok && demandOk && tracesOk && !cacheHit && exportUnchanged && xmlPhysical.ok,
    boardCount: result.metrics.boardCount, remnant: calidadPlanPlacas(result.raw.placas, result.raw.opts) };
}

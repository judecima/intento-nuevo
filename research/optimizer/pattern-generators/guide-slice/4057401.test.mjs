import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { createContext } from "../context.mjs";
import { orderPatternPool, poolHashes } from "../ordering.mjs";
import { generateGuideSlicePatterns, selectHubType } from "./generator.mjs";
const require = createRequire(import.meta.url);
const { resolverCobertura } = require("../../../../src/lib/optimizer/legacy/cobertura.cjs");
const { materializar } = require("../../../../src/lib/optimizer/legacy/materializar.cjs");
const { validarPlacaIndustrial, validarPlanIndustrial } = require("../../../../src/lib/optimizer/legacy/validador_industrial_v3.cjs");
const { calidadPlanPlacas } = require("../../../../src/lib/optimizer/legacy/motor.cjs");

const lines = [
  { ref: "1", detalle: "1", cant: 2, base: 1800, altura: 1050, veta: false, cantos: null },
  { ref: "3", detalle: "3", cant: 2, base: 2000, altura: 1100, veta: false, cantos: null },
  { ref: "2", detalle: "2", cant: 1, base: 1900, altura: 1500, veta: false, cantos: null },
  { ref: "4", detalle: "4", cant: 14, base: 744, altura: 450, veta: false, cantos: null },
];
const config = { placaBase: 2742, placaAltura: 1822, refiladoX: 0, refiladoY: 0, sierra: 4.5, etapas: 4,
  materialConVeta: false, descontarCanto: false, cantoEspesor: 0, restoMin: 250, restoMax: 400,
  usarCache: true, maxPiezasCache: 160 };
const demand = lines.map((line) => line.cant);
const areas = lines.map((line) => line.base * line.altura);
const key = (p) => lines.map((_, i) => p.uso.get(i) ?? 0).join(",");
function solve(patterns) {
  const result = resolverCobertura(patterns, demand, config.placaBase * config.placaAltura, 5, 20_000,
    { maxNodos: 100_000, watchdogMs: 5_000 }).resolver(areas);
  assert.equal(result.placas, 4);
  assert.ok(result.plan);
  const plan = materializar(result.plan, lines, config);
  assert.ok(plan);
  return { result, plan };
}

test("4057401 guide-slice recovers the four industrial guide patterns", () => {
  assert.equal(selectHubType(lines), 3);
  const generated = generateGuideSlicePatterns(lines, config);
  const vectors = new Set(generated.patterns.map(key));
  assert.ok(vectors.has("2,0,0,2"));
  assert.ok(vectors.has("0,1,0,4"));
  assert.ok(vectors.has("0,0,1,4"));
  assert.equal(generated.telemetry.calls, 3);
});

test("every generated panel is physically guillotine edge-to-edge", () => {
  const generated = generateGuideSlicePatterns(lines, config);
  for (const pattern of generated.patterns) {
    const validation = validarPlacaIndustrial(pattern.placa, config);
    assert.equal(validation.geometriaValida, true, JSON.stringify(validation.errores));
    assert.equal(validation.secuenciaValida, true, `cut ${validation.corteFallido}`);
    assert.equal(validation.secuenciaCompleta, true);
  }
});

test("final plan mixes independent panel root axes and preserves exact demand", () => {
  const { patterns } = generateGuideSlicePatterns(lines, config);
  const { result, plan } = solve(patterns);
  assert.deepEqual(result.plan.map((p) => p.v), [
    [0, 1, 0, 4], [2, 0, 0, 2], [0, 1, 0, 4], [0, 0, 1, 4],
  ]);
  assert.deepEqual(result.plan.map((p) => p.placa.arbol.dir), ["y", "x", "y", "x"]);
  const validation = validarPlanIndustrial(plan, 19);
  assert.equal(validation.ok, true, JSON.stringify(validation));
  const refs = new Map();
  for (const board of plan.placas) for (const p of board.colocadas) refs.set(String(p.pieza.ref), (refs.get(String(p.pieza.ref)) ?? 0) + 1);
  assert.deepEqual([...refs].sort(), [["1", 2], ["2", 1], ["3", 2], ["4", 14]]);
});

test("four-board guide-slice plan preserves the frozen A remnant quality", () => {
  const { patterns } = generateGuideSlicePatterns(lines, config);
  const { plan } = solve(patterns);
  const quality = calidadPlanPlacas(plan.placas, config);
  assert.deepEqual({ mayor: quality.mayor, segundo: quality.segundo, fragmentos: quality.fragmentos, total: quality.total },
    { mayor: 721146, segundo: 721146, fragmentos: 10, total: 3577592 });
});

test("guide-slice pool is deterministic across repeated fresh generation", () => {
  const context = createContext(lines, config);
  const run = () => {
    const pool = orderPatternPool(generateGuideSlicePatterns(lines, config).patterns, context);
    return poolHashes(pool, context);
  };
  const a = run(), b = run(), c = run();
  assert.deepEqual(b, a); assert.deepEqual(c, a);
});

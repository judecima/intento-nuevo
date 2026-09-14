import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { createContext } from "../context.mjs";
import { orderPatternPool, poolHashes } from "../ordering.mjs";
import { detectCommonBand, generateCommonBandPatterns } from "./common-band.mjs";
import { generateIndustrialPortfolio, selectIndustrialMode } from "./portfolio.mjs";
const require = createRequire(import.meta.url);
const { resolverCobertura } = require("../../../../src/lib/optimizer/legacy/cobertura.cjs");
const { materializar } = require("../../../../src/lib/optimizer/legacy/materializar.cjs");
const { validarPlacaIndustrial, validarPlanIndustrial } = require("../../../../src/lib/optimizer/legacy/validador_industrial_v3.cjs");
const { calidadPlanPlacas } = require("../../../../src/lib/optimizer/legacy/motor.cjs");

const lines = [
  { ref: "1", detalle: "1", cant: 16, base: 2000, altura: 350, veta: false, cantos: null },
  { ref: "2", detalle: "2", cant: 24, base: 964, altura: 350, veta: false, cantos: null },
  { ref: "3", detalle: "3", cant: 30, base: 378, altura: 350, veta: false, cantos: null },
  { ref: "4", detalle: "4", cant: 24, base: 564, altura: 350, veta: false, cantos: null },
];
const config = { placaBase: 2740, placaAltura: 1820, refiladoX: 0, refiladoY: 0, sierra: 4.4, etapas: 4,
  materialConVeta: false, descontarCanto: false, cantoEspesor: 0, restoMin: 250, restoMax: 400,
  usarCache: true, maxPiezasCache: 160 };
const demand = lines.map((line) => line.cant), areas = lines.map((line) => line.base * line.altura);

function solve(patterns) {
  const context = createContext(lines, config), ordered = orderPatternPool(patterns, context);
  const result = resolverCobertura(ordered, demand, config.placaBase * config.placaAltura, 7, 20_000,
    { maxNodos: 1_600_000, watchdogMs: 60_000 }).resolver(areas);
  assert.equal(result.placas, 6);
  assert.ok(result.plan);
  const plan = materializar(result.plan, lines, config);
  assert.ok(plan);
  return { result, plan, context, ordered };
}

test("4056900 is detected as a small exact common-band family", () => {
  assert.deepEqual(detectCommonBand(lines), { orientation: "horizontal", dimension: 350 });
  assert.equal(selectIndustrialMode(lines).mode, "COMMON_BAND");
});

test("common-band triple portfolio recovers six boards with eight calls", () => {
  const generated = generateCommonBandPatterns(lines, config);
  assert.equal(generated.status, "COMPLETE");
  assert.equal(generated.telemetry.triples, 4);
  assert.equal(generated.telemetry.calls, 8);
  assert.equal(generated.patterns.length, 27);
  const { result } = solve(generated.patterns);
  assert.deepEqual(result.plan.map((p) => p.v), [
    [5, 1, 7, 0], [5, 1, 7, 0], [5, 1, 7, 0], [0, 5, 0, 15], [0, 10, 9, 0], [1, 6, 0, 9],
  ]);
  assert.deepEqual(result.plan.map((p) => p.placa.arbol.dir), ["x", "x", "x", "x", "x", "y"]);
});

test("every 4056900 common-band candidate is guillotine edge-to-edge", () => {
  const generated = generateCommonBandPatterns(lines, config);
  for (const pattern of generated.patterns) {
    const validation = validarPlacaIndustrial(pattern.placa, config);
    assert.equal(validation.geometriaValida, true, JSON.stringify(validation.errores));
    assert.equal(validation.secuenciaValida, true, `cut ${validation.corteFallido}`);
    assert.equal(validation.secuenciaCompleta, true);
  }
});

test("4056900 final plan preserves exact 94-piece demand and beats frozen A remnant", () => {
  const generated = generateIndustrialPortfolio(lines, config);
  assert.equal(generated.telemetry.mode, "COMMON_BAND");
  const { plan } = solve(generated.patterns);
  const validation = validarPlanIndustrial(plan, 94);
  assert.equal(validation.ok, true, JSON.stringify(validation));
  const quality = calidadPlanPlacas(plan.placas, config);
  assert.deepEqual({ mayor: quality.mayor, segundo: quality.segundo, fragmentos: quality.fragmentos, total: quality.total },
    { mayor: 164220.00000000003, segundo: 0, fragmentos: 1, total: 164220.00000000003 });
  assert.ok(quality.mayor >= 163240.00000000003);
});

test("4056900 common-band pool hashes are deterministic", () => {
  const context = createContext(lines, config);
  const run = () => {
    const pool = orderPatternPool(generateCommonBandPatterns(lines, config).patterns, context);
    return poolHashes(pool, context);
  };
  const a = run(), b = run(), c = run();
  assert.deepEqual(b, a); assert.deepEqual(c, a);
});

test("industrial portfolio auto-disables on large heterogeneous orders", () => {
  const heterogeneous = Array.from({ length: 31 }, (_, i) => ({ ref: String(i + 1), detalle: String(i + 1), cant: i === 0 ? 6 : 1,
    base: 300 + i * 17, altura: 80 + i * 11, veta: false, cantos: null }));
  assert.equal(selectIndustrialMode(heterogeneous).mode, "NOT_APPLICABLE");
  const result = generateIndustrialPortfolio(heterogeneous, { ...config, placaBase: 2750, placaAltura: 1830, refiladoX: 10, refiladoY: 10, sierra: 4.5 });
  assert.equal(result.status, "NOT_APPLICABLE");
  assert.equal(result.patterns.length, 0);
  assert.equal(result.telemetry.calls, 0);
});

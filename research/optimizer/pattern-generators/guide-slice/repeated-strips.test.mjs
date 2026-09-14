import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { createContext } from "../context.mjs";
import { orderPatternPool } from "../ordering.mjs";
import { detectRepeatedStrips, generateRepeatedStripPatterns } from "./repeated-strips.mjs";
import { selectIndustrialMode } from "./portfolio.mjs";
const require = createRequire(import.meta.url);
const { resolverCobertura } = require("../../../../src/lib/optimizer/legacy/cobertura.cjs");
const { materializar } = require("../../../../src/lib/optimizer/legacy/materializar.cjs");
const { validarPlanIndustrial } = require("../../../../src/lib/optimizer/legacy/validador_industrial_v3.cjs");

function fixture(id) {
  const raw = JSON.parse(readFileSync(new URL(`./fixtures/${id}-normalized.json`, import.meta.url), "utf8"));
  return { ...raw, lines: raw.lines.map((line) => ({ ...line })) };
}

function solve(raw) {
  const generated = generateRepeatedStripPatterns(raw.lines, raw.config);
  const context = createContext(raw.lines, raw.config);
  const ordered = orderPatternPool(generated.patterns, context);
  const demand = raw.lines.map((line) => line.cant);
  const coverage = resolverCobertura(
    ordered,
    demand,
    raw.config.placaBase * raw.config.placaAltura,
    Math.max(20, raw.referenceBoards + 8),
    20_000,
    { maxNodos: 1_600_000, watchdogMs: 60_000 },
  ).resolver(raw.lines.map((line) => line.base * line.altura));
  assert.ok(coverage.plan, `${raw.id}: expected exact coverage`);
  const plan = materializar(coverage.plan, raw.lines, raw.config);
  const expectedPieces = demand.reduce((a, b) => a + b, 0);
  const validation = validarPlanIndustrial(plan, expectedPieces);
  return { generated, ordered, coverage, plan, validation };
}

test("4050594 is classified as repeated strips, not hub/common-band", () => {
  const raw = fixture("4050594");
  const detected = detectRepeatedStrips(raw.lines, raw.config);
  assert.ok(detected);
  assert.ok(detected.stripTypes.length >= 2);
  assert.ok(detected.ratio >= 0.50);
  assert.equal(selectIndustrialMode(raw.lines, raw.config).mode, "REPEATED_STRIPS");
});

test("4058501 does not overtrigger repeated strips", () => {
  const raw = fixture("4058501");
  assert.equal(detectRepeatedStrips(raw.lines, raw.config), null);
  assert.equal(selectIndustrialMode(raw.lines, raw.config).mode, "NOT_APPLICABLE");
});

test("4050594 focused repeated-strips recovers the 7-board Master sentinel", () => {
  const raw = fixture("4050594");
  const out = solve(raw);
  assert.equal(out.generated.telemetry.calls, 1);
  assert.equal(out.coverage.placas, 7);
  assert.equal(out.validation.ok, true);
  assert.equal(out.validation.geometriaValida, true);
  assert.equal(out.validation.secuenciaCompleta, true);
});

test("4020442 repeated-strips stays at 2 boards with complete guillotine sequence", () => {
  const raw = fixture("4020442");
  const out = solve(raw);
  assert.equal(out.coverage.placas, 2);
  assert.equal(out.validation.ok, true);
  assert.equal(out.validation.geometriaValida, true);
  assert.equal(out.validation.secuenciaCompleta, true);
});

test("4020457 strong repeated-strips case reaches one valid guillotine board", () => {
  const raw = fixture("4020457");
  const out = solve(raw);
  assert.equal(out.coverage.placas, 1);
  assert.equal(out.validation.ok, true);
  assert.equal(out.validation.geometriaValida, true);
  assert.equal(out.validation.secuenciaCompleta, true);
});

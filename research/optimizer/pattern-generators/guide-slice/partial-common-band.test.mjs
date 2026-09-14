import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { detectPartialCommonBand, generatePartialCommonBandPatterns } from "./partial-common-band.mjs";
import { selectIndustrialMode } from "./portfolio.mjs";
const require = createRequire(import.meta.url);
const { validarPlanIndustrial } = require("../../../../src/lib/optimizer/legacy/validador_industrial_v3.cjs");
const { calidadPlanPlacas } = require("../../../../src/lib/optimizer/legacy/motor.cjs");

function fixture(id) {
  const raw = JSON.parse(readFileSync(new URL(`./fixtures/${id}-normalized.json`, import.meta.url), "utf8"));
  return { ...raw, lines: raw.lines.map((line) => ({ ...line })) };
}

function validateIncumbent(raw, generated) {
  assert.ok(generated.incumbent, `${raw.id}: expected incumbent`);
  const expectedPieces = raw.lines.reduce((sum, line) => sum + line.cant, 0);
  const validation = validarPlanIndustrial({ placas: generated.incumbent.placas, opts: raw.config }, expectedPieces);
  return { validation, quality: calidadPlanPlacas(generated.incumbent.placas, raw.config) };
}

test("4054100 partial common band detects the 600 mm family", () => {
  const raw = fixture("4054100");
  const d = detectPartialCommonBand(raw.lines, raw.config);
  assert.ok(d);
  assert.equal(d.orientation, "horizontal");
  assert.equal(d.dimension, 600);
  assert.equal(d.types.length, 3);
  assert.equal(selectIndustrialMode(raw.lines, raw.config).mode, "PARTIAL_COMMON_BAND");
});

test("4054100 escalation recovers the 2-board Legacy result with exact remnant", () => {
  const raw = fixture("4054100");
  const out = generatePartialCommonBandPatterns(raw.lines, raw.config);
  const { validation, quality } = validateIncumbent(raw, out);
  assert.equal(out.telemetry.calls, 5);
  assert.equal(out.incumbent.placas.length, 2);
  assert.equal(out.incumbent.kind, "escalation");
  assert.equal(validation.ok, true);
  assert.equal(validation.geometriaValida, true);
  assert.equal(validation.secuenciaCompleta, true);
  assert.ok(Math.abs(quality.mayor - 312800) < 1e-6);
  assert.ok(Math.abs(quality.segundo - 312800) < 1e-6);
  assert.equal(quality.fragmentos, 2);
});

test("4063272 escalation closes 4 to 3 boards without Beam or MultiVariantes", () => {
  const raw = fixture("4063272");
  const out = generatePartialCommonBandPatterns(raw.lines, raw.config);
  const { validation } = validateIncumbent(raw, out);
  assert.equal(out.incumbent.placas.length, 3);
  assert.equal(out.incumbent.kind, "escalation");
  assert.equal(validation.ok, true);
  assert.equal(validation.geometriaValida, true);
  assert.equal(validation.secuenciaCompleta, true);
});

test("large partial-band cases are gated out above 160 pieces", () => {
  const raw = fixture("4060744");
  assert.equal(raw.lines.reduce((sum, line) => sum + line.cant, 0), 186);
  assert.equal(detectPartialCommonBand(raw.lines, raw.config), null);
  const out = generatePartialCommonBandPatterns(raw.lines, raw.config);
  assert.equal(out.status, "NOT_APPLICABLE");
  assert.equal(out.patterns.length, 0);
  assert.equal(out.telemetry.calls, 0);
});

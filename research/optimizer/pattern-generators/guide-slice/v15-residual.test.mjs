import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { detectLargeRepeatedStrips, generateLargeRepeatedStripPatterns } from "./large-repeated-strips.mjs";
import { detectWeakPartialBand, generateWeakPartialBandPatterns } from "./weak-partial-band.mjs";
import { generateFastIncumbent } from "./fast-incumbent.mjs";
const require = createRequire(import.meta.url);
const { validarPlanIndustrial } = require("../../../../src/lib/optimizer/legacy/validador_industrial_v3.cjs");

function fx(name) { return JSON.parse(fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")); }
function valid(inc, pieces, config) {
  const v = validarPlanIndustrial({ placas: inc.placas, opts: config }, pieces);
  assert.equal(v.ok, true);
  assert.equal(v.geometriaValida, true);
  assert.equal(v.secuenciaCompleta, true);
}
function syntheticStrips(types) {
  return Array.from({ length: types }, (_, i) => ({ ref: `s${i}`, detalle: `s${i}`, cant: 2, base: 300 + i * 7, altura: 100, veta: false, cantos: null }));
}

test("LARGE_REPEATED_STRIPS gate accepts 20 and 40 type boundaries", () => {
  const config = { placaBase: 2740, placaAltura: 1820, refiladoX: 0, refiladoY: 0 };
  assert.ok(detectLargeRepeatedStrips(syntheticStrips(20), config));
  assert.ok(detectLargeRepeatedStrips(syntheticStrips(40), config));
});

test("LARGE_REPEATED_STRIPS produces a complete guillotine incumbent on a real representative", () => {
  const f = fx("large-repeated-central.json");
  const r = generateLargeRepeatedStripPatterns(f.lines, f.config);
  assert.equal(r.status, "COMPLETE");
  assert.ok(r.incumbent);
  valid(r.incumbent, f.pieces, f.config);
  assert.equal(r.telemetry.calls, 3);
});

test("WEAK_PARTIAL_BAND detects and generates a valid incumbent on a real representative", () => {
  const f = fx("weak-partial-central.json");
  assert.ok(detectWeakPartialBand(f.lines, f.config));
  const r = generateWeakPartialBandPatterns(f.lines, f.config);
  assert.equal(r.status, "COMPLETE");
  valid(r.incumbent, f.pieces, f.config);
  assert.equal(r.telemetry.calls, 5);
});

test("WEAK_PARTIAL_BAND keeps the 19-type anti-regression ceiling", () => {
  const config = {};
  const lines = Array.from({ length: 20 }, (_, i) => ({ ref: `${i}`, cant: 1, base: 400 + i * 3, altura: i < 9 ? 300 : 401 + i }));
  assert.equal(detectWeakPartialBand(lines, config), null);
});

test("GENERIC_FAST_INCUMBENT is valid and explicitly requires fallback certification", () => {
  const f = fx("generic-fast-central.json");
  const r = generateFastIncumbent(f.lines, f.config);
  valid(r.incumbent, f.pieces, f.config);
  assert.equal(r.telemetry.executionClass, "SYNC_CANDIDATE");
  assert.equal(r.telemetry.requiresFallbackCertification, true);

  const small = [{ ref: "x", detalle: "x", cant: 161, base: 100, altura: 100, veta: false, cantos: null }];
  const rb = generateFastIncumbent(small, { ...f.config, placaBase: 2740, placaAltura: 1820 });
  assert.equal(rb.telemetry.executionClass, "BACKGROUND_CANDIDATE");
  assert.equal(rb.telemetry.requiresFallbackCertification, true);
});

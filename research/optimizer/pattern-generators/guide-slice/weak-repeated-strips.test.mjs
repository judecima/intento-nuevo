import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { detectWeakRepeatedStrips, generateWeakRepeatedStripPatterns } from "./weak-repeated-strips.mjs";
import { selectIndustrialMode } from "./portfolio.mjs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { validarPlanIndustrial } = require("../../../../src/lib/optimizer/legacy/validador_industrial_v3.cjs");

const fixture = JSON.parse(readFileSync(new URL("./fixtures/4026528-weak-repeated-normalized.json", import.meta.url), "utf8"));
const lines = fixture.lines.map((line) => ({ ...line }));
const config = { ...fixture.config };

test("weak repeated strips accepts the real 19-type representative", () => {
  const detected = detectWeakRepeatedStrips(lines, config);
  assert.ok(detected);
  assert.equal(lines.length, 19);
  assert.ok(detected.ratio >= 0.30);
  assert.equal(selectIndustrialMode(lines, config).mode, "WEAK_REPEATED_STRIPS");
});

test("weak repeated strips rejects the 20-type boundary", () => {
  const twenty = Array.from({ length: 20 }, (_, i) => ({
    ref: String(i + 1), detalle: String(i + 1), base: 500 + i, altura: 100,
    cant: 2, veta: false, cantos: null,
  }));
  assert.equal(detectWeakRepeatedStrips(twenty, config), null);
});

test("weak repeated strips produces a valid complete incumbent on 4026528", () => {
  const result = generateWeakRepeatedStripPatterns(lines, config);
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.telemetry.calls, 2);
  assert.deepEqual(result.telemetry.seeds, [1000, 1004]);
  assert.ok(result.incumbent);
  assert.equal(result.incumbent.placas.length, fixture.expectedBoards);
  const validation = validarPlanIndustrial({ placas: result.incumbent.placas, opts: config }, lines.reduce((sum, line) => sum + line.cant, 0));
  assert.equal(validation.ok, true);
  assert.equal(validation.geometriaValida, true);
  assert.equal(validation.secuenciaCompleta, true);
});

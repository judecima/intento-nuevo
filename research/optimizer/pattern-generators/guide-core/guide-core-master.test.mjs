import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  GUIDE_CORE_MODES,
  runGuideCoreMaster,
} from "./guide-core-master.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const CONFIG_4056900 = {
  placaBase: 2740, placaAltura: 1820, refiladoX: 0, refiladoY: 0,
  sierra: 4.4, etapas: 4, materialConVeta: false,
  descontarCanto: false, cantoEspesor: 0, restoMin: 250, restoMax: 400,
  usarCache: true, maxPiezasCache: 160,
};
const LINES_4056900 = [
  { ref: "1", detalle: "1", cant: 16, base: 2000, altura: 350, veta: false, cantos: null },
  { ref: "2", detalle: "2", cant: 24, base: 964, altura: 350, veta: false, cantos: null },
  { ref: "3", detalle: "3", cant: 30, base: 378, altura: 350, veta: false, cantos: null },
  { ref: "4", detalle: "4", cant: 24, base: 564, altura: 350, veta: false, cantos: null },
];

const CONFIG_4057401 = {
  placaBase: 2742, placaAltura: 1822, refiladoX: 0, refiladoY: 0,
  sierra: 4.5, etapas: 4, materialConVeta: false,
  descontarCanto: false, cantoEspesor: 0, restoMin: 250, restoMax: 400,
  usarCache: true, maxPiezasCache: 160,
};
const LINES_4057401 = [
  { ref: "1", detalle: "1", cant: 2, base: 1800, altura: 1050, veta: false, cantos: null },
  { ref: "3", detalle: "3", cant: 2, base: 2000, altura: 1100, veta: false, cantos: null },
  { ref: "2", detalle: "2", cant: 1, base: 1900, altura: 1500, veta: false, cantos: null },
  { ref: "4", detalle: "4", cant: 14, base: 744, altura: 450, veta: false, cantos: null },
];

function load4050594() {
  return JSON.parse(
    readFileSync(
      join(HERE, "..", "guide-slice", "fixtures", "4050594-normalized.json"),
      "utf8",
    ),
  );
}

test("Guide-Core mode set remains intentionally narrow", () => {
  assert.deepEqual([...GUIDE_CORE_MODES], [
    "COMMON_BAND",
    "GUIDE_HUB",
    "REPEATED_STRIPS",
  ]);
});

test("gap > 1 bypasses Guide-Core before generation", () => {
  const result = runGuideCoreMaster(LINES_4057401, CONFIG_4057401, {
    lowerBound: 3,
    incumbentBoards: 5,
  });
  assert.equal(result.status, "FALLBACK_REQUIRED");
  assert.equal(result.stage, "GAP_ROUTER");
  assert.equal(result.telemetry.calls, 0);
  assert.equal(result.telemetry.patterns, 0);
});

test("4050594 reaches 7 boards with Guide-Core", () => {
  const fixture = load4050594();
  const result = runGuideCoreMaster(fixture.lines, fixture.config, {
    lowerBound: 7,
    incumbentBoards: 8,
    masterLimitMs: 5000,
  });
  assert.equal(result.status, "CERTIFIED");
  assert.equal(result.placas, 7);
  assert.equal(result.validation?.ok, true);
  assert.equal(result.telemetry.mode, "REPEATED_STRIPS");
});

test("4056900 reaches 6 boards with Guide-Core", () => {
  const result = runGuideCoreMaster(LINES_4056900, CONFIG_4056900, {
    lowerBound: 6,
    incumbentBoards: 7,
    masterLimitMs: 5000,
  });
  assert.equal(result.status, "CERTIFIED");
  assert.equal(result.placas, 6);
  assert.equal(result.validation?.ok, true);
  assert.equal(result.telemetry.mode, "COMMON_BAND");
});

test("4057401 reaches 4 boards with Guide-Core", () => {
  const result = runGuideCoreMaster(LINES_4057401, CONFIG_4057401, {
    lowerBound: 4,
    incumbentBoards: 5,
    masterLimitMs: 5000,
  });
  assert.equal(result.status, "CERTIFIED");
  assert.equal(result.placas, 4);
  assert.equal(result.validation?.ok, true);
  assert.equal(result.telemetry.mode, "GUIDE_HUB");
});

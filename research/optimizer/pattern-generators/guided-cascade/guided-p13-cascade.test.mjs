import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  P13_FROZEN_ROUNDS,
  runGuidedP13Cascade,
} from "./guided-p13-cascade.mjs";

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
  const path = join(HERE, "..", "guide-slice", "fixtures", "4050594-normalized.json");
  return JSON.parse(readFileSync(path, "utf8"));
}

test("gap > 1 routes directly to fallback without speculative generation", () => {
  const result = runGuidedP13Cascade(LINES_4057401, CONFIG_4057401, {
    lowerBound: 3,
    incumbentBoards: 5,
  });
  assert.equal(result.status, "FALLBACK_REQUIRED");
  assert.equal(result.stage, "GAP_ROUTER");
  assert.equal(result.certified, false);
  assert.equal(result.telemetry.monotypes, 0);
  assert.equal(result.telemetry.guide, null);
  assert.equal(result.telemetry.p13, null);
});

test("frozen P13 portfolio stays exactly the published 13 rounds", () => {
  assert.deepEqual([...P13_FROZEN_ROUNDS], [0, 7, 11, 12, 14, 15, 16, 17, 18, 19, 21, 26, 35]);
});

test("4056900 closes at the lower bound in the guided family stage", () => {
  const result = runGuidedP13Cascade(LINES_4056900, CONFIG_4056900, {
    lowerBound: 6,
    incumbentBoards: 7,
    guideMasterLimitMs: 5_000,
    p13MasterLimitMs: 5_000,
  });
  assert.equal(result.status, "CERTIFIED");
  assert.equal(result.stage, "GUIDE");
  assert.equal(result.placas, 6);
  assert.equal(result.validation?.ok, true);
  assert.equal(result.telemetry.p13, null);
});

test("4057401 closes at the lower bound in the guided family stage", () => {
  const result = runGuidedP13Cascade(LINES_4057401, CONFIG_4057401, {
    lowerBound: 4,
    incumbentBoards: 5,
    guideMasterLimitMs: 5_000,
    p13MasterLimitMs: 5_000,
  });
  assert.equal(result.status, "CERTIFIED");
  assert.equal(result.stage, "GUIDE");
  assert.equal(result.placas, 4);
  assert.equal(result.validation?.ok, true);
  assert.equal(result.telemetry.p13, null);
});

test("4050594 escalates from guide to P13 and closes at the lower bound", () => {
  const fixture = load4050594();
  const result = runGuidedP13Cascade(fixture.lines, fixture.config, {
    lowerBound: 7,
    incumbentBoards: 8,
    guideMasterLimitMs: 5_000,
    p13MasterLimitMs: 5_000,
  });
  assert.equal(result.status, "CERTIFIED");
  assert.equal(result.stage, "P13");
  assert.equal(result.placas, 7);
  assert.equal(result.validation?.ok, true);
  assert.deepEqual(result.telemetry.p13?.rounds, [...P13_FROZEN_ROUNDS]);
});

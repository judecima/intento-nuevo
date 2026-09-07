#!/usr/bin/env node
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { optimizar } = require("../src/lib/optimizer/legacy/motor.cjs");
const { validarPlanIndustrial } = require("../src/lib/optimizer/legacy/validador_industrial_v3.cjs");
const { defragmentarPlanPorPlaca } = require("../src/lib/optimizer/experimental/per-board-remnant-defrag.cjs");

const lines = [
  { ref: "A", detalle: "A", cant: 2, base: 420, altura: 380, veta: false },
  { ref: "B", detalle: "B", cant: 1, base: 510, altura: 300, veta: false },
  { ref: "C", detalle: "C", cant: 2, base: 280, altura: 240, veta: false },
];
const pieces = lines.reduce((sum, x) => sum + x.cant, 0);
const config = {
  placaBase: 1000,
  placaAltura: 1000,
  refiladoX: 0,
  refiladoY: 0,
  sierra: 5,
  etapas: 4,
  materialConVeta: false,
  descontarCanto: false,
  cantoEspesor: 0,
  restoMin: 100,
  restoMax: 250,
  semilla: 20260812,
};

const base = optimizar(lines, config);
const before = base.resumen.placas;
const repaired = defragmentarPlanPorPlaca(base, { piezasEsperadas: pieces });
const after = repaired.plan.resumen.placas;
const validation = validarPlanIndustrial(repaired.plan, pieces);

const summary = {
  before,
  after,
  changed: repaired.changed,
  attemptedBoards: repaired.attemptedBoards,
  improvedBoards: repaired.improvedBoards,
  rejectedBoards: repaired.rejectedBoards,
  invalidFinal: repaired.invalidFinal,
  validationOk: !!validation?.ok,
  ms: repaired.ms,
};
console.log(JSON.stringify(summary, null, 2));

if (before !== after || repaired.invalidFinal || !validation?.ok) {
  console.error("V20 REMNANT DEFRAG SMOKE FAIL");
  process.exit(1);
}

console.log("V20 REMNANT DEFRAG SMOKE OK");

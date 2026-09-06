#!/usr/bin/env node
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { optimizarV10 } = require("../src/lib/optimizer/legacy/v10.cjs");

const lines = [
  { ref: "A", detalle: "A", cant: 1, base: 600, altura: 600, veta: false },
  { ref: "B", detalle: "B", cant: 1, base: 600, altura: 500, veta: false },
];

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
  usarOneBoard: false,
  usarMultiSlice: false,
  usarCompactacion: false,
  usarMaster: true,
  rondasPatrones: 40,
  msMaster: 100,
};

const off = optimizarV10(lines, config);
const on = optimizarV10(lines, { ...config, usarV21FamilyMaster: true });

const summary = {
  offBoards: off.plan?.resumen?.placas ?? null,
  onBoards: on.plan?.resumen?.placas ?? null,
  cota: on.cota ?? null,
  offMasterRuns: off.metricas?.master?.activaciones ?? null,
  onMasterRuns: on.metricas?.master?.activaciones ?? null,
};
console.log(JSON.stringify(summary, null, 2));

const ok =
  summary.offBoards === summary.onBoards &&
  summary.offMasterRuns === 1 &&
  summary.onMasterRuns === 1;

if (!ok) {
  console.error("V21 FAMILY MASTER SMOKE FAIL: no correr benchmark largo");
  process.exit(1);
}
console.log("V21 FAMILY MASTER SMOKE OK");

#!/usr/bin/env node
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { optimizarV10 } = require("../src/lib/optimizer/legacy/v10.cjs");

const lines = [
  { ref: "A", detalle: "pieza A", cant: 1, base: 600, altura: 600, veta: false },
  { ref: "B", detalle: "pieza B", cant: 1, base: 600, altura: 500, veta: false },
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
  msMaster: 25,
  rondasPatrones: 4,
};

const legacy = optimizarV10(lines, config);
const v21 = optimizarV10(lines, { ...config, usarV21FamilyPatterns: true });

const summary = {
  legacyBoards: legacy.plan?.resumen?.placas ?? null,
  v21Boards: v21.plan?.resumen?.placas ?? null,
  cota: v21.cota ?? null,
  familyRuns: v21.metricas?.v21?.familyRuns ?? null,
  familyCertified: v21.metricas?.v21?.familyCertified ?? null,
  fallbackRuns: v21.metricas?.v21?.fallbackRuns ?? null,
  familySeeds: v21.metricas?.v21?.familySeeds ?? null,
  fastPoolSize: v21.metricas?.v21?.fastPoolSize ?? null,
  errors: v21.metricas?.v21?.errors ?? null,
};

console.log(JSON.stringify(summary, null, 2));

const ok =
  summary.legacyBoards === summary.v21Boards &&
  summary.familyRuns === 1 &&
  summary.familyCertified === 0 &&
  summary.fallbackRuns === 1 &&
  summary.familySeeds > 0 &&
  summary.fastPoolSize > 0 &&
  summary.errors === 0;

if (!ok) {
  console.error("V21 FAMILY SMOKE FAIL: no correr el benchmark largo");
  process.exit(1);
}

console.log("V21 FAMILY SMOKE OK");

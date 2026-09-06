#!/usr/bin/env node
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const v10 = require("../src/lib/optimizer/legacy/v10.cjs");

const lines = [
  { ref: "A", detalle: "cuadrado grande", cant: 1, base: 600, altura: 600, veta: false },
  { ref: "B", detalle: "rectangulo incompatible", cant: 1, base: 600, altura: 500, veta: false },
];

const config = {
  placaBase: 1000,
  placaAltura: 1000,
  // Intencionalmente sin refiladoX/refiladoY: este smoke cubre el bug de
  // precedencia `+undefined ?? 0` que anulaba silenciosamente la cheap LB.
  sierra: 5,
  etapas: 4,
  materialConVeta: false,
  descontarCanto: false,
  cantoEspesor: 0,
  restoMin: 100,
  restoMax: 250,
  usarOneBoard: false,
  usarMaster: false,
  usarMultiSlice: false,
  usarCompactacion: true,
  usarCotaBarataAntesCompactacion: true,
};

const result = v10.optimizarV10(lines, config, v10.nuevasMetricas());
const lb = result.metricas?.lowerBound || {};
const summary = {
  boards: result.plan?.resumen?.placas ?? null,
  areaLB: result.cotaArea ?? null,
  finalLB: result.cota ?? null,
  cheapRuns: lb.cheapRuns ?? 0,
  cheapValue: lb.cheapValue ?? 0,
  cheapCertified: lb.cheapCertified ?? 0,
  cheapErrors: lb.cheapErrors ?? 0,
  cheapViolation: lb.cheapViolation ?? 0,
  compactationRuns: result.metricas?.compactacion?.activaciones ?? 0,
};

console.log(JSON.stringify(summary, null, 2));

const ok =
  summary.boards === 2 &&
  summary.areaLB === 1 &&
  summary.finalLB === 2 &&
  summary.cheapRuns > 0 &&
  summary.cheapValue > 0 &&
  summary.cheapCertified > 0 &&
  summary.cheapErrors === 0 &&
  summary.cheapViolation === 0 &&
  summary.compactationRuns === 0;

if (!ok) {
  console.error("V20 cheap-LB smoke FAILED: do not run the 213-case benchmark.");
  process.exit(1);
}

console.log("V20 cheap-LB smoke OK");

#!/usr/bin/env node
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { generarPatrones } = require("../src/lib/optimizer/legacy/patrones.cjs");
const { validarPlacaIndustrial } = require("../src/lib/optimizer/legacy/validador_industrial_v3.cjs");

// Geometría real del caso histórico 4058501. El smoke no usa el ID del pedido
// ni inyecta un vector ganador: el vector debe surgir de la regla R1.
const lines = [
  { ref: "1", base: 699.2, altura: 749.2, cant: 4, veta: false },
  { ref: "2", base: 699.6, altura: 740, cant: 10, veta: false },
  { ref: "3", base: 799.2, altura: 449.2, cant: 6, veta: false },
  { ref: "4", base: 849.2, altura: 199.2, cant: 2, veta: false },
  { ref: "5", base: 999.2, altura: 449.2, cant: 3, veta: false },
  { ref: "6", base: 999.2, altura: 499.2, cant: 4, veta: false },
  { ref: "7", base: 999.2, altura: 799.2, cant: 6, veta: false },
  { ref: "8", base: 1399.2, altura: 869.2, cant: 1, veta: false },
  { ref: "9", base: 1475.6, altura: 500, cant: 6, veta: false },
  { ref: "10", base: 1479.2, altura: 499.2, cant: 4, veta: false },
  { ref: "11", base: 1999.2, altura: 699.2, cant: 4, veta: false },
];

const config = {
  placaBase: 2600,
  placaAltura: 1830,
  refiladoX: 0,
  refiladoY: 0,
  sierra: 4.5,
  etapas: 4,
  materialConVeta: false,
  descontarCanto: false,
  cantoEspesor: 0,
  restoMin: 250,
  restoMax: 400,
};

const legacyZero = generarPatrones(lines, config, 0);
const directed = generarPatrones(lines, { ...config, usarV21FamilyMaster: true }, 0);

const gold = directed.find((pattern) =>
  pattern.uso.get(1) === 6 &&
  pattern.uso.get(2) === 1 &&
  pattern.uso.get(4) === 1
);
const residual = directed.find((pattern) =>
  pattern.uso.size === 1 && pattern.uso.get(1) === 4
);
const validation = gold
  ? validarPlacaIndustrial(gold.placa, { ...config, anchoUtil: 2600, altoUtil: 1830 })
  : null;

const summary = {
  legacyZeroPatterns: legacyZero.length,
  directedPatterns: directed.length,
  goldFound: !!gold,
  residual4Found: !!residual,
  goldOrigin: gold?._patternMeta?.origin ?? null,
  goldPieces: gold?.placa?.colocadas?.length ?? null,
  geometryOk: validation?.geometriaValida ?? false,
  sequenceOk: validation?.secuenciaValida ?? false,
  sequenceComplete: validation?.secuenciaCompleta ?? false,
  liberated: validation?.liberadas ?? 0,
};
console.log(JSON.stringify(summary, null, 2));

const ok =
  summary.legacyZeroPatterns === 0 &&
  summary.directedPatterns > 0 &&
  summary.directedPatterns <= 24 &&
  summary.goldFound &&
  summary.residual4Found &&
  summary.goldOrigin === "repetitive-family+filler" &&
  summary.goldPieces === 8 &&
  summary.geometryOk &&
  summary.sequenceOk &&
  summary.sequenceComplete &&
  summary.liberated === 8;

if (!ok) {
  console.error("V21 DIRECT FAMILY SMOKE FAIL: no correr benchmark largo");
  process.exit(1);
}
console.log("V21 DIRECT FAMILY SMOKE OK");

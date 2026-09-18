"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  optimizarV10,
  nuevasMetricas,
  validarPlanIndustrial,
} = require("../../../src/lib/optimizer/legacy/v10.cjs");

const HERE = __dirname;
const EXPECTED = {
  "4050594": 7,
  "4056900": 6,
  "4057401": 4,
  "4059200": 17,
};

function toLegacy(input) {
  const lines = input.pieces.map((piece, index) => ({
    ref: piece.reference || String(index + 1),
    detalle: piece.description || piece.reference || `Piece ${index + 1}`,
    cant: piece.quantity,
    base: piece.width,
    altura: piece.height,
    veta: Boolean(piece.grain || piece.canRotate === false),
    edgeType: piece.edgeType || "none",
    cantos: piece.edges
      ? {
          arr: Boolean(piece.edges.top),
          aba: Boolean(piece.edges.bottom),
          izq: Boolean(piece.edges.left),
          der: Boolean(piece.edges.right),
        }
      : null,
  }));

  const totalPieces = lines.reduce((sum, line) => sum + line.cant, 0);
  const cacheLimit = totalPieces <= 160 ? 160 : 0;

  const config = {
    placaBase: input.board.width,
    placaAltura: input.board.height,
    refiladoX: input.trim?.x || 0,
    refiladoY: input.trim?.y || 0,
    sierra: input.kerf,
    etapas: input.constraints?.stages || 4,
    materialConVeta:
      Boolean(input.material?.hasGrain) ||
      input.pieces.some((piece) => piece.canRotate === false),
    descontarCanto: false,
    cantoEspesor: 0,
    restoMin: input.constraints?.minRemnant ?? 250,
    restoMax:
      input.constraints?.minCommercialRemnantLongSide ??
      Math.max(input.constraints?.minRemnant ?? 250, 400),
    usarOneBoard: input.constraints?.allowOneBoard !== false,
    usarMaster: input.constraints?.allowPatternMaster !== false,
    usarMultiSlice: input.constraints?.allowMultiSlice !== false,
    usarCompactacion: input.constraints?.allowDeadStripCompaction !== false,
    usarRustPatternGenerator: true,
    usarCache: cacheLimit > 0,
    maxPiezasCache: cacheLimit,
    usarCotaBarataAntesMaster: true,
    rondasPatrones: 40,
    msMaster: 8000,
  };

  return { lines, config };
}

for (const [id, expected] of Object.entries(EXPECTED)) {
  const input = JSON.parse(
    fs.readFileSync(path.join(HERE, "fixtures", id + ".json"), "utf8"),
  );
  const { lines, config } = toLegacy(input);
  const expectedPieces = lines.reduce((sum, line) => sum + line.cant, 0);

  const result = optimizarV10(lines, config, nuevasMetricas());
  const boards = result.plan?.resumen?.placas;
  const validation = validarPlanIndustrial(result.plan, expectedPieces);

  if (boards !== expected) {
    throw new Error(`${id}: expected ${expected} boards, got ${boards}`);
  }
  if (!validation?.ok) {
    throw new Error(`${id}: Industrial V3 failed`);
  }
  if (config._rustPatternGeneratorFallback === true) {
    throw new Error(`${id}: Rust Pattern Master fell back to JS`);
  }
  if (config._rustPatternGeneratorUsed !== "rust") {
    throw new Error(`${id}: Rust Pattern Master did not execute`);
  }
  if (result.metricas?.lowerBound?.preMasterCertified > 0) {
    throw new Error(`${id}: pre-Master LB incorrectly intercepted a historical winner`);
  }

  console.log(
    "SAFE_STACK_WINNER " +
      JSON.stringify({
        id,
        boards,
        valid: validation.ok,
        rust: config._rustPatternGeneratorUsed,
        preMasterLB: result.metricas?.lowerBound?.preMasterValue ?? null,
        preMasterCertified: result.metricas?.lowerBound?.preMasterCertified ?? 0,
      }),
  );
}

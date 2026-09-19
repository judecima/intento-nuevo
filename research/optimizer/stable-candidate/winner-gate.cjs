"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  optimizarV10,
  nuevasMetricas,
  validarPlanIndustrial,
} = require("../../../src/lib/optimizer/legacy/v10.cjs");
const {
  calidadPlanPlacas,
  compararCalidad,
} = require("../../../src/lib/optimizer/legacy/motor.cjs");

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
    rondasPatrones: 40,
    msMaster: 8000,
  };

  return { lines, config };
}

function run(lines, config, safeStack) {
  const local = {
    ...config,
    usarCotaBarataPostCompactacion: safeStack,
    usarDffFs0PostCompactacion: safeStack,
    usarMascarasUnicasMasterLe4: safeStack,
  };
  const result = optimizarV10(lines, local, nuevasMetricas());
  return { result, config: local };
}

for (const [id, expected] of Object.entries(EXPECTED)) {
  const input = JSON.parse(
    fs.readFileSync(path.join(HERE, "fixtures", id + ".json"), "utf8"),
  );
  const { lines, config } = toLegacy(input);
  const expectedPieces = lines.reduce((sum, line) => sum + line.cant, 0);

  const baseline = run(lines, config, false);
  const candidate = run(lines, config, true);

  const baseBoards = baseline.result.plan?.resumen?.placas;
  const candBoards = candidate.result.plan?.resumen?.placas;
  const baseValidation = validarPlanIndustrial(baseline.result.plan, expectedPieces);
  const candValidation = validarPlanIndustrial(candidate.result.plan, expectedPieces);

  if (!baseValidation?.ok) throw new Error(`${id}: baseline Industrial V3 failed`);
  if (!candValidation?.ok) throw new Error(`${id}: candidate Industrial V3 failed`);
  if (baseBoards !== expected) {
    throw new Error(`${id}: baseline expected ${expected} boards, got ${baseBoards}`);
  }
  if (candBoards !== expected) {
    throw new Error(`${id}: candidate expected ${expected} boards, got ${candBoards}`);
  }
  if (candBoards > baseBoards) {
    throw new Error(`${id}: board regression ${baseBoards} -> ${candBoards}`);
  }

  if (candBoards === baseBoards) {
    const baseQuality = calidadPlanPlacas(
      baseline.result.plan.placas,
      baseline.result.plan.opts || baseline.config,
    );
    const candQuality = calidadPlanPlacas(
      candidate.result.plan.placas,
      candidate.result.plan.opts || candidate.config,
    );
    if (compararCalidad(candQuality, baseQuality) < 0) {
      throw new Error(`${id}: remnant-quality regression`);
    }
  }

  if (candidate.config._rustPatternGeneratorFallback === true) {
    throw new Error(`${id}: Rust Pattern Master fell back to JS`);
  }

  console.log("STABLE_CANDIDATE " + JSON.stringify({
    id,
    pieces: expectedPieces,
    types: lines.length,
    baselineBoards: baseBoards,
    candidateBoards: candBoards,
    postCompactCertified:
      candidate.result.metricas?.lowerBound?.postCompactCertified ?? 0,
    postCompactValue:
      candidate.result.metricas?.lowerBound?.postCompactValue ?? null,
    maskPolicy: candidate.config._patternMaskPolicy ?? null,
    rust: candidate.config._rustPatternGeneratorUsed ?? null,
  }));
}

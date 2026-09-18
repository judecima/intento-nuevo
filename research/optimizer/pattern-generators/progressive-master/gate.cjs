"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const { optimizarV10, nuevasMetricas, validarPlanIndustrial } = require("../../../../src/lib/optimizer/legacy/v10.cjs");
const { generarPatrones, patronesMonotipo } = require("../../../../src/lib/optimizer/legacy/patrones.cjs");
const { resolverCobertura } = require("../../../../src/lib/optimizer/legacy/cobertura.cjs");
const { materializar } = require("../../../../src/lib/optimizer/legacy/materializar.cjs");
const {
  compareTuple,
  qualityTuple,
  runProgressivePatternMaster,
} = require("./progressive-master.cjs");

const IDS = ["4050594", "4056900", "4057401", "4059200"];
const EXPECTED = { "4050594": 7, "4056900": 6, "4057401": 4, "4059200": 17 };
const FIXTURE_DIR = path.join(__dirname, "fixtures");

function toLegacy(input) {
  const lines = input.pieces.map((piece, index) => ({
    ref: piece.reference || String(index + 1),
    detalle: piece.description || piece.reference || `Piece ${index + 1}`,
    cant: piece.quantity,
    base: piece.width,
    altura: piece.height,
    veta: Boolean(piece.grain || piece.canRotate === false),
    edgeType: piece.edgeType ?? "none",
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
    refiladoX: input.trim.x,
    refiladoY: input.trim.y,
    sierra: input.kerf,
    etapas: input.constraints.stages ?? 4,
    materialConVeta:
      Boolean(input.material.hasGrain) ||
      input.pieces.some((piece) => piece.canRotate === false),
    descontarCanto: false,
    cantoEspesor: 0,
    restoMin: input.constraints.minRemnant,
    restoMax:
      input.constraints.minCommercialRemnantLongSide ??
      Math.max(input.constraints.minRemnant, 400),
    usarOneBoard: input.constraints.allowOneBoard !== false,
    usarMaster: true,
    usarMultiSlice: input.constraints.allowMultiSlice !== false,
    usarCompactacion: input.constraints.allowDeadStripCompaction !== false,
    usarRustPatternGenerator: true,
    usarCache: cacheLimit > 0,
    maxPiezasCache: cacheLimit,
    rondasPatrones: 40,
    msMaster: 8000,
  };

  return { lines, config };
}

function runFullMaster(lines, config, pre) {
  const start = performance.now();
  const generationStart = performance.now();
  const generated = generarPatrones(lines, config, config.rondasPatrones || 40);
  const monotypes = patronesMonotipo(lines, config);
  const generationMs = performance.now() - generationStart;

  const areaPlaca =
    (config.placaBase - (config.refiladoX || 0)) *
    (config.placaAltura - (config.refiladoY || 0));
  const solverStart = performance.now();
  const solver = resolverCobertura(
    generated.concat(monotypes),
    lines.map((line) => line.cant),
    areaPlaca,
    pre.plan.resumen.placas,
    config.msMaster || 8000,
  );
  const solution = solver
    ? solver.resolver(lines.map((line) => line.base * line.altura))
    : null;
  const solverMs = performance.now() - solverStart;
  const candidate =
    solution?.plan
      ? materializar(solution.plan, lines, pre.plan.opts)
      : null;
  const validation = candidate
    ? validarPlanIndustrial(
        candidate,
        lines.reduce((sum, line) => sum + line.cant, 0),
      )
    : null;

  return {
    candidate,
    validation,
    valid: Boolean(candidate && validation?.ok),
    generated,
    monotypes,
    solution,
    generationMs,
    solverMs,
    totalMs: performance.now() - start,
  };
}

const rows = [];

for (const id of IDS) {
  const input = JSON.parse(
    fs.readFileSync(path.join(FIXTURE_DIR, id + ".json"), "utf8"),
  );
  const { lines, config } = toLegacy(input);

  // This reconstructs exactly the incumbent and lower bound immediately before
  // Pattern Master, but disables Master itself.
  const pre = optimizarV10(
    lines,
    { ...config, usarMaster: false },
    nuevasMetricas(),
  );

  const full = runFullMaster(lines, config, pre);
  if (!full.valid) throw new Error(`${id}: full Master candidate invalid`);
  if (full.candidate.resumen.placas !== EXPECTED[id]) {
    throw new Error(
      `${id}: full Master expected ${EXPECTED[id]} boards, got ${full.candidate.resumen.placas}`,
    );
  }

  const progressive = runProgressivePatternMaster(
    lines,
    config,
    {
      opts: pre.plan.opts,
      incumbentBoards: pre.plan.resumen.placas,
      lowerBound: pre.cota,
      rounds: config.rondasPatrones || 40,
      probeMaxNodes: 100000,
      finalMs: config.msMaster || 8000,
    },
  );

  if (!progressive.candidate || !progressive.validation?.ok) {
    throw new Error(`${id}: progressive candidate invalid or absent`);
  }
  if (progressive.candidate.resumen.placas !== full.candidate.resumen.placas) {
    throw new Error(
      `${id}: board regression full=${full.candidate.resumen.placas} progressive=${progressive.candidate.resumen.placas}`,
    );
  }

  const fullQ = qualityTuple(full.candidate);
  const progressiveQ = qualityTuple(progressive.candidate);
  const qualityCmp = compareTuple(progressiveQ, fullQ);

  if (qualityCmp < 0) {
    throw new Error(
      `${id}: remnant regression full=${JSON.stringify(fullQ)} progressive=${JSON.stringify(progressiveQ)}`,
    );
  }

  const row = {
    id,
    incumbentBoards: pre.plan.resumen.placas,
    lowerBound: pre.cota,
    full: {
      boards: full.candidate.resumen.placas,
      valid: full.valid,
      generatedPatterns: full.generated.length,
      monotypes: full.monotypes.length,
      nodes: full.solution?.nodos ?? null,
      exhausted: Boolean(full.solution?.agotado),
      generationMs: full.generationMs,
      solverMs: full.solverMs,
      totalMs: full.totalMs,
      quality: fullQ,
    },
    progressive: {
      status: progressive.status,
      certifiedRound: progressive.status === "CERTIFIED_EARLY" ? progressive.round : null,
      boards: progressive.candidate.resumen.placas,
      valid: Boolean(progressive.validation?.ok),
      finalPoolSize: progressive.generatedPool.length,
      monotypes: progressive.monotypes.length,
      quality: progressiveQ,
      qualityVsFull: qualityCmp,
      ...progressive.telemetry,
    },
  };

  rows.push(row);
  console.log("PROGRESSIVE_ROW " + JSON.stringify(row));
}

const summary = {
  operation: "progressive-pattern-master-gate",
  cases: rows.length,
  exactBoardParity: rows.every((row) => row.full.boards === row.progressive.boards),
  noRemnantRegression: rows.every((row) => row.progressive.qualityVsFull >= 0),
  valid: rows.every((row) => row.full.valid && row.progressive.valid),
  earlyCertified: rows.filter((row) => row.progressive.status === "CERTIFIED_EARLY").length,
  rows,
};

console.log("PROGRESSIVE_SUMMARY " + JSON.stringify(summary, null, 2));

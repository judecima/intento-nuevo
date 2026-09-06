"use strict";

const { generarPatrones, claveVector } = require("../legacy/patrones.cjs");
const { resolverCobertura } = require("../legacy/cobertura.cjs");
const { materializar } = require("../legacy/materializar.cjs");
const { validarPlanIndustrial } = require("../legacy/validador_industrial_v3.cjs");
const { generateFurnitureFamilyPatterns } = require("./furniture-pattern-generator.cjs");

function dedupePatterns(patterns) {
  const byVector = new Map();
  for (const pattern of patterns || []) {
    if (!pattern?.uso) continue;
    const key = claveVector(pattern.uso);
    const previous = byVector.get(key);
    if (!previous || (+pattern.area || 0) > (+previous.area || 0)) byVector.set(key, pattern);
  }
  return [...byVector.values()];
}

function annotateRandomPatterns(patterns) {
  return (patterns || []).map((pattern, index) => ({
    ...pattern,
    _patternMeta: pattern._patternMeta || {
      origin: "random-fast",
      firstSeenRound: index === 0 ? 0 : null,
      sourceRound: null,
    },
  }));
}

function runV21FamilyMaster(lineas, config, context = {}) {
  const started = Date.now();
  const demand = lineas.map((line) => +line.cant || 0);
  const areas = lineas.map((line) => (+line.base || 0) * (+line.altura || 0));
  const incumbentBoards = +context.incumbentBoards;
  const cota = +context.cota;
  const areaPlaca = +context.areaPlaca;
  const expectedPieces = +context.expectedPieces;
  const baselineOpts = context.baselineOpts || config;
  const randomRounds = Math.max(1, Math.floor(context.randomRounds ?? 4));
  const maxSolveMs = Math.max(50, Math.floor(context.maxSolveMs ?? 750));

  const family = generateFurnitureFamilyPatterns(lineas, config, {
    maxFamilies: context.maxFamilies ?? 12,
    minTypes: 2,
    minPieces: 2,
    passes: 1,
  });

  // `generarPatrones(..., 4)` conserva la ronda 0 sobre todos los tipos y agrega
  // sólo unas pocas exploraciones aleatorias. El Master legacy completo queda
  // intacto como fallback si este pool rápido no certifica la cota.
  const random = annotateRandomPatterns(generarPatrones(lineas, config, randomRounds));
  const pool = dedupePatterns([...family.patterns, ...random]);

  let candidate = null;
  let validationOk = false;
  let boards = null;
  let solverNodes = null;
  let solverExhausted = null;

  try {
    const coverage = resolverCobertura(pool, demand, areaPlaca, incumbentBoards, maxSolveMs);
    const solved = coverage ? coverage.resolver(areas) : null;
    solverNodes = solved?.nodos ?? coverage?.nodos ?? null;
    solverExhausted = solved?.agotado ?? coverage?.agotado ?? null;
    candidate = solved?.plan ? materializar(solved.plan, lineas, baselineOpts) : null;
    if (candidate?.resumen) {
      const validation = validarPlanIndustrial(candidate, expectedPieces);
      validationOk = !!validation?.ok;
      boards = +candidate.resumen.placas;
    }
  } catch (_) {
    candidate = null;
    validationOk = false;
  }

  const certified =
    validationOk &&
    Number.isFinite(boards) &&
    Number.isFinite(cota) &&
    boards <= cota;

  return {
    candidate: certified ? candidate : null,
    certified,
    metrics: {
      ms: Date.now() - started,
      familySeeds: family.metrics.seeds,
      familyPatterns: family.metrics.patterns,
      familyWarnings: family.metrics.warnings,
      familyMs: family.metrics.ms,
      randomRounds,
      randomPatterns: random.length,
      poolSize: pool.length,
      maxSolveMs,
      solverNodes,
      solverExhausted,
      validationOk,
      boards,
      cota,
    },
  };
}

module.exports = {
  runV21FamilyMaster,
  dedupePatterns,
  annotateRandomPatterns,
};

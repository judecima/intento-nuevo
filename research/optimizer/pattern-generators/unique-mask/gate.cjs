"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const { optimizarLegacyHybrid } = require("../../../../src/lib/optimizer/legacy/rust/rust-hybrid.cjs");
const {
  legacyRoundSubsets,
  generarPatronesLegacyRustHybrid,
} = require("../../../../src/lib/optimizer/legacy/rust/rust-patrones.cjs");
const { patronesMonotipo, claveVector } = require("../../../../src/lib/optimizer/legacy/patrones.cjs");
const { resolverCobertura } = require("../../../../src/lib/optimizer/legacy/cobertura.cjs");
const { materializar } = require("../../../../src/lib/optimizer/legacy/materializar.cjs");
const { validarPlanIndustrial } = require("../../../../src/lib/optimizer/legacy/validador_industrial_v3.cjs");
const { calidadPlanPlacas, compararCalidad } = require("../../../../src/lib/optimizer/legacy/motor.cjs");

const FIXTURE_DIR = path.join(__dirname, "fixtures");
const IDS = ["4056720", "4056676", "4056900", "4057401"];

function dedupRegister(map, board) {
  const usage = new Map();
  for (const placement of board.colocadas ?? []) {
    const type = placement?.pieza?.ref;
    if (!Number.isSafeInteger(type)) return;
    usage.set(type, (usage.get(type) || 0) + 1);
  }
  if (!usage.size) return;
  const area = (board.colocadas ?? []).reduce(
    (sum, placement) => sum + placement.base * placement.altura,
    0,
  );
  const key = claveVector(usage);
  const previous = map.get(key);
  if (!previous || area > previous.area) {
    map.set(key, { uso: usage, area, placa: board });
  }
}

function uniqueMaskSchedule(lineCount, rounds = 40, seed = 7) {
  const schedule = legacyRoundSubsets(lineCount, rounds, seed);
  const seen = new Set();
  const selected = [];
  for (let round = 0; round < schedule.length; round++) {
    const indices = schedule[round];
    if (!indices.length) continue;
    const key = indices.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push({ round, indices });
  }
  return { full: schedule, selected };
}

function generateUniqueMaskPool(lines, config, rounds = 40, seed = 7) {
  const { full, selected } = uniqueMaskSchedule(lines.length, rounds, seed);
  const indexed = lines.map((line, index) => ({
    ...line,
    ref: index,
    _refOriginal: line.ref,
  }));
  const byVector = new Map();

  for (const { round, indices } of selected) {
    try {
      const result = optimizarLegacyHybrid(
        indices.map((index) => ({ ...indexed[index] })),
        { ...config, semilla: 1000 + round, pases: 2 },
      );
      for (const board of result.placas ?? []) dedupRegister(byVector, board);
    } catch (error) {
      if (process.env.RUST_LEGACY_DEBUG_ERRORS === "1") throw error;
    }
  }

  return {
    pool: [...byVector.values()],
    roundsRequested: full.length,
    roundsExecuted: selected.length,
    selectedRounds: selected.map((entry) => entry.round),
    uniqueMasks: selected.length,
  };
}

function solve(pool, fixture, monotypes) {
  const { lines, config, preMasterBoards } = fixture;
  const areaPlate =
    (config.placaBase - (config.refiladoX || 0)) *
    (config.placaAltura - (config.refiladoY || 0));
  const solver = resolverCobertura(
    pool.concat(monotypes),
    lines.map((line) => line.cant),
    areaPlate,
    preMasterBoards,
    8000,
  );
  return solver
    ? solver.resolver(lines.map((line) => line.base * line.altura))
    : null;
}

function quality(plan) {
  return plan
    ? calidadPlanPlacas(plan.placas ?? [], plan.opts ?? {})
    : null;
}

const rows = [];

for (const id of IDS) {
  const fixture = JSON.parse(
    fs.readFileSync(path.join(FIXTURE_DIR, id + ".json"), "utf8"),
  );
  const expectedPieces = fixture.lines.reduce((sum, line) => sum + line.cant, 0);

  const monoStart = performance.now();
  const monotypes = patronesMonotipo(fixture.lines, fixture.config);
  const monotypeMs = performance.now() - monoStart;

  // Alternate order by fixture to reduce systematic warm-cache bias.
  const uniqueFirst = rows.length % 2 === 0;

  let fullPool, unique;
  let fullGenerationMs, uniqueGenerationMs;

  const runFull = () => {
    const start = performance.now();
    const pool = generarPatronesLegacyRustHybrid(
      fixture.lines,
      fixture.config,
      40,
      7,
    );
    return { pool, ms: performance.now() - start };
  };
  const runUnique = () => {
    const start = performance.now();
    const result = generateUniqueMaskPool(fixture.lines, fixture.config, 40, 7);
    return { result, ms: performance.now() - start };
  };

  if (uniqueFirst) {
    const u = runUnique();
    unique = u.result;
    uniqueGenerationMs = u.ms;
    const f = runFull();
    fullPool = f.pool;
    fullGenerationMs = f.ms;
  } else {
    const f = runFull();
    fullPool = f.pool;
    fullGenerationMs = f.ms;
    const u = runUnique();
    unique = u.result;
    uniqueGenerationMs = u.ms;
  }

  const fullSolveStart = performance.now();
  const fullSolution = solve(fullPool, fixture, monotypes);
  const fullSolveMs = performance.now() - fullSolveStart;
  const uniqueSolveStart = performance.now();
  const uniqueSolution = solve(unique.pool, fixture, monotypes);
  const uniqueSolveMs = performance.now() - uniqueSolveStart;

  const fullBoards = fullSolution?.placas ?? fixture.preMasterBoards;
  const uniqueBoards = uniqueSolution?.placas ?? fixture.preMasterBoards;

  if (fullBoards !== fixture.expectedBoards) {
    throw new Error(
      `${id}: full Rust expected ${fixture.expectedBoards}, got ${fullBoards}`,
    );
  }
  if (uniqueBoards !== fullBoards) {
    throw new Error(
      `${id}: unique-mask board regression full=${fullBoards}, unique=${uniqueBoards}`,
    );
  }

  let fullPlan = null;
  let uniquePlan = null;
  let remnantCmp = 0;

  if (fullSolution?.plan) {
    fullPlan = materializar(fullSolution.plan, fixture.lines, fixture.config);
    if (!fullPlan || !validarPlanIndustrial(fullPlan, expectedPieces).ok) {
      throw new Error(`${id}: full Rust materialization invalid`);
    }
  }
  if (uniqueSolution?.plan) {
    uniquePlan = materializar(uniqueSolution.plan, fixture.lines, fixture.config);
    if (!uniquePlan || !validarPlanIndustrial(uniquePlan, expectedPieces).ok) {
      throw new Error(`${id}: unique-mask materialization invalid`);
    }
  }

  if (fullPlan && uniquePlan) {
    remnantCmp = compararCalidad(quality(uniquePlan), quality(fullPlan));
    if (remnantCmp < 0) {
      throw new Error(`${id}: unique-mask remnant regression`);
    }
  }

  const row = {
    id,
    pieces: expectedPieces,
    types: fixture.lines.length,
    expectedBoards: fixture.expectedBoards,
    fullBoards,
    uniqueBoards,
    fullPool: fullPool.length,
    uniquePool: unique.pool.length,
    roundsRequested: unique.roundsRequested,
    roundsExecuted: unique.roundsExecuted,
    selectedRounds: unique.selectedRounds,
    monotypeMs,
    fullGenerationMs,
    uniqueGenerationMs,
    generationSpeedup: fullGenerationMs / uniqueGenerationMs,
    generationReductionPct: (1 - uniqueGenerationMs / fullGenerationMs) * 100,
    fullSolveMs,
    uniqueSolveMs,
    fullNodes: fullSolution?.nodos ?? null,
    uniqueNodes: uniqueSolution?.nodos ?? null,
    fullExhausted: Boolean(fullSolution?.agotado),
    uniqueExhausted: Boolean(uniqueSolution?.agotado),
    remnantCmp,
  };
  rows.push(row);
  console.log("UNIQUE_MASK_ROW " + JSON.stringify(row));
}

const summary = {
  operation: "unique-mask-rounds-gate",
  cases: rows.length,
  boardParity: rows.every((row) => row.fullBoards === row.uniqueBoards),
  noRemnantRegression: rows.every((row) => row.remnantCmp >= 0),
  rows,
};
console.log("UNIQUE_MASK_SUMMARY " + JSON.stringify(summary, null, 2));

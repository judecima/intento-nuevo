"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const {
  legacyRoundSubsets,
  generarPatronesLegacyRustHybrid,
} = require("../../../src/lib/optimizer/legacy/rust/rust-patrones.cjs");
const { patronesMonotipo } = require("../../../src/lib/optimizer/legacy/patrones.cjs");
const { resolverCobertura } = require("../../../src/lib/optimizer/legacy/cobertura.cjs");
const { materializar } = require("../../../src/lib/optimizer/legacy/materializar.cjs");
const { validarPlanIndustrial } = require("../../../src/lib/optimizer/legacy/v10.cjs");

const cohort = JSON.parse(
  fs.readFileSync(path.join(__dirname, "PERFORMANCE_V1_COHORT_11_2026-09-19.json"), "utf8"),
);

const REUSE_FLAG = "OPTIMIZER_RUST_MASTER_ROUND_REUSE_EXPERIMENTAL";
const MIN_SAVINGS_PCT = 40;
const MAX_BEAM_EXPANSIONS = 500;
const MAX_MASTER_NODES = 300000;

function linesFor(c) {
  return c.pieces.map((p, index) => ({
    base: +p.base,
    altura: +p.altura,
    cant: +p.cant,
    veta: Boolean(c.directional) && String(p.xmlPartGrain ?? "0") === "1",
    ref: index,
    detalle: "",
  }));
}

function configFor(c, deep) {
  return {
    placaBase: +c.stock_width,
    placaAltura: +c.stock_height,
    refiladoX: 0,
    refiladoY: 0,
    sierra: +c.saw || 4.5,
    etapas: 4,
    materialConVeta: Boolean(c.directional),
    descontarCanto: false,
    cantoEspesor: 0,
    restoMin: 250,
    restoMax: 400,
    tolerancia: 0.02,
    beamWidth: 5,
    maxPiezasBeam: 120,
    presupuestoBeamMs: deep ? 2500 : 1500,
    maxExpansionesBeam: MAX_BEAM_EXPANSIONS,
    maxPiezasCache: 120,
    preferirMenorProfundidad: true,
    usarRescue: true,
    maxPiezasRescue: 30,
    presupuestoRescueMs: 300,
    multiRebanada: false,
    multiVariantes: false,
    rondasPatrones: deep ? 60 : 40,
    msMaster: deep ? 8000 : 800,
  };
}

function boardDigest(board) {
  return {
    placements: (board?.colocadas ?? []).map((p) => [
      p?.pieza?.ref,
      p.base,
      p.altura,
      p.x,
      p.y,
      Boolean(p.rotada),
      p.nivel ?? 0,
    ]),
    cuts: (board?.cortes ?? []).map((cut) => [
      cut.x1,
      cut.y1,
      cut.x2,
      cut.y2,
      cut.nivel ?? 0,
      Boolean(cut.terminal),
    ]),
    remnants: (board?.restos ?? []).map((r) => [r.x, r.y, r.w, r.h]),
  };
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function patternPoolDigest(pool) {
  return digest(pool.map((pattern) => ({
    usage: [...pattern.uso.entries()].sort((a, b) => a[0] - b[0]),
    area: pattern.area,
    board: boardDigest(pattern.placa),
  })));
}

function materializedPlanDigest(plan) {
  if (!plan) return null;
  return digest((plan.placas ?? []).map(boardDigest));
}

function runGenerator(lines, config, rounds) {
  const start = process.hrtime.bigint();
  const pool = generarPatronesLegacyRustHybrid(lines, config, rounds, 7);
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  return { pool, ms };
}

function solveMaster(pool, monotype, lines, options, incumbent) {
  const areaPlaca = (options.placaBase - options.refiladoX) *
    (options.placaAltura - options.refiladoY);
  const patterns = pool.concat(monotype);
  const solver = resolverCobertura(
    patterns,
    lines.map((line) => line.cant),
    areaPlaca,
    incumbent,
    60000,
    { maxNodos: MAX_MASTER_NODES },
  );
  const solution = solver
    ? solver.resolver(lines.map((line) => line.base * line.altura))
    : null;
  const opts = {
    ...options,
    anchoUtil: options.placaBase - options.refiladoX,
    altoUtil: options.placaAltura - options.refiladoY,
  };
  const plan = solution?.plan ? materializar(solution.plan, lines, opts) : null;
  return { solution, plan };
}

const rows = [];
let totalColdMs = 0;
let totalWarmMs = 0;

for (const c of cohort) {
  const lines = linesFor(c);
  const schedule40 = legacyRoundSubsets(lines.length, 40, 7);
  const schedule60 = legacyRoundSubsets(lines.length, 60, 7);
  const prefixMatches = JSON.stringify(schedule40) === JSON.stringify(schedule60.slice(0, 40));
  if (!prefixMatches) throw new Error(`${c.case_id}: 40-round schedule is not the Deep60 prefix`);
  const executablePrefixRounds = schedule40.filter((indices) => indices.length > 0).length;
  const executableTailRounds = schedule60.slice(40).filter((indices) => indices.length > 0).length;

  process.env[REUSE_FLAG] = "0";
  const coldOptions = configFor(c, true);
  const cold = runGenerator(lines, coldOptions, 60);
  const coldDigest = patternPoolDigest(cold.pool);

  process.env[REUSE_FLAG] = "1";
  const balancedOptions = configFor(c, false);
  const balanced = runGenerator(lines, balancedOptions, 40);
  const balancedTelemetry = balancedOptions._rustMasterRoundReuse;
  if (
    !balancedTelemetry?.enabled ||
    balancedTelemetry.reusedRounds !== 0 ||
    balancedTelemetry.generatedRounds !== executablePrefixRounds
  ) {
    throw new Error(
      `${c.case_id}: Balanced40 did not populate every executable prefix round ` +
      `(${balancedTelemetry?.generatedRounds} != ${executablePrefixRounds})`,
    );
  }

  const warmOptions = configFor(c, true);
  const warm = runGenerator(lines, warmOptions, 60);
  const warmTelemetry = warmOptions._rustMasterRoundReuse;
  if (
    !warmTelemetry?.enabled ||
    warmTelemetry.reusedRounds !== executablePrefixRounds ||
    warmTelemetry.generatedRounds !== executableTailRounds
  ) {
    throw new Error(
      `${c.case_id}: Deep60 did not reuse the full executable prefix and generate only the tail ` +
      `(reuse ${warmTelemetry?.reusedRounds}/${executablePrefixRounds}, ` +
      `generated ${warmTelemetry?.generatedRounds}/${executableTailRounds})`,
    );
  }

  const warmDigest = patternPoolDigest(warm.pool);
  if (warmDigest !== coldDigest) {
    throw new Error(`${c.case_id}: warm Deep60 pattern pool differs from cold Deep60`);
  }

  // The final Master decision must also be physically identical, not only the
  // deduplicated vector pool. Monotype patterns are shared between both solves.
  const monotype = patronesMonotipo(lines, configFor(c, true));
  const incumbent = Math.max(2, Number(c.reference_panels) || 1) + 3;
  const coldMaster = solveMaster(cold.pool, monotype, lines, coldOptions, incumbent);
  const warmMaster = solveMaster(warm.pool, monotype, lines, warmOptions, incumbent);

  if (coldMaster.solution?.placas !== warmMaster.solution?.placas) {
    throw new Error(`${c.case_id}: Master board count differs cold vs warm`);
  }

  const coldPlanDigest = materializedPlanDigest(coldMaster.plan);
  const warmPlanDigest = materializedPlanDigest(warmMaster.plan);
  if (coldPlanDigest !== warmPlanDigest) {
    throw new Error(`${c.case_id}: materialized Master plan differs cold vs warm`);
  }

  const expectedPieces = lines.reduce((sum, line) => sum + line.cant, 0);
  if (coldMaster.plan && !validarPlanIndustrial(coldMaster.plan, expectedPieces).ok) {
    throw new Error(`${c.case_id}: cold materialized Master plan is invalid`);
  }
  if (warmMaster.plan && !validarPlanIndustrial(warmMaster.plan, expectedPieces).ok) {
    throw new Error(`${c.case_id}: warm materialized Master plan is invalid`);
  }

  const savingsPct = cold.ms > 0 ? 100 * (cold.ms - warm.ms) / cold.ms : 0;
  totalColdMs += cold.ms;
  totalWarmMs += warm.ms;
  rows.push({
    id: c.case_id,
    types: lines.length,
    pieces: expectedPieces,
    coldMs: +cold.ms.toFixed(2),
    warmMs: +warm.ms.toFixed(2),
    savingsPct: +savingsPct.toFixed(2),
    patterns: cold.pool.length,
    masterBoards: coldMaster.solution?.placas ?? null,
    poolDigestEqual: true,
    planDigestEqual: true,
    reusedRounds: warmTelemetry.reusedRounds,
    generatedRounds: warmTelemetry.generatedRounds,
    executablePrefixRounds,
    executableTailRounds,
  });
}

// Safety gate: a watchdog makes the round contract time-sensitive, so reuse
// must fail closed and run all 60 rounds.
{
  const c = cohort[0];
  const lines = linesFor(c);
  process.env[REUSE_FLAG] = "1";
  const options = { ...configFor(c, true), watchdogBeamMs: 5000 };
  const executableRounds = legacyRoundSubsets(lines.length, 60, 7)
    .filter((indices) => indices.length > 0).length;
  runGenerator(lines, options, 60);
  const telemetry = options._rustMasterRoundReuse;
  if (
    telemetry?.enabled ||
    telemetry?.reusedRounds !== 0 ||
    telemetry?.generatedRounds !== executableRounds
  ) {
    throw new Error("watchdog safety gate failed: reuse must be disabled");
  }
}

const aggregateSavingsPct = totalColdMs > 0
  ? 100 * (totalColdMs - totalWarmMs) / totalColdMs
  : 0;

const result = {
  schema: "optimizer-performance-v1-gate-v1",
  cases: rows.length,
  poolParity: rows.filter((row) => row.poolDigestEqual).length,
  planParity: rows.filter((row) => row.planDigestEqual).length,
  exactPrefixReuse: rows.filter(
    (row) =>
      row.reusedRounds === row.executablePrefixRounds &&
      row.generatedRounds === row.executableTailRounds,
  ).length,
  totalColdMs: +totalColdMs.toFixed(2),
  totalWarmMs: +totalWarmMs.toFixed(2),
  aggregateSavingsPct: +aggregateSavingsPct.toFixed(2),
  minimumRequiredSavingsPct: MIN_SAVINGS_PCT,
  rows,
};

fs.writeFileSync(
  path.join(__dirname, "performance-v1-gate-results.json"),
  JSON.stringify(result, null, 2) + "\n",
);
console.log("PERFORMANCE_V1_GATE " + JSON.stringify(result));

if (rows.length !== cohort.length) throw new Error("Performance V1 cohort was not fully executed");
if (aggregateSavingsPct < MIN_SAVINGS_PCT) {
  throw new Error(
    `Performance V1 speed gate failed: ${aggregateSavingsPct.toFixed(2)}% < ${MIN_SAVINGS_PCT}%`,
  );
}

"use strict";

const { optimizarLegacyHybrid } = require("../../../../src/lib/optimizer/legacy/rust/rust-hybrid.cjs");
const { legacyRoundSubsets } = require("../../../../src/lib/optimizer/legacy/rust/rust-patrones.cjs");
const { generarPatrones, patronesMonotipo } = require("../../../../src/lib/optimizer/legacy/patrones.cjs");
const { resolverCobertura } = require("../../../../src/lib/optimizer/legacy/cobertura.cjs");
const { materializar } = require("../../../../src/lib/optimizer/legacy/materializar.cjs");
const { validarPlanIndustrial } = require("../../../../src/lib/optimizer/legacy/validador_industrial_v3.cjs");

function patternKey(pattern) {
  return [...pattern.uso.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([type, count]) => type + ":" + count)
    .join(",");
}

function qualityTuple(plan) {
  const opts = plan?.opts ?? {};
  const min = Number(opts.restoMin) || 0;
  const max = Number(opts.restoMax) || 0;
  const areas = [];
  let total = 0;
  for (const board of plan?.placas ?? []) {
    for (const rest of board.restos ?? []) {
      if (Math.min(rest.w, rest.h) < min || Math.max(rest.w, rest.h) < max) continue;
      const area = rest.w * rest.h;
      areas.push(area);
      total += area;
    }
  }
  areas.sort((a, b) => b - a);
  return [areas[0] || 0, areas[1] || 0, -areas.length, total];
}

function compareTuple(a, b, eps = 1e-6) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] > b[i] + eps) return 1;
    if (b[i] > a[i] + eps) return -1;
  }
  return 0;
}

function createRustRoundStream(lineas, options, rounds = 40, seed = 7) {
  const schedule = legacyRoundSubsets(lineas.length, rounds, seed);
  const indexed = lineas.map((line, index) => ({
    ...line,
    ref: index,
    _refOriginal: line.ref,
  }));

  // Exact incremental equivalent of legacyDedupBoards:
  // first vector fixes insertion order; a later board replaces it only when its
  // placed area is strictly larger. Map.set(existingKey, ...) preserves order.
  const byVector = new Map();
  let cursor = 0;

  function registerBoard(board) {
    const usage = new Map();
    let area = 0;
    for (const placement of board.colocadas ?? []) {
      const type = placement?.pieza?.ref;
      if (!Number.isSafeInteger(type) || type < 0 || type >= lineas.length) return false;
      usage.set(type, (usage.get(type) || 0) + 1);
      area += placement.base * placement.altura;
    }
    if (!usage.size) return false;

    const key = patternKey({ uso: usage });
    const previous = byVector.get(key);
    if (!previous) {
      byVector.set(key, { uso: usage, area, placa: board });
      return true;
    }
    if (area > previous.area) {
      byVector.set(key, { uso: usage, area, placa: board });
      return true;
    }
    return false;
  }

  function currentPool() {
    return [...byVector.values()];
  }

  function advance() {
    if (cursor >= schedule.length) {
      return { done: true, round: cursor, pool: currentPool(), changed: false };
    }

    const round = cursor++;
    const indices = schedule[round];
    let generatedBoards = 0;
    let changed = false;

    if (indices.length) {
      try {
        const result = optimizarLegacyHybrid(
          indices.map((index) => ({ ...indexed[index] })),
          { ...options, semilla: 1000 + round, pases: 2 },
        );

        for (const board of result.placas ?? []) {
          generatedBoards++;
          if (registerBoard(board)) changed = true;
        }
      } catch (error) {
        if (process.env.RUST_LEGACY_DEBUG_ERRORS === "1") throw error;
      }
    }

    return {
      done: cursor >= schedule.length,
      round,
      subsetSize: indices.length,
      generatedBoards,
      pool: currentPool(),
      changed,
    };
  }

  return {
    advance,
    currentPool,
    get roundCount() { return schedule.length; },
  };
}

function solvePool({
  generatedPool,
  monotypes,
  lineas,
  config,
  opts,
  incumbentBoards,
  limitMs,
  maxNodes,
  watchdogMs,
}) {
  const patterns = generatedPool.concat(monotypes);
  const areaPlaca =
    (config.placaBase - (config.refiladoX || 0)) *
    (config.placaAltura - (config.refiladoY || 0));
  const demand = lineas.map((line) => line.cant);
  const areas = lineas.map((line) => line.base * line.altura);
  const solver = resolverCobertura(
    patterns,
    demand,
    areaPlaca,
    incumbentBoards,
    limitMs,
    {
      maxNodos: maxNodes,
      watchdogMs,
    },
  );
  const solution = solver ? solver.resolver(areas) : null;
  const candidate =
    solution?.plan
      ? materializar(solution.plan, lineas, opts)
      : null;
  const validation = candidate
    ? validarPlanIndustrial(
        candidate,
        lineas.reduce((sum, line) => sum + line.cant, 0),
      )
    : null;

  return {
    patterns,
    solution,
    candidate,
    valid: Boolean(candidate && validation?.ok),
    validation,
  };
}

function runProgressivePatternMaster(
  lineas,
  config,
  {
    opts,
    incumbentBoards,
    lowerBound,
    rounds = 40,
    seed = 7,
    probeMs = 250,
    probeEvery = 5,
    probeMaxNodes = null,
    probeWatchdogMs = null,
    finalMs = 8000,
    finalMaxNodes = null,
    finalWatchdogMs = null,
  } = {},
) {
  if (!opts) throw new TypeError("Progressive Pattern Master requires materialization opts");
  if (!Number.isFinite(incumbentBoards) || incumbentBoards <= 0) {
    throw new TypeError("Progressive Pattern Master requires incumbentBoards");
  }
  if (!Number.isFinite(lowerBound) || lowerBound <= 0) {
    throw new TypeError("Progressive Pattern Master requires lowerBound");
  }

  const started = process.hrtime.bigint();
  const gap = incumbentBoards - lowerBound;

  // Conservative applicability gate. Progressive is aimed at +1 closure:
  // one certified board reduction reaches the lower bound. Wider gaps require
  // discovering intermediate improvements and can make repeated probes costly,
  // so preserve the current monolithic Master exactly.
  if (gap !== 1) {
    const generationStarted = process.hrtime.bigint();
    const generatedPool = generarPatrones(lineas, config, rounds, seed);
    const monotypes = patronesMonotipo(lineas, config);
    const generationMs = Number(process.hrtime.bigint() - generationStarted) / 1e6;

    const solverStarted = process.hrtime.bigint();
    const full = solvePool({
      generatedPool,
      monotypes,
      lineas,
      config,
      opts,
      incumbentBoards,
      limitMs: finalMs,
      maxNodes: finalMaxNodes,
      watchdogMs: finalWatchdogMs,
    });
    const solverMs = Number(process.hrtime.bigint() - solverStarted) / 1e6;

    return {
      status: "MONOLITHIC_BYPASS",
      round: null,
      candidate: full.candidate,
      validation: full.validation,
      pool: full.patterns,
      generatedPool,
      monotypes,
      history: [],
      telemetry: {
        applicabilityGap: gap,
        roundsGenerated: rounds,
        totalRounds: rounds,
        roundsSkipped: 0,
        probes: 0,
        generationMs,
        solverMs,
        totalMs: Number(process.hrtime.bigint() - started) / 1e6,
      },
    };
  }

  const generationStarted = process.hrtime.bigint();
  const stream = createRustRoundStream(lineas, config, rounds, seed);
  const monotypes = patronesMonotipo(lineas, config);
  let generationMs = Number(process.hrtime.bigint() - generationStarted) / 1e6;
  let solverMs = 0;
  let probes = 0;
  let lastPool = [];
  const history = [];

  for (let index = 0; index < stream.roundCount; index++) {
    const g0 = process.hrtime.bigint();
    const step = stream.advance();
    generationMs += Number(process.hrtime.bigint() - g0) / 1e6;
    lastPool = step.pool;

    const checkpoint =
      step.round === 0 ||
      step.round === stream.roundCount - 1 ||
      ((step.round + 1) % Math.max(1, Math.floor(probeEvery)) === 0);

    if (!step.changed || !checkpoint) {
      history.push({
        round: step.round,
        poolSize: step.pool.length,
        generatedBoards: step.generatedBoards,
        changed: step.changed,
        checkpoint,
        solved: false,
      });
      continue;
    }

    const s0 = process.hrtime.bigint();
    const probe = solvePool({
      generatedPool: step.pool,
      monotypes,
      lineas,
      config,
      opts,
      // Probe only for a certificate at the lower bound. Setting the
      // incumbent to LB+1 makes B&B ignore intermediate improvements that
      // cannot certify an early stop.
      incumbentBoards: lowerBound + 1,
      limitMs: probeMs,
      maxNodes: probeMaxNodes,
      watchdogMs: probeWatchdogMs,
    });
    solverMs += Number(process.hrtime.bigint() - s0) / 1e6;
    probes++;

    const boards = probe.candidate?.resumen?.placas ?? null;
    const certified =
      probe.valid &&
      boards === lowerBound &&
      probe.solution?.placas === lowerBound;

    history.push({
      round: step.round,
      poolSize: step.pool.length,
      generatedBoards: step.generatedBoards,
      changed: true,
      checkpoint: true,
      solved: true,
      solverBoards: probe.solution?.placas ?? null,
      materializedBoards: boards,
      valid: probe.valid,
      nodes: probe.solution?.nodos ?? null,
      exhausted: Boolean(probe.solution?.agotado),
      certified,
    });

    if (certified) {
      return {
        status: "CERTIFIED_EARLY",
        round: step.round,
        candidate: probe.candidate,
        validation: probe.validation,
        pool: probe.patterns,
        generatedPool: step.pool,
        monotypes,
        history,
        telemetry: {
          applicabilityGap: gap,
          roundsGenerated: step.round + 1,
          totalRounds: stream.roundCount,
          roundsSkipped: stream.roundCount - step.round - 1,
          probes,
          probeEvery: Math.max(1, Math.floor(probeEvery)),
          generationMs,
          solverMs,
          totalMs: Number(process.hrtime.bigint() - started) / 1e6,
        },
      };
    }
  }

  // Safe fallback: once all rounds were consumed, solve the complete pool with
  // the normal final Master budget. Progressive probes do not constrain this.
  const finalStart = process.hrtime.bigint();
  const final = solvePool({
    generatedPool: lastPool,
    monotypes,
    lineas,
    config,
    opts,
    incumbentBoards,
    limitMs: finalMs,
    maxNodes: finalMaxNodes,
    watchdogMs: finalWatchdogMs,
  });
  solverMs += Number(process.hrtime.bigint() - finalStart) / 1e6;

  return {
    status: "FULL_FALLBACK",
    round: stream.roundCount - 1,
    candidate: final.candidate,
    validation: final.validation,
    pool: final.patterns,
    generatedPool: lastPool,
    monotypes,
    history,
    telemetry: {
      applicabilityGap: gap,
      roundsGenerated: stream.roundCount,
      totalRounds: stream.roundCount,
      roundsSkipped: 0,
      probes,
      probeEvery: Math.max(1, Math.floor(probeEvery)),
      generationMs,
      solverMs,
      totalMs: Number(process.hrtime.bigint() - started) / 1e6,
    },
  };
}

module.exports = {
  compareTuple,
  createRustRoundStream,
  patternKey,
  qualityTuple,
  runProgressivePatternMaster,
  solvePool,
};

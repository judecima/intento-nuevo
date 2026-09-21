"use strict";

const path = require("node:path");

const { optimizarLegacyHybrid } = require("../../../src/lib/optimizer/legacy/rust/rust-hybrid.cjs");
const { legacyRoundSubsets } = require("../../../src/lib/optimizer/legacy/rust/rust-patrones.cjs");

const addonPath = path.join(
  __dirname,
  "../../../native/optimizer-pattern-generator/optimizer_pattern_generator.node",
);

const P18_CONTRIBUTION_ROUNDS = Object.freeze([
  0, 2, 3, 5, 6, 10, 12, 13, 16,
  17, 18, 19, 21, 22, 25, 33, 34, 36,
]);

let addon;
function native() {
  addon ??= require(addonPath);
  if (typeof addon.legacyDedupBoards !== "function") {
    throw new Error("native addon does not expose legacyDedupBoards");
  }
  return addon;
}

function normalizeRounds(rounds, totalRounds) {
  const out = [];
  const seen = new Set();
  for (const raw of rounds ?? []) {
    const round = Number(raw);
    if (!Number.isInteger(round) || round < 0 || round >= totalRounds || seen.has(round)) continue;
    seen.add(round);
    out.push(round);
  }
  return out;
}

function toPatternCandidates(board, payloadIndex, round, boardOrdinal) {
  return {
    round,
    boardOrdinal,
    payloadIndex,
    placements: (board.colocadas ?? []).map((placement) => ({
      typeIndex: typeof placement?.pieza?.ref === "number" ? placement.pieza.ref : null,
      base: placement.base,
      altura: placement.altura,
    })),
  };
}

function patternFromSelected(entry, boards) {
  return {
    uso: new Map(
      entry.usageVector
        .map((count, index) => [index, count])
        .filter(([, count]) => count > 0),
    ),
    area: entry.area,
    placa: boards[entry.payloadIndex],
  };
}

/**
 * Research-only incremental wrapper around the certified Rust legacy generator.
 *
 * Rounds may be executed in any priority order (for example P18 first).  When
 * materializing a pattern pool, candidates are always restored to the original
 * legacy order: round ascending, then board ordinal inside the round.  Therefore
 * executing all rounds must reproduce the exact full-40 dedup contract.
 */
function createIncrementalRustMasterGenerator(lineas, O, rondas = 40, semilla = 7) {
  if (!Array.isArray(lineas) || lineas.length === 0) {
    throw new TypeError("incremental Master requires nonempty lines");
  }

  const schedule = legacyRoundSubsets(lineas.length, rondas, semilla);
  const conRef = lineas.map((linea, index) => ({
    ...linea,
    ref: index,
    _refOriginal: linea.ref,
  }));

  const boards = [];
  const candidates = [];
  const executed = new Set();
  const perRound = new Map();
  const perRoundCpuMs = new Map();
  let generationCpuMs = 0;

  function execute(rounds) {
    const selected = normalizeRounds(rounds, schedule.length);
    const newlyExecuted = [];

    for (const round of selected) {
      if (executed.has(round)) continue;
      executed.add(round);
      newlyExecuted.push(round);

      const indices = schedule[round];
      const roundCandidateIndexes = [];
      perRound.set(round, roundCandidateIndexes);
      if (!indices?.length) continue;

      const started = process.cpuUsage();
      try {
        const result = optimizarLegacyHybrid(
          indices.map((index) => ({ ...conRef[index] })),
          { ...O, semilla: 1000 + round, pases: 2 },
        );
        const cpu = process.cpuUsage(started);
        const roundCpuMs = (cpu.user + cpu.system) / 1000;
        generationCpuMs += roundCpuMs;
        perRoundCpuMs.set(round, (perRoundCpuMs.get(round) || 0) + roundCpuMs);

        let boardOrdinal = 0;
        for (const board of result.placas ?? []) {
          const payloadIndex = boards.length;
          Object.defineProperty(board, "_researchRound", { value: round, enumerable: false, configurable: true });
          Object.defineProperty(board, "_researchBoardOrdinal", { value: boardOrdinal, enumerable: false, configurable: true });
          boards.push(board);
          const candidateIndex = candidates.length;
          candidates.push(toPatternCandidates(board, payloadIndex, round, boardOrdinal++));
          roundCandidateIndexes.push(candidateIndex);
        }
      } catch (error) {
        const cpu = process.cpuUsage(started);
        const roundCpuMs = (cpu.user + cpu.system) / 1000;
        generationCpuMs += roundCpuMs;
        perRoundCpuMs.set(round, (perRoundCpuMs.get(round) || 0) + roundCpuMs);
        if (process.env.RUST_LEGACY_DEBUG_ERRORS === "1") throw error;
      }
    }

    return {
      newlyExecuted,
      executedRounds: executedRounds(),
      missingRounds: missingRounds(),
      generationCpuMs,
    };
  }

  function orderedCandidates(roundFilter = null) {
    const allowed = roundFilter == null
      ? executed
      : new Set(normalizeRounds(roundFilter, schedule.length));

    return candidates
      .filter((candidate) => allowed.has(candidate.round))
      .slice()
      .sort((a, b) => a.round - b.round || a.boardOrdinal - b.boardOrdinal);
  }

  function patterns(roundFilter = null) {
    const ordered = orderedCandidates(roundFilter);
    if (!ordered.length) return [];

    const nativeCandidates = ordered.map((candidate) => ({
      payloadIndex: candidate.payloadIndex,
      placements: candidate.placements,
    }));
    const selected = JSON.parse(
      native().legacyDedupBoards(JSON.stringify(nativeCandidates), lineas.length),
    );
    return selected.map((entry) => patternFromSelected(entry, boards));
  }

  function executedRounds() {
    return [...executed].sort((a, b) => a - b);
  }

  function missingRounds() {
    const out = [];
    for (let round = 0; round < schedule.length; round++) {
      if (!executed.has(round)) out.push(round);
    }
    return out;
  }

  function roundStats() {
    const out = [];
    const deduped = patterns();
    const dedupByRound = new Map();
    for (const p of deduped) {
      const round = p?.placa?._researchRound;
      if (Number.isInteger(round)) dedupByRound.set(round, (dedupByRound.get(round) || 0) + 1);
    }
    for (const round of executedRounds()) {
      out.push({
        round,
        maskSize: schedule[round]?.length ?? 0,
        rawBoards: perRound.get(round)?.length ?? 0,
        dedupPatterns: dedupByRound.get(round) || 0,
        cpuMs: perRoundCpuMs.get(round) || 0,
      });
    }
    return out;
  }

  return {
    execute,
    patterns,
    roundStats,
    executedRounds,
    missingRounds,
    schedule,
    get generationCpuMs() {
      return generationCpuMs;
    },
    get candidateCount() {
      return candidates.length;
    },
  };
}

module.exports = {
  P18_CONTRIBUTION_ROUNDS,
  createIncrementalRustMasterGenerator,
  normalizeRounds,
};

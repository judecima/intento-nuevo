import { generateSubsetPatterns, solvePatternPool } from "./rescue-generator.mjs";

export const DIRECTED_ESCALATION_POLICY = Object.freeze({
  maskUniverse: 40,
  escalationCount: 10,
  probePasses: 1,
  probeRestartsPerBoard: 1,
  probeSeedOffsets: [10000, 40000],
  variabilityWeight: 0.5,
  incumbentBoards: 12,
});

function zScores(values) {
  if (!values.length) return [];
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);
  if (stdDev <= 1e-12) return values.map(() => 0);
  return values.map((value) => (value - mean) / stdDev);
}

function averageUtilization(patterns, usableArea) {
  if (!patterns?.length || !(usableArea > 0)) return 0;
  return patterns.reduce((sum, pattern) => sum + Number(pattern.area ?? 0), 0) / patterns.length / usableArea;
}

/**
 * Cheap, pre-Rescue ranking of Legacy masks.
 *
 * Signal 1: average utilization of the first cheap probe. High utilization
 * indicates that the mask can steer the greedy constructor toward dense columns.
 * Signal 2: board-count instability under a deliberately distant deterministic
 * seed. Instability indicates a trajectory-sensitive context that may benefit
 * from deeper restarts/Rescue.
 *
 * Round 0 is intentionally excluded: it is the full-order baseline, not a
 * subset escalation candidate.
 */
export function rankDirectedMasks(lines, config, {
  maskUniverse = DIRECTED_ESCALATION_POLICY.maskUniverse,
  escalationCount = DIRECTED_ESCALATION_POLICY.escalationCount,
  seedOffsets = DIRECTED_ESCALATION_POLICY.probeSeedOffsets,
  variabilityWeight = DIRECTED_ESCALATION_POLICY.variabilityWeight,
} = {}) {
  const [seedOffsetA, seedOffsetB] = seedOffsets;
  if (!Number.isFinite(seedOffsetA) || !Number.isFinite(seedOffsetB)) {
    throw new TypeError("seedOffsets must contain two finite numbers");
  }

  const probeOptions = {
    maskCount: maskUniverse,
    passes: DIRECTED_ESCALATION_POLICY.probePasses,
    restartsPerBoard: DIRECTED_ESCALATION_POLICY.probeRestartsPerBoard,
    rescue: false,
    beam: false,
  };

  const first = generateSubsetPatterns(lines, config, { ...probeOptions, seedOffset: seedOffsetA });
  const second = generateSubsetPatterns(lines, config, { ...probeOptions, seedOffset: seedOffsetB });
  const usableArea = (Number(config.placaBase) - Number(config.refiladoX ?? 0))
    * (Number(config.placaAltura) - Number(config.refiladoY ?? 0));

  const rows = [];
  for (let round = 1; round < Math.min(maskUniverse, first.masks.length); round++) {
    const patternsA = first.byRound.get(round) ?? [];
    const patternsB = second.byRound.get(round) ?? [];
    rows.push({
      round,
      probeBoardsA: patternsA.length,
      probeBoardsB: patternsB.length,
      averageUtilization: averageUtilization(patternsA, usableArea),
      variable: patternsA.length === patternsB.length ? 0 : 1,
    });
  }

  const utilizationZ = zScores(rows.map((row) => row.averageUtilization));
  const variabilityZ = zScores(rows.map((row) => row.variable));
  rows.forEach((row, index) => {
    row.score = utilizationZ[index] + variabilityWeight * variabilityZ[index];
  });

  rows.sort((a, b) => b.score - a.score || a.round - b.round);
  const selectedRounds = rows.slice(0, Math.max(0, Math.min(escalationCount, rows.length))).map((row) => row.round);
  return {
    selectedRounds,
    ranking: rows,
    probes: {
      firstGenerationCpuMs: first.generationCpuMs,
      secondGenerationCpuMs: second.generationCpuMs,
      seedOffsets: [seedOffsetA, seedOffsetB],
    },
  };
}

export function runDirectedEscalation(lines, config, options = {}) {
  const started = process.cpuUsage();
  const ranked = rankDirectedMasks(lines, config, options);
  const rescue = generateSubsetPatterns(lines, config, { maskRounds: ranked.selectedRounds });
  const solved = solvePatternPool(lines, config, rescue.patterns, {
    incumbentBoards: options.incumbentBoards ?? DIRECTED_ESCALATION_POLICY.incumbentBoards,
    masterLimitMs: options.masterLimitMs ?? 20000,
  });
  const cpu = process.cpuUsage(started);
  return {
    ...ranked,
    rescueGenerationCpuMs: rescue.generationCpuMs,
    rescuePatternCount: rescue.patterns.length,
    solved,
    totalCpuMs: (cpu.user + cpu.system) / 1000,
  };
}

import { generateSubsetPatterns, solvePatternPool } from "./rescue-generator.mjs";

/**
 * Fixed Rescue14 portfolio discovered against current canonical XML ordering.
 *
 * This deliberately avoids per-case mask ranking/probing. The ten contexts are
 * a bounded deterministic portfolio that preserved or improved Rescue28 quality
 * across the reconstructed current-parser MID_DENSITY gate.
 */
export const PORTFOLIO10_ROUNDS = Object.freeze([0, 8, 12, 16, 17, 19, 26, 33, 35, 37]);

export function runPortfolioEscalation(lines, config, {
  incumbentBoards = Number.POSITIVE_INFINITY,
  masterLimitMs = 20000,
} = {}) {
  const started = process.cpuUsage();
  const generated = generateSubsetPatterns(lines, config, {
    maskRounds: PORTFOLIO10_ROUNDS,
  });
  const solved = solvePatternPool(lines, config, generated.patterns, {
    incumbentBoards,
    masterLimitMs,
  });
  const cpu = process.cpuUsage(started);

  return {
    rounds: [...PORTFOLIO10_ROUNDS],
    generatedPatterns: generated.patterns.length,
    generationCpuMs: generated.generationCpuMs,
    solved,
    totalCpuMs: (cpu.user + cpu.system) / 1000,
  };
}

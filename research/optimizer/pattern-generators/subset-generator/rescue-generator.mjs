import { createRequire } from "node:module";
import { buildLegacyMasks, rankMasksByDiversity } from "./masks.mjs";

const require = createRequire(import.meta.url);
const { optimizar } = require("../../../../src/lib/optimizer/legacy/motor.cjs");
const { patronesMonotipo, claveVector } = require("../../../../src/lib/optimizer/legacy/patrones.cjs");
const { resolverCobertura } = require("../../../../src/lib/optimizer/legacy/cobertura.cjs");

export const SUBSET_RESCUE_POLICY = Object.freeze({
  rounds: 40,
  maskSeed: 7,
  passes: 2,
  restartsPerBoard: 14,
  rescue: true,
  beam: false,
  multiVariants: false,
});

function registerPlanPatterns(result, round) {
  const patterns = [];
  for (const board of result?.placas ?? []) {
    const usage = new Map();
    for (const placement of board.colocadas ?? []) {
      const type = placement?.pieza?.ref;
      if (typeof type !== "number") continue;
      usage.set(type, (usage.get(type) ?? 0) + 1);
    }
    if (!usage.size) continue;
    patterns.push({
      uso: usage,
      area: (board.colocadas ?? []).reduce((sum, placement) => sum + placement.base * placement.altura, 0),
      placa: board,
      provenance: { round },
    });
  }
  return patterns;
}

export function deduplicatePatterns(patterns) {
  const byVector = new Map();
  for (const pattern of patterns) {
    const key = claveVector(pattern.uso);
    const previous = byVector.get(key);
    if (!previous || pattern.area > previous.area) byVector.set(key, pattern);
  }
  return [...byVector.values()];
}

export function generateSubsetPatterns(lines, config, {
  maskCount = 28,
  maskRounds = null,
  rounds = SUBSET_RESCUE_POLICY.rounds,
  maskSeed = SUBSET_RESCUE_POLICY.maskSeed,
  passes = SUBSET_RESCUE_POLICY.passes,
  restartsPerBoard = SUBSET_RESCUE_POLICY.restartsPerBoard,
  rescue = SUBSET_RESCUE_POLICY.rescue,
  beam = SUBSET_RESCUE_POLICY.beam,
} = {}) {
  if (!Array.isArray(lines) || !lines.length) {
    return { patterns: [], byRound: new Map(), selectedRounds: [], generationCpuMs: 0, masks: [] };
  }

  const indexed = lines.map((line, index) => ({ ...line, ref: index, _refOriginal: line.ref }));
  const masks = buildLegacyMasks(indexed.length, { rounds, seed: maskSeed });
  const diversityOrder = rankMasksByDiversity(masks);
  const selectedRounds = maskRounds == null
    ? diversityOrder.slice(0, Math.max(0, Math.min(maskCount, diversityOrder.length)))
    : [...maskRounds];

  const byRound = new Map();
  const started = process.cpuUsage();
  const warn = console.warn;
  console.warn = () => {};
  try {
    for (const round of selectedRounds) {
      const mask = masks[round];
      if (!mask?.length) {
        byRound.set(round, []);
        continue;
      }
      const subset = mask.map((type) => ({ ...indexed[type] }));
      try {
        const result = optimizar(subset, {
          ...config,
          semilla: 1000 + round,
          pases: passes,
          restartsPorPlaca: restartsPerBoard,
          usarRescue: rescue,
          maxPiezasBeam: beam ? (config.maxPiezasBeam ?? 120) : 0,
          multiVariantes: false,
        });
        byRound.set(round, registerPlanPatterns(result, round));
      } catch {
        byRound.set(round, []);
      }
    }
  } finally {
    console.warn = warn;
  }
  const cpu = process.cpuUsage(started);
  const patterns = deduplicatePatterns(selectedRounds.flatMap((round) => byRound.get(round) ?? []));
  return {
    patterns,
    byRound,
    selectedRounds,
    diversityOrder,
    masks,
    generationCpuMs: (cpu.user + cpu.system) / 1000,
  };
}

export function solvePatternPool(lines, config, patterns, {
  incumbentBoards = Number.POSITIVE_INFINITY,
  masterLimitMs = 20000,
  includeMonotypes = true,
} = {}) {
  const pool = deduplicatePatterns([
    ...patterns,
    ...(includeMonotypes ? patronesMonotipo(lines, config) : []),
  ]);
  const demand = lines.map((line) => Number(line.cant));
  const areas = lines.map((line) => Number(line.base) * Number(line.altura));
  const usableWidth = Number(config.placaBase) - Number(config.refiladoX ?? 0);
  const usableHeight = Number(config.placaAltura) - Number(config.refiladoY ?? 0);
  const master = resolverCobertura(pool, demand, usableWidth * usableHeight, incumbentBoards, masterLimitMs);
  if (!master) return { placas: incumbentBoards, plan: null, nodos: 0, agotado: false, poolSize: pool.length };
  return { ...master.resolver(areas), poolSize: pool.length };
}

"use strict";

const { optimizar } = require("../legacy/motor.cjs");

function usageKey(usage) {
  return [...usage.entries()]
    .filter(([, count]) => count > 0)
    .sort((a, b) => a[0] - b[0])
    .map(([index, count]) => `${index}:${count}`)
    .join("|");
}

function patternFromBoard(board, typeCount) {
  if (!board?.colocadas?.length) return null;
  const usage = new Map();
  for (const placement of board.colocadas) {
    const index = Number(placement?.pieza?.ref);
    if (!Number.isInteger(index) || index < 0 || index >= typeCount) return null;
    usage.set(index, (usage.get(index) || 0) + 1);
  }
  return {
    uso: usage,
    area: board.colocadas.reduce((sum, placement) => sum + placement.base * placement.altura, 0),
    placa: board,
  };
}

function monotypeGridCapacity(line, config) {
  const width = config.placaBase - (config.refiladoX || 0);
  const height = config.placaAltura - (config.refiladoY || 0);
  const kerf = config.sierra || 0;
  const orientations = (config.materialConVeta && line.veta) || line.base === line.altura
    ? [[line.base, line.altura]]
    : [[line.base, line.altura], [line.altura, line.base]];
  let best = 0;
  for (const [w, h] of orientations) {
    if (!(w > 0 && h > 0) || w > width + 1e-9 || h > height + 1e-9) continue;
    const nx = Math.floor((width + kerf + 1e-9) / (w + kerf));
    const ny = Math.floor((height + kerf + 1e-9) / (h + kerf));
    best = Math.max(best, nx * ny);
  }
  return Math.max(1, Math.min(line.cant, best || 1));
}

function scaleCountsToLimit(counts, maxPieces) {
  let total = counts.reduce((sum, count) => sum + count, 0);
  if (total <= maxPieces) return counts;
  const factor = maxPieces / total;
  const scaled = counts.map((count) => count > 0 ? Math.max(1, Math.floor(count * factor)) : 0);
  total = scaled.reduce((sum, count) => sum + count, 0);
  if (total <= maxPieces) return scaled;
  const order = scaled
    .map((count, index) => ({ index, count }))
    .filter((entry) => entry.count > 1)
    .sort((a, b) => b.count - a.count || a.index - b.index);
  let cursor = 0;
  while (total > maxPieces && order.length) {
    const entry = order[cursor % order.length];
    if (scaled[entry.index] > 1) {
      scaled[entry.index]--;
      total--;
    }
    cursor++;
    if (cursor > maxPieces * order.length * 4) break;
  }
  return scaled;
}

function demandRatioCounts(lines, targetBoards, indices, mode, scale, maxPieces, config, fillSubset) {
  const selected = new Set(indices);
  let counts = lines.map((line, index) => {
    if (!selected.has(index)) return 0;
    const raw = (line.cant / Math.max(1, targetBoards)) * scale;
    let value = mode === "floor" ? Math.floor(raw) : mode === "ceil" ? Math.ceil(raw) : Math.round(raw);
    if (value <= 0 && raw >= 0.35) value = 1;
    return Math.max(0, Math.min(line.cant, value));
  });

  if (fillSubset) {
    const boardArea = (config.placaBase - (config.refiladoX || 0)) * (config.placaAltura - (config.refiladoY || 0));
    const area = counts.reduce((sum, count, index) => sum + count * lines[index].base * lines[index].altura, 0);
    if (area > 0 && area < boardArea * 0.72) {
      const fill = Math.min(3.5, (boardArea * 0.9) / area);
      counts = counts.map((count, index) => count > 0 ? Math.min(lines[index].cant, Math.max(1, Math.round(count * fill))) : 0);
    }
  }

  if (!counts.some(Boolean)) {
    const best = indices
      .map((index) => ({ index, q: lines[index].cant / Math.max(1, targetBoards) }))
      .sort((a, b) => b.q - a.q || a.index - b.index)[0];
    if (best) counts[best.index] = 1;
  }
  return scaleCountsToLimit(counts, maxPieces);
}

function deterministicSubsets(typeCount, count, seed = 7) {
  let state = seed >>> 0;
  const rand = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const out = [];
  const seen = new Set();
  for (let round = 0; round < count * 4 && out.length < count; round++) {
    let indices = [];
    for (let index = 0; index < typeCount; index++) if (rand() > 0.45) indices.push(index);
    if (indices.length < 2 && typeCount >= 2) {
      indices = [round % typeCount, (round + 1) % typeCount].sort((a, b) => a - b);
    }
    const key = indices.join(",");
    if (!indices.length || seen.has(key)) continue;
    seen.add(key);
    out.push(indices);
  }
  return out;
}

function generateSerialDirectedPatterns(lines, config, options = {}) {
  const typeCount = lines.length;
  const targetBoards = Math.max(1, Math.floor(Number(options.targetBoards) || 1));
  const maxPhysicalTests = Math.max(1, Math.floor(Number(options.maxPhysicalTests) || 96));
  const maxBatchPieces = Math.max(8, Math.floor(Number(options.maxBatchPieces) || 96));
  const patterns = new Map();
  const capacities = lines.map((line) => monotypeGridCapacity(line, config));
  const upperBound = lines.reduce((sum, line, index) => sum + Math.ceil(line.cant / capacities[index]), 0);
  const telemetry = {
    targetBoards,
    maxPhysicalTests,
    maxBatchPieces,
    tests: 0,
    successfulTests: 0,
    failedTests: 0,
    boardsHarvested: 0,
    duplicatePatterns: 0,
    patterns: 0,
    capacities,
    upperBound,
    families: {},
  };

  function addPattern(board) {
    const pattern = patternFromBoard(board, typeCount);
    if (!pattern) return false;
    const key = usageKey(pattern.uso);
    if (!key) return false;
    const previous = patterns.get(key);
    if (!previous || pattern.area > previous.area) {
      patterns.set(key, pattern);
      return true;
    }
    telemetry.duplicatePatterns++;
    return false;
  }

  function probe(counts, family, seed) {
    if (telemetry.tests >= maxPhysicalTests) return false;
    const total = counts.reduce((sum, count) => sum + count, 0);
    if (!total || total > maxBatchPieces) return true;
    const sub = [];
    for (let index = 0; index < typeCount; index++) {
      const count = counts[index] || 0;
      if (!count) continue;
      sub.push({ ...lines[index], ref: index, cant: count });
    }
    if (!sub.length) return true;

    telemetry.tests++;
    telemetry.families[family] = (telemetry.families[family] || 0) + 1;
    try {
      const result = optimizar(sub, {
        ...config,
        semilla: seed,
        pases: 1,
        restartsPorPlaca: 1,
        usarRescue: false,
        maxPiezasBeam: Math.max(120, total),
        presupuestoBeamMs: 150,
        preferirMenorProfundidad: true,
        multiVariantes: false,
      });
      telemetry.successfulTests++;
      for (const board of result?.placas || []) {
        telemetry.boardsHarvested++;
        addPattern(board);
      }
    } catch {
      telemetry.failedTests++;
    }
    return telemetry.tests < maxPhysicalTests;
  }

  for (let index = 0; index < typeCount && telemetry.tests < maxPhysicalTests; index++) {
    const counts = new Array(typeCount).fill(0);
    counts[index] = 1;
    probe(counts, "UNIT", 1000 + index);
  }

  for (let index = 0; index < typeCount && telemetry.tests < maxPhysicalTests; index++) {
    const counts = new Array(typeCount).fill(0);
    counts[index] = Math.min(lines[index].cant, capacities[index], maxBatchPieces);
    probe(counts, "MONO_DENSE", 2000 + index);
  }

  const all = Array.from({ length: typeCount }, (_, index) => index);
  const targetVariants = [
    targetBoards,
    targetBoards + Math.max(1, Math.ceil(targetBoards * 0.04)),
    targetBoards + Math.max(1, Math.ceil(targetBoards * 0.08)),
  ];
  let variant = 0;
  for (const target of targetVariants) {
    for (const mode of ["round", "ceil"]) {
      if (telemetry.tests >= maxPhysicalTests) break;
      const counts = demandRatioCounts(lines, target, all, mode, 1, maxBatchPieces, config, false);
      probe(counts, "GLOBAL_RATIO", 3000 + variant++);
    }
  }

  const subsetBudget = Math.max(0, maxPhysicalTests - telemetry.tests);
  const subsets = deterministicSubsets(typeCount, subsetBudget, 7);
  let round = 0;
  for (const indices of subsets) {
    if (telemetry.tests >= maxPhysicalTests) break;
    const counts = demandRatioCounts(lines, targetBoards, indices, "ceil", 1, maxBatchPieces, config, true);
    probe(counts, "SUBSET_RATIO", 4000 + round++);
  }

  telemetry.patterns = patterns.size;
  return { patterns: [...patterns.values()], telemetry };
}

module.exports = { generateSerialDirectedPatterns };

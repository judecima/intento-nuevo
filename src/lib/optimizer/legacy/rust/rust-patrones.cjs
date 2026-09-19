"use strict";
const path = require("node:path");
const { optimizarLegacyHybrid } = require("./rust-hybrid.cjs");
const addonPath = path.join(
  __dirname,
  "../../../../../native/optimizer-pattern-generator/optimizer_pattern_generator.node",
);
const { optimizar } = require("../motor.cjs");

let addon;
function native() {
  addon ??= require(addonPath);
  if (typeof addon.legacyRoundSubsets !== "function" || typeof addon.legacyDedupBoards !== "function") {
    throw new Error("native addon does not expose the legacy outer contract");
  }
  return addon;
}

function legacyRoundSubsets(lineCount, rounds = 60, seed = 7) {
  return JSON.parse(native().legacyRoundSubsets(lineCount, rounds, seed)).rounds;
}

function usarMascarasUnicasLe4(lineas, O, rondas, semilla) {
  const flag =
    O?.usarMascarasUnicasMasterLe4 === true ||
    /^(1|true|yes|on)$/i.test(String(process.env.OPTIMIZER_MASTER_UNIQUE_MASKS_LE4_EXPERIMENTAL || ''));
  return !!(
    flag &&
    Array.isArray(lineas) &&
    lineas.length >= 1 &&
    lineas.length <= 4 &&
    rondas === 40 &&
    semilla === 7
  );
}

function crearFiltroMascaras(lineas, O, rondas, semilla) {
  const enabled = usarMascarasUnicasLe4(lineas, O, rondas, semilla);
  const seen = enabled ? new Set() : null;
  let executedRounds = 0;
  let skippedDuplicateRounds = 0;

  return {
    skip(indices) {
      if (!enabled) {
        executedRounds++;
        return false;
      }
      const key = indices.join(",");
      if (seen.has(key)) {
        skippedDuplicateRounds++;
        return true;
      }
      seen.add(key);
      executedRounds++;
      return false;
    },
    finish(totalRounds) {
      if (!enabled || !O || typeof O !== "object") return;
      O._patternMaskPolicy = {
        policy: "first-unique-mask-le4",
        typeCount: lineas.length,
        totalRounds,
        executedRounds,
        skippedDuplicateRounds,
      };
    },
  };
}

function generarPatronesLegacyRustOuter(lineas, O, rondas = 60, semilla = 7) {
  const schedule = legacyRoundSubsets(lineas.length, rondas, semilla);
  const conRef = lineas.map((linea, index) => ({ ...linea, ref: index, _refOriginal: linea.ref }));
  const boards = [];
  const candidates = [];
  const maskFilter = crearFiltroMascaras(lineas, O, rondas, semilla);

  const warn = console.warn;
  console.warn = () => {};
  try {
    for (let round = 0; round < schedule.length; round++) {
      const indices = schedule[round];
      if (!indices.length) continue;
      if (maskFilter.skip(indices)) continue;
      try {
        const result = optimizar(
          indices.map((index) => ({ ...conRef[index] })),
          { ...O, semilla: 1000 + round, pases: 2 },
        );
        for (const board of result.placas) {
          const payloadIndex = boards.length;
          boards.push(board);
          candidates.push({
            payloadIndex,
            placements: board.colocadas.map((placement) => ({
              typeIndex: typeof placement?.pieza?.ref === "number" ? placement.pieza.ref : null,
              base: placement.base,
              altura: placement.altura,
            })),
          });
        }
      } catch {
        // Exact legacy behavior: invalid subset is ignored.
      }
    }
  } finally {
    console.warn = warn;
    maskFilter.finish(schedule.length);
  }

  const selected = JSON.parse(native().legacyDedupBoards(JSON.stringify(candidates), lineas.length));
  return selected.map((entry) => ({
    uso: new Map(entry.usageVector.map((count, index) => [index, count]).filter(([, count]) => count > 0)),
    area: entry.area,
    placa: boards[entry.payloadIndex],
  }));
}


const MASTER_ROUND_CACHE_MAX_CONTEXTS = 4;
const MASTER_ROUND_CACHE_TTL_MS = 10 * 60 * 1000;
const masterRoundCache = new Map();

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .filter((key) => value[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

function masterRoundReuseEnabled(lineas, O, rondas, semilla) {
  if (!O || !Array.isArray(lineas)) return false;
  const enabled =
    O.usarReuseRondasMasterRust === true ||
    /^(1|true|yes|on)$/i.test(String(process.env.OPTIMIZER_RUST_MASTER_ROUND_REUSE_EXPERIMENTAL || ""));
  if (!enabled) return false;
  if (rondas !== 40 && rondas !== 60) return false;
  if (semilla !== 7) return false;
  const maxExpansions = Number(O.maxExpansionesBeam);
  if (!Number.isFinite(maxExpansions) || maxExpansions <= 0) return false;
  const watchdog = Number(O.watchdogBeamMs);
  if (Number.isFinite(watchdog) && watchdog > 0) return false;
  if (usarMascarasUnicasLe4(lineas, O, 40, semilla)) return false;
  return true;
}

function masterRoundCacheKey(lineas, O, semilla) {
  const ignored = new Set(["presupuestoBeamMs", "rondasPatrones", "msMaster"]);
  const options = {};
  for (const [key, value] of Object.entries(O || {})) {
    if (key.startsWith("_") || ignored.has(key) || value === undefined) continue;
    options[key] = value;
  }
  return stableStringify({
    contract: "rust-master-rounds-v1",
    semilla,
    lineas,
    options,
  });
}

function getMasterRoundGroup(key) {
  const now = Date.now();
  let group = masterRoundCache.get(key);
  if (group && now - group.touchedAt > MASTER_ROUND_CACHE_TTL_MS) {
    masterRoundCache.delete(key);
    group = null;
  }
  if (!group) {
    group = { touchedAt: now, rounds: new Map() };
  } else {
    masterRoundCache.delete(key);
    group.touchedAt = now;
  }
  masterRoundCache.set(key, group);
  while (masterRoundCache.size > MASTER_ROUND_CACHE_MAX_CONTEXTS) {
    const oldest = masterRoundCache.keys().next().value;
    if (oldest === undefined) break;
    masterRoundCache.delete(oldest);
  }
  return group;
}

function generarPatronesLegacyRustHybrid(lineas, O, rondas = 60, semilla = 7) {
  const schedule = legacyRoundSubsets(lineas.length, rondas, semilla);
  const conRef = lineas.map((linea, index) => ({ ...linea, ref: index, _refOriginal: linea.ref }));
  const boards = [];
  const candidates = [];
  const maskFilter = crearFiltroMascaras(lineas, O, rondas, semilla);
  const reuseEnabled = masterRoundReuseEnabled(lineas, O, rondas, semilla);
  const group = reuseEnabled ? getMasterRoundGroup(masterRoundCacheKey(lineas, O, semilla)) : null;
  let reusedRounds = 0;
  let generatedRounds = 0;

  for (let round = 0; round < schedule.length; round++) {
    const indices = schedule[round];
    if (!indices.length) continue;
    if (maskFilter.skip(indices)) continue;

    let roundBoards = null;
    const cached = group?.rounds.get(round);
    if (cached) {
      reusedRounds++;
      roundBoards = cached.boards;
    } else {
      generatedRounds++;
      try {
        const result = optimizarLegacyHybrid(
          indices.map((index) => ({ ...conRef[index] })),
          { ...O, semilla: 1000 + round, pases: 2 },
        );
        roundBoards = result.placas || [];
        if (group) group.rounds.set(round, { boards: roundBoards });
      } catch (error) {
        if (process.env.RUST_LEGACY_DEBUG_ERRORS === "1") throw error;
        roundBoards = [];
      }
    }

    for (const board of roundBoards) {
      const payloadIndex = boards.length;
      boards.push(board);
      candidates.push({
        payloadIndex,
        placements: board.colocadas.map((placement) => ({
          typeIndex: typeof placement?.pieza?.ref === "number" ? placement.pieza.ref : null,
          base: placement.base,
          altura: placement.altura,
        })),
      });
    }
  }

  if (O && typeof O === "object") {
    O._rustMasterRoundReuse = {
      enabled: reuseEnabled,
      totalRounds: schedule.length,
      reusedRounds,
      generatedRounds,
    };
  }

  maskFilter.finish(schedule.length);
  const selected = JSON.parse(native().legacyDedupBoards(JSON.stringify(candidates), lineas.length));
  return selected.map((entry) => ({
    uso: new Map(entry.usageVector.map((count, index) => [index, count]).filter(([, count]) => count > 0)),
    area: entry.area,
    placa: boards[entry.payloadIndex],
  }));
}

module.exports = {
  legacyRoundSubsets,
  generarPatronesLegacyRustOuter,
  generarPatronesLegacyRustHybrid,
};

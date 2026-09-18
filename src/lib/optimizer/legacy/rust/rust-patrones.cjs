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


function generarPatronesLegacyRustHybrid(lineas, O, rondas = 60, semilla = 7) {
  const schedule = legacyRoundSubsets(lineas.length, rondas, semilla);
  const conRef = lineas.map((linea, index) => ({ ...linea, ref: index, _refOriginal: linea.ref }));
  const boards = [];
  const candidates = [];
  const maskFilter = crearFiltroMascaras(lineas, O, rondas, semilla);

  for (let round = 0; round < schedule.length; round++) {
    const indices = schedule[round];
    if (!indices.length) continue;
    if (maskFilter.skip(indices)) continue;
    try {
      const result = optimizarLegacyHybrid(
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
    } catch (error) {
      if (process.env.RUST_LEGACY_DEBUG_ERRORS === "1") throw error;
      // Same policy as legacy generarPatrones: invalid subsets are skipped.
    }
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

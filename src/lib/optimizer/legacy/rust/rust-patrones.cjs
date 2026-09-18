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

function generarPatronesLegacyRustOuter(lineas, O, rondas = 60, semilla = 7) {
  const schedule = legacyRoundSubsets(lineas.length, rondas, semilla);
  const conRef = lineas.map((linea, index) => ({ ...linea, ref: index, _refOriginal: linea.ref }));
  const boards = [];
  const candidates = [];

  const warn = console.warn;
  console.warn = () => {};
  try {
    for (let round = 0; round < schedule.length; round++) {
      const indices = schedule[round];
      if (!indices.length) continue;
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

  for (let round = 0; round < schedule.length; round++) {
    const indices = schedule[round];
    if (!indices.length) continue;
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
      const certification = O && O._rustCertificationTelemetry;
      if (certification) {
        certification.rustGeneratorCaughtError =
          error instanceof Error ? error.message : String(error);
      }
      if (O && O._rustCertificationStrict === true) throw error;
      if (process.env.RUST_LEGACY_DEBUG_ERRORS === "1") throw error;
      // Same policy as legacy generarPatrones: invalid subsets are skipped.
    }
  }

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

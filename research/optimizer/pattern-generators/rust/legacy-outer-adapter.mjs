import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { optimizarLegacyHybrid } from "./legacy-hybrid-engine.mjs";

const require = createRequire(import.meta.url);
const addonPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../native/optimizer-pattern-generator/optimizer_pattern_generator.node",
);
const legacyPath = join(dirname(fileURLToPath(import.meta.url)), "../../../../src/lib/optimizer/legacy");
const { optimizar } = require(join(legacyPath, "motor.cjs"));

let addon;
function native() {
  addon ??= require(addonPath);
  if (typeof addon.legacyRoundSubsets !== "function" || typeof addon.legacyDedupBoards !== "function") {
    throw new Error("native addon does not expose the legacy outer contract");
  }
  return addon;
}

export function legacyRoundSubsets(lineCount, rounds = 60, seed = 7) {
  return JSON.parse(native().legacyRoundSubsets(lineCount, rounds, seed)).rounds;
}

export function generarPatronesLegacyRustOuter(lineas, O, rondas = 60, semilla = 7) {
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


export function generarPatronesLegacyRustHybrid(lineas, O, rondas = 60, semilla = 7) {
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
    } catch {
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

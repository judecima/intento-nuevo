import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { legacyRoundSubsets, generarPatronesLegacyRustHybrid } = require(
  "../../src/lib/optimizer/legacy/rust/rust-patrones.cjs",
);
const { createIncrementalRustMasterGenerator } = require(
  "../../src/lib/optimizer/legacy/rust/incremental-master.cjs",
);

const LINES = [
  { ref: "a", cant: 4, base: 1200, altura: 400, veta: false },
  { ref: "b", cant: 7, base: 800, altura: 350, veta: false },
  { ref: "c", cant: 5, base: 650, altura: 500, veta: false },
  { ref: "d", cant: 8, base: 420, altura: 300, veta: false },
  { ref: "e", cant: 3, base: 1000, altura: 250, veta: false },
];

const CONFIG = {
  placaBase: 2600,
  placaAltura: 1830,
  refiladoX: 0,
  refiladoY: 0,
  sierra: 4.5,
  etapas: 4,
  materialConVeta: false,
  descontarCanto: false,
  cantoEspesor: 0,
  restoMin: 250,
  restoMax: 400,
  usarRustPatternGenerator: true,
  usarCache: false,
  maxPiezasCache: 0,
  rondasPatrones: 40,
};

function signature(pattern: any) {
  return {
    usage: [...pattern.uso.entries()].sort((a, b) => a[0] - b[0]),
    area: pattern.area,
    placements: (pattern.placa?.colocadas ?? []).map((p: any) => [
      p?.pieza?.ref,
      p.base,
      p.altura,
      p.x,
      p.y,
      Boolean(p.rotada),
      p.nivel ?? 0,
    ]),
  };
}

describe("incremental Master production contract", () => {
  it("keeps the first N rounds identical regardless of requested total rounds", () => {
    const p3 = legacyRoundSubsets(LINES.length, 3, 7);
    const p40 = legacyRoundSubsets(LINES.length, 40, 7);
    expect(p40.slice(0, 3)).toEqual(p3);
  });

  it("reproduces production P3 with a 40-round incremental generator", () => {
    const direct = generarPatronesLegacyRustHybrid(LINES, { ...CONFIG }, 3, 7);
    const incremental = createIncrementalRustMasterGenerator(LINES, { ...CONFIG }, 40, 7);
    incremental.execute([0, 1, 2]);
    const staged = incremental.patterns([0, 1, 2]);

    expect(staged.map(signature)).toEqual(direct.map(signature));
  });

  it("reproduces production Full40 after incremental blocks without regenerating rounds", () => {
    const direct = generarPatronesLegacyRustHybrid(LINES, { ...CONFIG }, 40, 7);
    const incremental = createIncrementalRustMasterGenerator(LINES, { ...CONFIG }, 40, 7);

    incremental.execute([0, 1, 2]);
    incremental.execute([3, 4, 5, 6]);
    incremental.execute(Array.from({ length: 33 }, (_, i) => i + 7));

    expect(incremental.executedRounds()).toEqual(Array.from({ length: 40 }, (_, i) => i));
    expect(incremental.patterns().map(signature)).toEqual(direct.map(signature));
  });
});

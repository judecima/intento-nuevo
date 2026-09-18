import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { generarPatrones } = require("../../src/lib/optimizer/legacy/patrones.cjs");
const {
  generarPatronesLegacyRustOuter,
  legacyRoundSubsets,
} = require("../../research/optimizer/pattern-generators/rust/legacy-outer-adapter.mjs");

function jsSchedule(lineCount: number, rounds: number, seed: number) {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return (state & 0x7fffffff) / 0x7fffffff;
  };
  const output: number[][] = [];
  for (let round = 0; round < rounds; round++) {
    if (round === 0) output.push(Array.from({ length: lineCount }, (_, index) => index));
    else output.push(Array.from({ length: lineCount }, (_, index) => index).filter(() => random() > 0.45));
  }
  return output;
}

function normalizePool(pool: any[]) {
  return pool.map((pattern) => ({
    usage: [...pattern.uso.entries()].sort((a: any, b: any) => a[0] - b[0]),
    area: pattern.area,
    board: {
      ancho: pattern.placa.ancho,
      alto: pattern.placa.alto,
      colocadas: pattern.placa.colocadas.map((placement: any) => ({
        x: placement.x,
        y: placement.y,
        base: placement.base,
        altura: placement.altura,
        rotada: placement.rotada,
        ref: placement.pieza?.ref,
      })),
      cortes: pattern.placa.cortes.map((cut: any) => ({
        x1: cut.x1, y1: cut.y1, x2: cut.x2, y2: cut.y2,
        nivel: cut.nivel, largo: cut.largo, terminal: Boolean(cut.terminal),
      })),
      restos: pattern.placa.restos.map((rest: any) => ({
        x: rest.x, y: rest.y, w: rest.w, h: rest.h,
      })),
    },
  }));
}

describe("Rust legacy outer pattern contract", () => {
  it("matches the legacy LCG subset schedule exactly", () => {
    expect(legacyRoundSubsets(17, 80, 7)).toEqual(jsSchedule(17, 80, 7));
    expect(legacyRoundSubsets(4, 40, 123456789)).toEqual(jsSchedule(4, 40, 123456789));
  });

  it("reproduces the legacy generated physical pool when JS motor remains the plate constructor", () => {
    const lines = [
      { ref: "A", detalle: "A", cant: 3, base: 600, altura: 600, veta: false },
      { ref: "B", detalle: "B", cant: 4, base: 400, altura: 400, veta: false },
      { ref: "C", detalle: "C", cant: 2, base: 500, altura: 300, veta: false },
    ];
    const config = {
      placaBase: 1000,
      placaAltura: 1000,
      refiladoX: 0,
      refiladoY: 0,
      sierra: 0,
      etapas: 3,
      materialConVeta: false,
      descontarCanto: false,
      cantoEspesor: 0,
      restoMin: 100,
      restoMax: 100,
      ruido: 0.3,
      restartsPorPlaca: 3,
      usarRescue: false,
      usarCache: false,
      maxPiezasBeam: 0,
      multiVariantes: false,
      preferirMenorProfundidad: true,
    };

    const legacy = generarPatrones(lines, config, 12, 7);
    const rustOuter = generarPatronesLegacyRustOuter(lines, config, 12, 7);
    expect(normalizePool(rustOuter)).toEqual(normalizePool(legacy));
  });
});

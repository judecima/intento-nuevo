import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { optimizarLegacyHybrid } = require("../../src/lib/optimizer/legacy/rust/rust-hybrid.cjs");

function normalizeTree(node: any): any {
  if (!node) return null;
  return {
    x: node.x, y: node.y, w: node.w, h: node.h, dir: node.dir, nivel: node.nivel,
    partes: (node.partes ?? []).map((part: any) => ({
      cut: part.cut,
      type: part.type,
      pieceId: part.pieza?.id ?? null,
      bloque: part.bloque,
      hijo: normalizeTree(part.hijo),
      ...(part.terminal === undefined ? {} : { terminal: Boolean(part.terminal) }),
    })),
  };
}

function normalizePlan(plan: any) {
  return (plan.placas ?? []).map((board: any) => ({
    ancho: board.ancho,
    alto: board.alto,
    colocadas: (board.colocadas ?? []).map((placement: any) => ({
      id: placement.pieza?.id,
      ref: placement.pieza?.ref,
      x: placement.x,
      y: placement.y,
      base: placement.base,
      altura: placement.altura,
      rotada: Boolean(placement.rotada),
      nivel: placement.nivel,
    })),
    cortes: board.cortes ?? [],
    restos: board.restos ?? [],
    arbol: normalizeTree(board.arbol),
  }));
}

const CASES = [
  {
    name: "4056900",
    config: {
      placaBase: 2740,
      placaAltura: 1820,
      refiladoX: 0,
      refiladoY: 0,
      sierra: 4.4,
      etapas: 4,
      materialConVeta: false,
      descontarCanto: false,
      cantoEspesor: 0,
      restoMin: 250,
      restoMax: 400,
      usarCache: true,
      maxPiezasCache: 160,
      pases: 2,
      multiVariantes: false,
      usarRescue: false,
    },
    lines: [
      { ref: "1", detalle: "1", cant: 16, base: 2000, altura: 350, veta: false, cantos: null },
      { ref: "2", detalle: "2", cant: 24, base: 964, altura: 350, veta: false, cantos: null },
      { ref: "4", detalle: "4", cant: 24, base: 564, altura: 350, veta: false, cantos: null },
      { ref: "3", detalle: "3", cant: 30, base: 378, altura: 350, veta: false, cantos: null },
    ],
  },
  {
    name: "4057401",
    config: {
      placaBase: 2742,
      placaAltura: 1822,
      refiladoX: 0,
      refiladoY: 0,
      sierra: 4.5,
      etapas: 4,
      materialConVeta: false,
      descontarCanto: false,
      cantoEspesor: 0,
      restoMin: 250,
      restoMax: 400,
      usarCache: true,
      maxPiezasCache: 160,
      pases: 2,
      multiVariantes: false,
      usarRescue: false,
    },
    lines: [
      { ref: "1", detalle: "1", cant: 2, base: 1800, altura: 1050, veta: false, cantos: null },
      { ref: "3", detalle: "3", cant: 2, base: 2000, altura: 1100, veta: false, cantos: null },
      { ref: "2", detalle: "2", cant: 1, base: 1900, altura: 1500, veta: false, cantos: null },
      { ref: "4", detalle: "4", cant: 14, base: 744, altura: 450, veta: false, cantos: null },
    ],
  },
];

describe("Rust greedy -> beam batch reuse", () => {
  for (const fixture of CASES) {
    it(`preserves the exact physical plan for ${fixture.name}`, () => {
      const baseline = optimizarLegacyHybrid(fixture.lines, {
        ...fixture.config,
        usarReusoGreedyBeamRust: false,
      });
      const reused = optimizarLegacyHybrid(fixture.lines, {
        ...fixture.config,
        usarReusoGreedyBeamRust: true,
      });

      expect(reused.resumen.placas).toBe(baseline.resumen.placas);
      expect(normalizePlan(reused)).toEqual(normalizePlan(baseline));
      expect(reused.greedyBeamReuse).toBeDefined();
      expect(reused.greedyBeamReuse.storedStates).toBeGreaterThan(0);
      expect(reused.greedyBeamReuse.hits).toBeGreaterThan(0);
      expect(reused.greedyBeamReuse.misses).toBeGreaterThanOrEqual(0);
    });
  }

  it("does not activate for orders above the beam piece ceiling", () => {
    const lines = [
      { ref: "A", detalle: "A", cant: 121, base: 300, altura: 300, veta: false, cantos: null },
    ];
    const result = optimizarLegacyHybrid(lines, {
      ...CASES[0].config,
      usarReusoGreedyBeamRust: true,
      maxPiezasBeam: 120,
    });
    expect(result.greedyBeamReuse).toEqual({
      storedStates: 0,
      storedCandidates: 0,
      hits: 0,
      misses: 0,
    });
  });
});

import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

const { resolverCobertura } = require("../../src/lib/optimizer/legacy/cobertura.cjs") as {
  resolverCobertura(
    patrones: Array<Record<string, unknown>>,
    demanda: number[],
    areaPlaca: number,
    incumbente: number,
    limiteMs?: number,
  ): { resolver(areaTipos: number[]): { placas: number; plan: Array<Record<string, unknown>> | null } } | null;
};

const { materializar } = require("../../src/lib/optimizer/legacy/materializar.cjs") as {
  materializar(
    plan: Array<Record<string, unknown>>,
    lineas: Array<Record<string, unknown>>,
    opts: Record<string, unknown>,
  ): { resumen: { patternTrace: { selectedPatterns: number; roundFound: number | null; maxSourceRound: number | null; origins: Record<string, number>; untraced: number } } } | null;
};

function pattern(round: number, origin = "random") {
  return {
    uso: new Map([[0, 1]]),
    area: 100,
    _patternMeta: { origin, firstSeenRound: round, sourceRound: round },
    placa: {
      ancho: 100,
      alto: 100,
      colocadas: [
        {
          base: 10,
          altura: 10,
          x: 0,
          y: 0,
          pieza: { id: 10, ref: 0, _corte: { base: 10, altura: 10 } }
        }
      ],
      cortes: [],
      restos: [],
      arbol: null
    }
  };
}

describe("pattern provenance", () => {
  it("preserves provenance through coverage and exposes roundFound after materialization", () => {
    const solver = resolverCobertura([pattern(7)], [2], 10_000, 3, 1_000);
    const solution = solver?.resolver([100]);

    expect(solution?.placas).toBe(2);
    expect(solution?.plan?.[0]).toMatchObject({
      _patternMeta: { origin: "random", firstSeenRound: 7, sourceRound: 7 }
    });

    const plan = materializar(
      solution?.plan ?? [],
      [{ cant: 2, base: 10, altura: 10, ref: "A", detalle: "A" }],
      { placaBase: 100, placaAltura: 100 },
    );

    expect(plan?.resumen.patternTrace).toEqual({
      selectedPatterns: 2,
      roundFound: 7,
      maxSourceRound: 7,
      origins: { random: 2 },
      untraced: 0
    });
  });

  it("keeps legacy/uninstrumented patterns valid and marks them as untraced", () => {
    const untraced = pattern(0);
    delete (untraced as { _patternMeta?: unknown })._patternMeta;

    const solver = resolverCobertura([untraced], [1], 10_000, 2, 1_000);
    const solution = solver?.resolver([100]);
    const plan = materializar(
      solution?.plan ?? [],
      [{ cant: 1, base: 10, altura: 10, ref: "A", detalle: "A" }],
      { placaBase: 100, placaAltura: 100 },
    );

    expect(plan?.resumen.patternTrace).toMatchObject({
      selectedPatterns: 1,
      roundFound: null,
      maxSourceRound: null,
      untraced: 1
    });
  });
});

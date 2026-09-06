import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

const bounds = require("../../src/lib/optimizer/experimental/claude-lower-bounds.cjs") as {
  computeLowerBound(
    lines: Array<Record<string, unknown>>,
    opts: Record<string, unknown>,
    config?: Record<string, unknown>,
  ): {
    area: number;
    best: number;
    ancho: number;
    alto: number;
    factible: boolean;
  };
};

const lines = [
  { ref: "A", cant: 2, base: 600, altura: 500, veta: false },
  { ref: "B", cant: 2, base: 400, altura: 300, veta: false },
];

const baseOpts = {
  placaBase: 2750,
  placaAltura: 1830,
  sierra: 4.4,
  materialConVeta: false,
  descontarCanto: false,
  cantoEspesor: 0,
};

describe("experimental cheap lower-bound smoke", () => {
  it("treats omitted trim exactly like explicit zero trim", () => {
    const omitted = bounds.computeLowerBound(lines, baseOpts, { usarRaster: false });
    const explicitZero = bounds.computeLowerBound(
      lines,
      { ...baseOpts, refiladoX: 0, refiladoY: 0 },
      { usarRaster: false },
    );

    expect(omitted.factible).toBe(true);
    expect(Number.isFinite(omitted.ancho)).toBe(true);
    expect(Number.isFinite(omitted.alto)).toBe(true);
    expect(omitted.ancho).toBe(2750);
    expect(omitted.alto).toBe(1830);
    expect(omitted.area).toBeGreaterThan(0);
    expect(omitted.best).toBeGreaterThan(0);
    expect(omitted).toEqual(explicitZero);
  });
});

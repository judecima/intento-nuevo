import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const patrones = require("../../src/lib/optimizer/legacy/patrones.cjs") as {
  generarPatrones(
    lines: Array<Record<string, unknown>>,
    config: Record<string, unknown>,
    rounds?: number,
    seed?: number,
  ): Array<{
    uso: Map<number, number>;
    _patternMeta?: {
      origin?: string;
      firstSeenRound?: number | null;
      sourceRound?: number | null;
      visibleTypes?: number[] | null;
    };
  }>;
  claveVector(uso: Map<number, number>): string;
};

const lines = [
  { ref: "A", detalle: "A", cant: 4, base: 600, altura: 400, veta: false },
  { ref: "B", detalle: "B", cant: 3, base: 500, altura: 300, veta: false },
  { ref: "C", detalle: "C", cant: 2, base: 350, altura: 250, veta: false },
];

const config = {
  placaBase: 1600,
  placaAltura: 1000,
  refiladoX: 0,
  refiladoY: 0,
  sierra: 4.5,
  etapas: 4,
  materialConVeta: false,
  descontarCanto: false,
  cantoEspesor: 0,
  restoMin: 60,
  restoMax: 400,
  usarCache: false,
};

describe("V21c Pattern Master provenance", () => {
  it("does not change the generated vector pool when instrumentation is enabled", () => {
    const legacy = patrones.generarPatrones(lines, config, 8, 7);
    const diagnostic = patrones.generarPatrones(
      lines,
      { ...config, _instrumentarPatrones: true },
      8,
      7,
    );

    const legacyKeys = legacy.map((p) => patrones.claveVector(p.uso));
    const diagnosticKeys = diagnostic.map((p) => patrones.claveVector(p.uso));

    expect(diagnosticKeys).toEqual(legacyKeys);
    expect(legacy.every((p) => p._patternMeta === undefined)).toBe(true);
    expect(diagnostic.length).toBeGreaterThan(0);
    expect(diagnostic.every((p) => p._patternMeta?.origin === "random")).toBe(true);
    expect(
      diagnostic.every((p) =>
        Number.isInteger(p._patternMeta?.firstSeenRound) &&
        Number.isInteger(p._patternMeta?.sourceRound) &&
        Array.isArray(p._patternMeta?.visibleTypes)
      )
    ).toBe(true);
  });
});

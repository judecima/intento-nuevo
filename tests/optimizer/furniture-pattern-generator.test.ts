import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  generateFurnitureFamilyPatterns,
  registerPattern,
} = require("../../src/lib/optimizer/experimental/furniture-pattern-generator.cjs") as {
  generateFurnitureFamilyPatterns(
    lines: Array<Record<string, unknown>>,
    config: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): {
    patterns: Array<Record<string, unknown>>;
    seeds: Array<Record<string, unknown>>;
    warnings: Array<Record<string, unknown>>;
    metrics: { seeds: number; patterns: number; warnings: number; ms: number };
  };
  registerPattern(
    byVector: Map<string, Record<string, unknown>>,
    board: Record<string, unknown>,
    meta: Record<string, unknown>,
  ): void;
};

function board(areaWidth: number) {
  return {
    colocadas: [
      {
        base: areaWidth,
        altura: 100,
        pieza: { ref: 0 },
      },
    ],
  };
}

describe("furniture family physical pattern generator", () => {
  it("deduplicates a coverage vector keeping the larger physical variant", () => {
    const byVector = new Map<string, Record<string, unknown>>();
    registerPattern(byVector, board(100), { origin: "family-base", familyKey: "base:500" });
    registerPattern(byVector, board(120), { origin: "family-altura", familyKey: "altura:500" });

    expect(byVector.size).toBe(1);
    const [pattern] = [...byVector.values()] as Array<{
      area: number;
      _patternMeta: { origin: string; familyKey: string };
    }>;
    expect(pattern.area).toBe(12_000);
    expect(pattern._patternMeta).toMatchObject({
      origin: "family-altura",
      familyKey: "altura:500",
    });
  });

  it("generates only physically materialized patterns through the legacy motor", () => {
    const result = generateFurnitureFamilyPatterns(
      [
        { ref: "A", cant: 2, base: 600, altura: 500, detalle: "A" },
        { ref: "B", cant: 2, base: 600, altura: 400, detalle: "B" },
        { ref: "X", cant: 1, base: 333, altura: 211, detalle: "X" },
      ],
      {
        placaBase: 2750,
        placaAltura: 1830,
        refiladoX: 10,
        refiladoY: 10,
        sierra: 4.5,
        etapas: 4,
        materialConVeta: false,
        descontarCanto: false,
        cantoEspesor: 0,
        usarRescue: false,
        presupuestoBeamMs: 100,
        maxPiezasBeam: 0,
        multiVariantes: false,
      },
      { maxFamilies: 4, passes: 1 },
    );

    expect(result.seeds).toHaveLength(1);
    expect(result.warnings).toHaveLength(0);
    expect(result.patterns.length).toBeGreaterThan(0);
    expect(result.patterns.every((pattern) => {
      const p = pattern as {
        placa?: { colocadas?: unknown[] };
        _patternMeta?: { origin?: string; familyKey?: string };
      };
      return (p.placa?.colocadas?.length ?? 0) > 0 &&
        p._patternMeta?.origin === "family-base" &&
        p._patternMeta?.familyKey === "base:600";
    })).toBe(true);
  });
});

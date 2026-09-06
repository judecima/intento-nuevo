import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

const v10 = require("../../src/lib/optimizer/legacy/v10.cjs") as {
  optimizarV10(
    lines: Array<Record<string, unknown>>,
    config: Record<string, unknown>,
  ): {
    plan: { resumen: { placas: number } };
    cota: number;
    metricas: {
      v21: {
        familyRuns: number;
        familyCertified: number;
        familyMs: number;
        familySeeds: number;
        familyPatterns: number;
        randomPatterns: number;
        fastPoolSize: number;
        fallbackRuns: number;
        errors: number;
      };
    };
  };
};

const seeds = require("../../src/lib/optimizer/experimental/furniture-pattern-seeds.cjs") as {
  buildExactDimensionFamilies(
    lines: Array<Record<string, unknown>>,
    options?: Record<string, unknown>,
  ): Array<{
    origin: string;
    axis: string;
    dimension: number;
    typeIndexes: number[];
  }>;
};

const generator = require("../../src/lib/optimizer/experimental/furniture-pattern-generator.cjs") as {
  generateFurnitureFamilyPatterns(
    lines: Array<Record<string, unknown>>,
    config: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): {
    patterns: Array<{ _patternMeta?: { origin?: string } }>;
    metrics: { seeds: number; patterns: number; warnings: number; ms: number };
  };
};

const lines = [
  { ref: "A", detalle: "pieza A", cant: 1, base: 600, altura: 600, veta: false },
  { ref: "B", detalle: "pieza B", cant: 1, base: 600, altura: 500, veta: false },
];

const config = {
  placaBase: 1000,
  placaAltura: 1000,
  refiladoX: 0,
  refiladoY: 0,
  sierra: 5,
  etapas: 4,
  materialConVeta: false,
  descontarCanto: false,
  cantoEspesor: 0,
  restoMin: 100,
  restoMax: 250,
  usarOneBoard: false,
  usarMultiSlice: false,
  usarCompactacion: false,
  usarMaster: true,
  msMaster: 25,
  rondasPatrones: 4,
};

describe("V21 furniture family Pattern Master", () => {
  it("builds deterministic same-axis families", () => {
    const families = seeds.buildExactDimensionFamilies(lines);

    expect(families.length).toBeGreaterThan(0);
    expect(families[0].origin).toBe("family-base");
    expect(families[0].axis).toBe("base");
    expect(families[0].dimension).toBe(600);
    expect(families[0].typeIndexes).toEqual([0, 1]);
  });

  it("materializes physical family patterns with provenance", () => {
    const result = generator.generateFurnitureFamilyPatterns(lines, config, {
      maxFamilies: 12,
      passes: 1,
    });

    expect(result.metrics.seeds).toBeGreaterThan(0);
    expect(result.metrics.patterns).toBeGreaterThan(0);
    expect(result.metrics.warnings).toBe(0);
    expect(result.patterns.some((pattern) => pattern._patternMeta?.origin === "family-base")).toBe(true);
  });

  it("does nothing when the V21 flag is off", () => {
    const result = v10.optimizarV10(lines, config);

    expect(result.metricas.v21.familyRuns).toBe(0);
    expect(result.metricas.v21.familyCertified).toBe(0);
    expect(result.metricas.v21.fallbackRuns).toBe(0);
  });

  it("falls back to the legacy Master when the fast pool cannot certify the lower bound", () => {
    const legacy = v10.optimizarV10(lines, config);
    const result = v10.optimizarV10(lines, {
      ...config,
      usarV21FamilyPatterns: true,
    });

    expect(result.plan.resumen.placas).toBe(legacy.plan.resumen.placas);
    expect(result.metricas.v21.familyRuns).toBe(1);
    expect(result.metricas.v21.familyCertified).toBe(0);
    expect(result.metricas.v21.fallbackRuns).toBe(1);
    expect(result.metricas.v21.errors).toBe(0);
    expect(result.metricas.v21.familySeeds).toBeGreaterThan(0);
    expect(result.metricas.v21.fastPoolSize).toBeGreaterThan(0);
  });
});

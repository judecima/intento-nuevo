import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const v10 = require("../../src/lib/optimizer/legacy/v10.cjs") as {
  optimizarV10(
    lines: Array<Record<string, unknown>>,
    config: Record<string, unknown>,
  ): {
    plan: { resumen: { placas: number } };
    metricas: { master: { activaciones: number } };
  };
};
const seeds = require("../../src/lib/optimizer/experimental/furniture-pattern-seeds.cjs") as {
  buildExactDimensionFamilies(
    lines: Array<Record<string, unknown>>,
    options?: Record<string, unknown>,
  ): Array<{ origin: string; axis: string; dimension: number; typeIndexes: number[] }>;
};
const patrones = require("../../src/lib/optimizer/legacy/patrones.cjs") as {
  generarPatrones(
    lines: Array<Record<string, unknown>>,
    config: Record<string, unknown>,
    rounds?: number,
  ): Array<{ _patternMeta?: { origin?: string; firstSeenRound?: number | null } }>;
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
  msMaster: 100,
  rondasPatrones: 40,
};

describe("V21b family-seeded Pattern Master", () => {
  it("builds deterministic same-axis families", () => {
    const families = seeds.buildExactDimensionFamilies(lines);
    expect(families.length).toBeGreaterThan(0);
    expect(families[0].origin).toBe("family-base");
    expect(families[0].axis).toBe("base");
    expect(families[0].dimension).toBe(600);
    expect(families[0].typeIndexes).toEqual([0, 1]);
  });

  it("adds family provenance only when the V21b pool is enabled", () => {
    const legacy = patrones.generarPatrones(lines, config, 40);
    const v21 = patrones.generarPatrones(lines, { ...config, usarV21FamilyMaster: true }, 40);

    expect(legacy.some((pattern) => pattern._patternMeta?.origin?.startsWith("family-"))).toBe(false);
    expect(v21.some((pattern) => pattern._patternMeta?.origin?.startsWith("family-"))).toBe(true);
  });

  it("preserves board count on the smoke case while still running Master", () => {
    const legacy = v10.optimizarV10(lines, config);
    const result = v10.optimizarV10(lines, { ...config, usarV21FamilyMaster: true });

    expect(result.plan.resumen.placas).toBe(legacy.plan.resumen.placas);
    expect(legacy.metricas.master.activaciones).toBe(1);
    expect(result.metricas.master.activaciones).toBe(1);
  });
});

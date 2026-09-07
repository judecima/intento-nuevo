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
const patrones = require("../../src/lib/optimizer/legacy/patrones.cjs") as {
  generarPatrones(
    lines: Array<Record<string, unknown>>,
    config: Record<string, unknown>,
    rounds?: number,
  ): Array<{
    uso: Map<number, number>;
    _patternMeta?: { origin?: string; firstSeenRound?: number | null };
  }>;
  patronesMonotipo(
    lines: Array<Record<string, unknown>>,
    config: Record<string, unknown>,
  ): Array<{ _patternMeta?: unknown }>;
};

const smokeLines = [
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

const gold4058501 = [
  { ref: "1", base: 699.2, altura: 749.2, cant: 4, veta: false },
  { ref: "2", base: 699.6, altura: 740, cant: 10, veta: false },
  { ref: "3", base: 799.2, altura: 449.2, cant: 6, veta: false },
  { ref: "4", base: 849.2, altura: 199.2, cant: 2, veta: false },
  { ref: "5", base: 999.2, altura: 449.2, cant: 3, veta: false },
  { ref: "6", base: 999.2, altura: 499.2, cant: 4, veta: false },
  { ref: "7", base: 999.2, altura: 799.2, cant: 6, veta: false },
  { ref: "8", base: 1399.2, altura: 869.2, cant: 1, veta: false },
  { ref: "9", base: 1475.6, altura: 500, cant: 6, veta: false },
  { ref: "10", base: 1479.2, altura: 499.2, cant: 4, veta: false },
  { ref: "11", base: 1999.2, altura: 699.2, cant: 4, veta: false },
];

const goldConfig = {
  ...config,
  placaBase: 2600,
  placaAltura: 1830,
  sierra: 4.5,
};

describe("V21b direct-family Pattern Master", () => {
  it("wires the direct 4058501 vector into generarPatrones without random rounds", () => {
    const legacy = patrones.generarPatrones(gold4058501, goldConfig, 0);
    const directed = patrones.generarPatrones(
      gold4058501,
      { ...goldConfig, usarV21FamilyMaster: true },
      0,
    );

    expect(legacy).toHaveLength(0);
    const target = directed.find((pattern) =>
      pattern.uso.get(1) === 6 && pattern.uso.get(2) === 1 && pattern.uso.get(4) === 1
    );
    expect(target).toBeDefined();
    expect(target?._patternMeta?.origin).toBe("repetitive-family+filler");
  });

  it("keeps V21 metadata out of the legacy pool when the flag is disabled", () => {
    const legacy = patrones.generarPatrones(smokeLines, config, 1);
    expect(legacy.every((pattern) => pattern._patternMeta === undefined)).toBe(true);
  });

  it("preserves the exact legacy monotype object shape", () => {
    const monotypes = patrones.patronesMonotipo(smokeLines, config);
    expect(monotypes.length).toBeGreaterThan(0);
    expect(monotypes.every((pattern) => pattern._patternMeta === undefined)).toBe(true);
  });

  it("falls back to legacy behavior on a case with no repetitive-family basis", () => {
    const legacy = v10.optimizarV10(smokeLines, config);
    const result = v10.optimizarV10(smokeLines, { ...config, usarV21FamilyMaster: true });

    expect(result.plan.resumen.placas).toBe(legacy.plan.resumen.placas);
    expect(legacy.metricas.master.activaciones).toBe(1);
    expect(result.metricas.master.activaciones).toBe(1);
  });
});

import { createRequire } from "node:module";

import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const v10 = require("../../src/lib/optimizer/legacy/v10.cjs") as {
  optimizarV10(
    lines: Array<Record<string, unknown>>,
    config: Record<string, unknown>,
  ): {
    plan: { resumen: { placas: number } };
    cota: number;
    metricas: {
      compactacion: { activaciones: number };
      lowerBound: {
        cheapRuns: number;
        cheapCertified: number;
        cheapErrors: number;
        cheapViolation: number;
      };
    };
  };
};

const oldStaged = process.env.OPTIMIZER_V10_STAGED_EXPERIMENTAL;
const oldCheap = process.env.OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL;

afterEach(() => {
  restore("OPTIMIZER_V10_STAGED_EXPERIMENTAL", oldStaged);
  restore("OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL", oldCheap);
});

const lines = [
  { ref: "A", detalle: "A", cant: 1, base: 600, altura: 600, veta: false },
  { ref: "B", detalle: "B", cant: 1, base: 600, altura: 500, veta: false },
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
  usarMaster: false,
  usarMultiSlice: false,
  usarCompactacion: true,
};

describe("V20 isolated post-baseline cheap-LB env flag", () => {
  it("runs cheap LB with STAGED=0 and changes no other pipeline switch", () => {
    process.env.OPTIMIZER_V10_STAGED_EXPERIMENTAL = "0";
    process.env.OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL = "1";

    const result = v10.optimizarV10(lines, config);

    expect(result.plan.resumen.placas).toBe(2);
    expect(result.cota).toBe(2);
    expect(result.metricas.lowerBound.cheapRuns).toBe(1);
    expect(result.metricas.lowerBound.cheapCertified).toBe(1);
    expect(result.metricas.lowerBound.cheapErrors).toBe(0);
    expect(result.metricas.lowerBound.cheapViolation).toBe(0);
    expect(result.metricas.compactacion.activaciones).toBe(0);
  });

  it("keeps legacy behavior with both flags disabled", () => {
    process.env.OPTIMIZER_V10_STAGED_EXPERIMENTAL = "0";
    process.env.OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL = "0";

    const result = v10.optimizarV10(lines, config);

    expect(result.metricas.lowerBound.cheapRuns).toBe(0);
  });
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

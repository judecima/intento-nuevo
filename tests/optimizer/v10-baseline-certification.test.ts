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
    cotaArea?: number;
    metricas: {
      compactacion: { activaciones: number };
      lowerBound: {
        externalUsed: number;
        externalViolation: number;
        certifiedAfterBaseline: number;
        cheapRuns: number;
        cheapCertified: number;
        cheapViolation: number;
        cheapErrors: number;
        cheapMs: number;
        cheapValue: number;
        cheapReason: string | null;
      };
    };
  };
};

const staged = require("../../src/lib/optimizer/experimental/v10-hybrid-pipeline.cjs") as {
  runV10HybridPipeline(
    lines: Array<Record<string, unknown>>,
    config: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): {
    plan: { resumen: { placas: number } };
    cota: number;
    areaCota?: number;
    reason: string;
    metrics: {
      postBaselineCheapCertified: boolean;
      postBaselineCheapValue: number;
      multisliceMs: number;
      rounds20GenMs: number;
      fallbackGenMs: number;
    };
  };
};

const lines = [
  { ref: "A", detalle: "pieza angosta larga", cant: 1, base: 600, altura: 100, veta: false },
  { ref: "B", detalle: "pieza mas grande", cant: 1, base: 550, altura: 200, veta: false },
];

const config = {
  placaBase: 1200,
  placaAltura: 800,
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

const f1Lines = [
  { ref: "A", detalle: "cuadrado grande", cant: 1, base: 600, altura: 600, veta: false },
  { ref: "B", detalle: "rectangulo incompatible", cant: 1, base: 600, altura: 500, veta: false },
];

const f1Config = {
  ...config,
  placaBase: 1000,
  placaAltura: 1000,
};

describe("V10 certified baseline fast path", () => {
  it("keeps legacy compaction with the flag off", () => {
    const result = v10.optimizarV10(lines, config);

    expect(result.plan.resumen.placas).toBe(1);
    expect(result.cota).toBe(1);
    expect(result.metricas.compactacion.activaciones).toBe(1);
    expect(result.metricas.lowerBound.certifiedAfterBaseline).toBe(0);
    expect(result.metricas.lowerBound.cheapRuns).toBe(0);
  });

  it("skips compaction when baseline already equals a valid lower bound", () => {
    const result = v10.optimizarV10(lines, {
      ...config,
      certificarAntesCompactacion: true,
    });

    expect(result.plan.resumen.placas).toBe(1);
    expect(result.cota).toBe(1);
    expect(result.metricas.compactacion.activaciones).toBe(0);
    expect(result.metricas.lowerBound.certifiedAfterBaseline).toBe(1);
    expect(result.metricas.lowerBound.cheapRuns).toBe(0);
  });

  it("records and ignores an external lower bound above the physical incumbent", () => {
    const result = v10.optimizarV10(lines, {
      ...config,
      cotaInferiorExterna: 2,
    });

    expect(result.plan.resumen.placas).toBe(1);
    expect(result.cota).toBe(1);
    expect(result.metricas.lowerBound.externalUsed).toBe(0);
    expect(result.metricas.lowerBound.externalViolation).toBe(1);
  });

  it("certifies an F1 case with the cheap LB before any rescue stage", () => {
    const result = v10.optimizarV10(f1Lines, {
      ...f1Config,
      usarCotaBarataAntesCompactacion: true,
    });

    expect(result.cotaArea).toBe(1);
    expect(result.plan.resumen.placas).toBe(2);
    expect(result.cota).toBe(2);
    expect(result.metricas.lowerBound.cheapRuns).toBe(1);
    expect(result.metricas.lowerBound.cheapValue).toBe(2);
    expect(result.metricas.lowerBound.cheapCertified).toBe(1);
    expect(result.metricas.lowerBound.certifiedAfterBaseline).toBe(1);
    expect(result.metricas.lowerBound.cheapViolation).toBe(0);
    expect(result.metricas.lowerBound.cheapErrors).toBe(0);
    expect(result.metricas.lowerBound.cheapMs).toBeGreaterThanOrEqual(0);
    expect(result.metricas.compactacion.activaciones).toBe(0);
  });

  it("stops the staged pipeline immediately after cheap F1 certification", () => {
    const result = staged.runV10HybridPipeline(
      f1Lines,
      {
        ...f1Config,
        usarCotaBarataAntesCompactacion: true,
        usarMaster: true,
        usarMultiSlice: true,
      },
      {
        enableStrongLowerBound: false,
        enablePreMultisliceCertification: false,
        enableRepair: false,
        enableIncrementalMaster: false,
        masterMs: 10,
      },
    );

    expect(result.areaCota).toBe(1);
    expect(result.cota).toBe(2);
    expect(result.plan.resumen.placas).toBe(2);
    expect(result.reason).toBe("cheap-lower-bound-certified-post-baseline");
    expect(result.metrics.postBaselineCheapCertified).toBe(true);
    expect(result.metrics.postBaselineCheapValue).toBe(2);
    expect(result.metrics.multisliceMs).toBe(0);
    expect(result.metrics.rounds20GenMs).toBe(0);
    expect(result.metrics.fallbackGenMs).toBe(0);
  });
});

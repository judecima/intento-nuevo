import { createRequire } from "node:module";

import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const v10 = require("../../src/lib/optimizer/legacy/v10.cjs");
const motor = require("../../src/lib/optimizer/legacy/motor.cjs");

const oldPostCompact = process.env.OPTIMIZER_POST_COMPACT_CHEAP_LB_EXPERIMENTAL;
const oldPostBaseline = process.env.OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL;
const oldStaged = process.env.OPTIMIZER_V10_STAGED_EXPERIMENTAL;

afterEach(() => {
  restore("OPTIMIZER_POST_COMPACT_CHEAP_LB_EXPERIMENTAL", oldPostCompact);
  restore("OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL", oldPostBaseline);
  restore("OPTIMIZER_V10_STAGED_EXPERIMENTAL", oldStaged);
});

const certifiedLines = [
  { ref: "A", detalle: "A", cant: 1, base: 600, altura: 600, veta: false },
  { ref: "B", detalle: "B", cant: 1, base: 600, altura: 500, veta: false },
];
const certifiedConfig = {
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
  usarOneBoard: true,
  usarMaster: true,
  usarMultiSlice: true,
  usarCompactacion: true,
};

const remnantLines = [
  { ref: "1", detalle: "1", cant: 3, base: 2304, altura: 1037, veta: false, cantos: { arr: false, aba: false, izq: false, der: false } },
  { ref: "2", detalle: "2", cant: 5, base: 1023, altura: 199, veta: false, cantos: { arr: false, aba: false, izq: false, der: false } },
  { ref: "3", detalle: "3", cant: 1, base: 2352, altura: 649.5, veta: false, cantos: { arr: false, aba: false, izq: false, der: false } },
  { ref: "4", detalle: "4", cant: 1, base: 2352, altura: 79.5, veta: false, cantos: { arr: false, aba: false, izq: false, der: false } },
  { ref: "5", detalle: "5", cant: 1, base: 2750, altura: 79.5, veta: false, cantos: { arr: false, aba: false, izq: false, der: false } },
];
const remnantConfig = {
  placaBase: 2750,
  placaAltura: 1850,
  refiladoX: 0,
  refiladoY: 0,
  sierra: 5,
  etapas: 4,
  materialConVeta: false,
  descontarCanto: false,
  cantoEspesor: 0,
  restoMin: 250,
  restoMax: 400,
  usarCache: true,
  maxPiezasCache: 160,
};

function quality(plan: any) {
  const q = motor.calidadPlanPlacas(plan.placas ?? [], plan.opts ?? {});
  return {
    mayor: q.mayor,
    segundo: q.segundo,
    fragmentos: q.fragmentos,
    total: q.total,
  };
}

describe("post-compact cheap lower bound", () => {
  it("is fully disabled by default", () => {
    process.env.OPTIMIZER_POST_COMPACT_CHEAP_LB_EXPERIMENTAL = "0";
    process.env.OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL = "0";
    process.env.OPTIMIZER_V10_STAGED_EXPERIMENTAL = "0";

    const result = v10.optimizarV10(
      certifiedLines,
      { ...certifiedConfig, usarMaster: false, usarMultiSlice: false, usarOneBoard: false },
      v10.nuevasMetricas(),
    );

    expect(result.metricas.lowerBound.postCompactRuns).toBe(0);
    expect(result.metricas.lowerBound.postCompactCertified).toBe(0);
  });

  it("certifies after compactation and skips later board rescues", () => {
    process.env.OPTIMIZER_POST_COMPACT_CHEAP_LB_EXPERIMENTAL = "1";
    process.env.OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL = "0";
    process.env.OPTIMIZER_V10_STAGED_EXPERIMENTAL = "0";

    const result = v10.optimizarV10(certifiedLines, certifiedConfig, v10.nuevasMetricas());

    expect(result.plan.resumen.placas).toBe(2);
    expect(result.metricas.lowerBound.postCompactRuns).toBe(1);
    expect(result.metricas.lowerBound.postCompactCertified).toBe(1);
    expect(result.metricas.lowerBound.certifiedAfterCompactation).toBe(1);
    expect(result.metricas.lowerBound.postCompactViolation).toBe(0);
    expect(result.metricas.lowerBound.postCompactErrors).toBe(0);
    expect(result.metricas.multislice.activaciones).toBe(0);
    expect(result.metricas.oneboard.activaciones).toBe(0);
    expect(result.metricas.master.activaciones).toBe(0);
  });

  it("preserves an accepted equal-board remnant improvement before pruning", () => {
    process.env.OPTIMIZER_POST_COMPACT_CHEAP_LB_EXPERIMENTAL = "1";
    process.env.OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL = "0";
    process.env.OPTIMIZER_V10_STAGED_EXPERIMENTAL = "0";

    const baseline = motor.optimizar(remnantLines, { ...remnantConfig, multiVariantes: false });
    const result = v10.optimizarV10(remnantLines, remnantConfig, v10.nuevasMetricas());

    expect(baseline.resumen.placas).toBe(3);
    expect(result.plan.resumen.placas).toBe(3);
    expect(result.metricas.compactacion.activaciones).toBe(1);
    expect(result.metricas.compactacion.ganancias).toBe(1);
    expect(result.metricas.lowerBound.postCompactCertified).toBe(1);
    expect(result.metricas.multislice.activaciones).toBe(0);
    expect(result.metricas.oneboard.activaciones).toBe(0);
    expect(result.metricas.master.activaciones).toBe(0);

    const before = quality(baseline);
    const after = quality(result.plan);
    expect(after).toEqual({
      mayor: 2222000,
      segundo: 1045254,
      fragmentos: 4,
      total: 4451621,
    });
    expect(after.segundo).toBeGreaterThan(before.segundo);
    expect(after.fragmentos).toBeLessThan(before.fragmentos);
  });
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

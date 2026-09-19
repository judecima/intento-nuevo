import { createRequire } from "node:module";

import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const claude = require("../../src/lib/optimizer/experimental/claude-lower-bounds.cjs");
const v10 = require("../../src/lib/optimizer/legacy/v10.cjs");

const oldFs0 = process.env.OPTIMIZER_DFF_FS0_LB_EXPERIMENTAL;

afterEach(() => {
  if (oldFs0 === undefined) delete process.env.OPTIMIZER_DFF_FS0_LB_EXPERIMENTAL;
  else process.env.OPTIMIZER_DFF_FS0_LB_EXPERIMENTAL = oldFs0;
});

const lines = [
  {
    ref: "1",
    detalle: "1",
    cant: 130,
    base: 460,
    altura: 995,
    veta: true,
    cantos: null,
  },
];

const config = {
  placaBase: 2435,
  placaAltura: 1215,
  refiladoX: 0,
  refiladoY: 0,
  sierra: 4.5,
  etapas: 4,
  materialConVeta: true,
  descontarCanto: false,
  cantoEspesor: 0,
  restoMin: 250,
  restoMax: 400,
  usarCache: true,
  maxPiezasCache: 160,
};

describe("Fekete-Schepers u^k lower bound", () => {
  it("is opt-in and raises the known repeated-type certificate from 25 to 26", () => {
    const legacy = claude.computeLowerBound(lines, config, {
      usarRaster: false,
      usarDffFs0: false,
    });
    const fs0 = claude.computeLowerBound(lines, config, {
      usarRaster: false,
      usarDffFs0: true,
      maxKFs0: 20,
    });

    expect(legacy.best).toBe(25);
    expect(fs0.dffFs0).toBe(26);
    expect(fs0.best).toBe(26);
    expect(fs0.binding).toBe("dff-fs0");
  });

  it("wires the opt-in bound only into the post-compact certificate", () => {
    process.env.OPTIMIZER_DFF_FS0_LB_EXPERIMENTAL = "1";

    const result = v10.optimizarV10(
      lines,
      {
        ...config,
        usarCotaBarataPostCompactacion: true,
        usarCompactacion: false,
        usarMultiSlice: false,
        usarOneBoard: false,
        usarMaster: false,
      },
      v10.nuevasMetricas(),
    );

    expect(result.plan.resumen.placas).toBe(26);
    expect(result.cota).toBe(26);
    expect(result.metricas.lowerBound.postCompactRuns).toBe(1);
    expect(result.metricas.lowerBound.postCompactCertified).toBe(1);
    expect(result.metricas.lowerBound.postCompactViolation).toBe(0);
    expect(result.metricas.lowerBound.postCompactErrors).toBe(0);
  });
});

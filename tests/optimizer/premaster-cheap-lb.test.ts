import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  optimizarV10,
  nuevasMetricas,
  validarPlanIndustrial,
} = require("../../src/lib/optimizer/legacy/v10.cjs");

const LINES = [
  {
    ref: "1",
    detalle: "1",
    cant: 2,
    base: 1327,
    altura: 1098,
    veta: false,
    cantos: null,
  },
];

const BASE_CONFIG = {
  placaBase: 2440,
  placaAltura: 1220,
  refiladoX: 0,
  refiladoY: 0,
  sierra: 4.4,
  etapas: 4,
  materialConVeta: false,
  descontarCanto: false,
  cantoEspesor: 0,
  restoMin: 250,
  restoMax: 400,
  usarCache: true,
  maxPiezasCache: 160,
  usarCompactacion: false,
  usarMultiSlice: false,
  usarOneBoard: false,
  usarMaster: true,
  rondasPatrones: 4,
  msMaster: 1000,
};

describe("pre-Master cheap lower bound", () => {
  it("certifies the incumbent and skips Pattern Master without changing the physical plan", () => {
    const control = optimizarV10(
      LINES,
      { ...BASE_CONFIG, usarCotaBarataAntesMaster: false },
      nuevasMetricas(),
    );
    const candidate = optimizarV10(
      LINES,
      { ...BASE_CONFIG, usarCotaBarataAntesMaster: true },
      nuevasMetricas(),
    );

    expect(control.plan.resumen.placas).toBe(2);
    expect(candidate.plan.resumen.placas).toBe(2);
    expect(validarPlanIndustrial(candidate.plan, 2).ok).toBe(true);

    expect(candidate.metricas.lowerBound.preMasterRuns).toBe(1);
    expect(candidate.metricas.lowerBound.preMasterCertified).toBe(1);
    expect(candidate.metricas.lowerBound.preMasterValue).toBe(2);
    expect(candidate.metricas.lowerBound.preMasterViolation).toBe(0);
    expect(candidate.metricas.master.activaciones).toBe(0);

    expect(JSON.parse(JSON.stringify(candidate.plan.placas))).toEqual(
      JSON.parse(JSON.stringify(control.plan.placas)),
    );
  });
});

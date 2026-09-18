import { createRequire } from "node:module";

import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const motor = require("../../src/lib/optimizer/legacy/motor.cjs");
const { rescatarUnaPlaca } = require("../../src/lib/optimizer/legacy/oneboard.cjs");
const { validarPlanIndustrial } = require("../../src/lib/optimizer/legacy/validador_industrial_v3.cjs");

const LINES = [
  { ref: "15", detalle: "15", cant: 2, base: 750, altura: 70, veta: false, cantos: null },
  { ref: "13", detalle: "13", cant: 4, base: 760, altura: 70, veta: false, cantos: null },
  { ref: "14", detalle: "14", cant: 2, base: 214, altura: 70, veta: false, cantos: null },
  { ref: "12", detalle: "12", cant: 4, base: 760, altura: 70, veta: false, cantos: null },
  { ref: "17", detalle: "17", cant: 2, base: 900, altura: 70, veta: false, cantos: null },
  { ref: "8", detalle: "8", cant: 2, base: 839, altura: 100, veta: false, cantos: null },
  { ref: "4", detalle: "4", cant: 1, base: 453, altura: 330, veta: false, cantos: null },
  { ref: "16", detalle: "16", cant: 2, base: 214, altura: 100, veta: false, cantos: null },
  { ref: "20", detalle: "20", cant: 1, base: 364, altura: 90, veta: false, cantos: null },
  { ref: "19", detalle: "19", cant: 1, base: 354, altura: 255, veta: false, cantos: null },
  { ref: "18", detalle: "18", cant: 4, base: 950, altura: 100, veta: false, cantos: null },
  { ref: "7", detalle: "7", cant: 1, base: 864, altura: 453, veta: false, cantos: null },
  { ref: "5", detalle: "5", cant: 1, base: 864, altura: 150, veta: false, cantos: null },
  { ref: "6", detalle: "6", cant: 1, base: 860, altura: 150, veta: false, cantos: null },
  { ref: "3", detalle: "3", cant: 1, base: 775, altura: 300, veta: false, cantos: null },
  { ref: "10", detalle: "10", cant: 1, base: 800, altura: 300, veta: false, cantos: null },
  { ref: "9", detalle: "9", cant: 1, base: 802, altura: 360, veta: false, cantos: null },
  { ref: "1", detalle: "1", cant: 2, base: 770, altura: 490, veta: false, cantos: null },
  { ref: "2", detalle: "2", cant: 1, base: 770, altura: 485, veta: false, cantos: null },
  { ref: "11", detalle: "11", cant: 1, base: 750, altura: 250, veta: false, cantos: null },
];

const CONFIG = {
  placaBase: 2600,
  placaAltura: 1830,
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
};

const originalOptimizar = motor.optimizar;

afterEach(() => {
  motor.optimizar = originalOptimizar;
});

describe("OneBoard baseline reuse", () => {
  it("does not recompute the baseline when an equivalent plan is supplied", () => {
    const baseline = originalOptimizar(LINES, { ...CONFIG, multiVariantes: false });
    expect(baseline.resumen.placas).toBeGreaterThan(1);

    motor.optimizar = () => {
      throw new Error("unexpected baseline recomputation");
    };

    const result = rescatarUnaPlaca(
      LINES,
      { ...CONFIG, maxIntentosRescate: 1 },
      baseline,
    );

    expect(result.baseline).toBe(baseline);
    expect(result.activado).toBe(true);
    expect(result.intentos).toBe(1);
  });

  it("preserves the historical OneBoard result and industrial validity", () => {
    const config = { ...CONFIG, maxIntentosRescate: 384 };
    const baseline = originalOptimizar(LINES, { ...CONFIG, multiVariantes: false });
    const historical = rescatarUnaPlaca(LINES, config);
    const reused = rescatarUnaPlaca(LINES, config, baseline);
    const expectedPieces = LINES.reduce((sum, line) => sum + line.cant, 0);

    expect(reused.exito).toBe(historical.exito);
    expect(reused.intentos).toBe(historical.intentos);
    expect(reused.restante).toBe(historical.restante);
    expect(JSON.parse(JSON.stringify(reused.plan.placas))).toEqual(
      JSON.parse(JSON.stringify(historical.plan.placas)),
    );
    expect(validarPlanIndustrial(historical.plan, expectedPieces).ok).toBe(true);
    expect(validarPlanIndustrial(reused.plan, expectedPieces).ok).toBe(true);
  });
});

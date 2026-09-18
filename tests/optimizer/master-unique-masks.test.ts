import { createRequire } from "node:module";

import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { generarPatrones, patronesMonotipo } = require("../../src/lib/optimizer/legacy/patrones.cjs");
const { resolverCobertura } = require("../../src/lib/optimizer/legacy/cobertura.cjs");
const { materializar } = require("../../src/lib/optimizer/legacy/materializar.cjs");
const { validarPlanIndustrial } = require("../../src/lib/optimizer/legacy/validador_industrial_v3.cjs");
const { calidadPlanPlacas } = require("../../src/lib/optimizer/legacy/motor.cjs");

const oldUnique = process.env.OPTIMIZER_MASTER_UNIQUE_MASKS_LE4_EXPERIMENTAL;
const oldStrict = process.env.OPTIMIZER_RUST_LEGACY_STRICT;

afterEach(() => {
  restore("OPTIMIZER_MASTER_UNIQUE_MASKS_LE4_EXPERIMENTAL", oldUnique);
  restore("OPTIMIZER_RUST_LEGACY_STRICT", oldStrict);
});

const CONFIG_4056900 = {
  placaBase: 2740,
  placaAltura: 1820,
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
const LINES_4056900 = [
  // Exact current canonical XML order: 1, 2, 4, 3. Masks are position-indexed.
  { ref: "1", detalle: "1", cant: 16, base: 2000, altura: 350, veta: false, cantos: null },
  { ref: "2", detalle: "2", cant: 24, base: 964, altura: 350, veta: false, cantos: null },
  { ref: "4", detalle: "4", cant: 24, base: 564, altura: 350, veta: false, cantos: null },
  { ref: "3", detalle: "3", cant: 30, base: 378, altura: 350, veta: false, cantos: null },
];

const CONFIG_4057401 = {
  placaBase: 2742,
  placaAltura: 1822,
  refiladoX: 0,
  refiladoY: 0,
  sierra: 4.5,
  etapas: 4,
  materialConVeta: false,
  descontarCanto: false,
  cantoEspesor: 0,
  restoMin: 250,
  restoMax: 400,
  usarCache: true,
  maxPiezasCache: 160,
};
const LINES_4057401 = [
  { ref: "1", detalle: "1", cant: 2, base: 1800, altura: 1050, veta: false, cantos: null },
  { ref: "3", detalle: "3", cant: 2, base: 2000, altura: 1100, veta: false, cantos: null },
  { ref: "2", detalle: "2", cant: 1, base: 1900, altura: 1500, veta: false, cantos: null },
  { ref: "4", detalle: "4", cant: 14, base: 744, altura: 450, veta: false, cantos: null },
];

function runMaster(lines: any[], config: Record<string, unknown>, incumbent: number) {
  const options = {
    ...config,
    usarRustPatternGenerator: true,
    usarMascarasUnicasMasterLe4: true,
  };

  process.env.OPTIMIZER_RUST_LEGACY_STRICT = "1";

  const generated = generarPatrones(lines, options, 40, 7);
  const monotypes = patronesMonotipo(lines, options);
  const pool = generated.concat(monotypes);
  const area =
    (Number(config.placaBase) - Number(config.refiladoX ?? 0)) *
    (Number(config.placaAltura) - Number(config.refiladoY ?? 0));
  const solver = resolverCobertura(
    pool,
    lines.map((line) => Number(line.cant)),
    area,
    incumbent,
    8_000,
  );
  const solved = solver?.resolver(lines.map((line) => Number(line.base) * Number(line.altura)));
  const plan = solved?.plan ? materializar(solved.plan, lines, options) : null;
  const expectedPieces = lines.reduce((sum, line) => sum + Number(line.cant), 0);
  const validation = plan ? validarPlanIndustrial(plan, expectedPieces) : null;
  const quality = plan ? calidadPlanPlacas(plan.placas, options) : null;

  return {
    options,
    generated,
    solved,
    plan,
    validation,
    quality,
  };
}

describe("Master unique-mask <=4 policy", () => {
  it("stays disabled unless the experimental flag or option is enabled", () => {
    process.env.OPTIMIZER_MASTER_UNIQUE_MASKS_LE4_EXPERIMENTAL = "0";
    const options = { ...CONFIG_4057401, usarRustPatternGenerator: false };
    generarPatrones(LINES_4057401, options, 1, 7);
    expect(options._patternMaskPolicy).toBeUndefined();
  });

  it("deduplicates the 40-round four-type schedule to 15 first-occurrence masks in JS", () => {
    const options = {
      ...CONFIG_4057401,
      usarRustPatternGenerator: false,
      usarMascarasUnicasMasterLe4: true,
    };
    generarPatrones(LINES_4057401, options, 40, 7);
    expect(options._patternMaskPolicy).toMatchObject({
      policy: "first-unique-mask-le4",
      typeCount: 4,
      totalRounds: 40,
      executedRounds: 15,
    });
    expect(options._patternMaskPolicy.skippedDuplicateRounds).toBeGreaterThan(0);
  });

  it("preserves the 4056900 Rust Master winner and remnant quality", () => {
    const result = runMaster(LINES_4056900, CONFIG_4056900, 7);

    expect(result.options._rustPatternGeneratorUsed).toBe("rust");
    expect(result.options._rustPatternGeneratorFallback).not.toBe(true);
    expect(result.options._patternMaskPolicy).toMatchObject({
      policy: "first-unique-mask-le4",
      typeCount: 4,
      totalRounds: 40,
      executedRounds: 15,
    });
    expect(result.solved?.placas).toBe(6);
    expect(result.validation?.ok).toBe(true);
    expect({
      mayor: result.quality?.mayor,
      segundo: result.quality?.segundo,
      fragmentos: result.quality?.fragmentos,
      total: result.quality?.total,
    }).toEqual({
      mayor: 0,
      segundo: 0,
      fragmentos: 0,
      total: 0,
    });
  });

  it("preserves the 4057401 Rust Master winner and exact remnant quality", () => {
    const result = runMaster(LINES_4057401, CONFIG_4057401, 5);

    expect(result.options._rustPatternGeneratorUsed).toBe("rust");
    expect(result.options._rustPatternGeneratorFallback).not.toBe(true);
    expect(result.options._patternMaskPolicy).toMatchObject({
      policy: "first-unique-mask-le4",
      typeCount: 4,
      totalRounds: 40,
      executedRounds: 15,
    });
    expect(result.solved?.placas).toBe(4);
    expect(result.validation?.ok).toBe(true);
    expect({
      mayor: result.quality?.mayor,
      segundo: result.quality?.segundo,
      fragmentos: result.quality?.fragmentos,
      total: result.quality?.total,
    }).toEqual({
      mayor: 721146,
      segundo: 721146,
      fragmentos: 10,
      total: 3577592,
    });
  });
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

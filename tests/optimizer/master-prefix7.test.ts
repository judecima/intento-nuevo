import { createRequire } from "node:module";

import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const v10 = require("../../src/lib/optimizer/legacy/v10.cjs");
const motor = require("../../src/lib/optimizer/legacy/motor.cjs");
const patterns = require("../../src/lib/optimizer/legacy/patrones.cjs");

const oldPrefix = process.env.OPTIMIZER_MASTER_PREFIX7_EXPERIMENTAL;
const oldUnique = process.env.OPTIMIZER_MASTER_UNIQUE_MASKS_LE4_EXPERIMENTAL;
const oldStrict = process.env.OPTIMIZER_RUST_LEGACY_STRICT;

afterEach(() => {
  restore("OPTIMIZER_MASTER_PREFIX7_EXPERIMENTAL", oldPrefix);
  restore("OPTIMIZER_MASTER_UNIQUE_MASKS_LE4_EXPERIMENTAL", oldUnique);
  restore("OPTIMIZER_RUST_LEGACY_STRICT", oldStrict);
});

const BASE_CONFIG = {
  refiladoX: 0,
  refiladoY: 0,
  etapas: 4,
  materialConVeta: false,
  descontarCanto: false,
  cantoEspesor: 0,
  restoMin: 250,
  restoMax: 400,
  usarCache: true,
  maxPiezasCache: 160,
  usarRustPatternGenerator: true,
  usarMasterPrefijo7Experimental: true,
  rondasPatrones: 40,
};

const CASE_4050594 = {
  lines: [
    { ref: "6", detalle: "6", cant: 20, base: 450, altura: 149.6, veta: false, cantos: null },
    { ref: "7", detalle: "7", cant: 20, base: 515, altura: 149.6, veta: false, cantos: null },
    { ref: "1", detalle: "1", cant: 6, base: 500, altura: 189.6, veta: false, cantos: null },
    { ref: "3", detalle: "3", cant: 10, base: 597.2, altura: 199.2, veta: false, cantos: null },
    { ref: "11", detalle: "11", cant: 4, base: 419.2, altura: 296.2, veta: false, cantos: null },
    { ref: "9", detalle: "9", cant: 4, base: 779.2, altura: 296.2, veta: false, cantos: null },
    { ref: "12", detalle: "12", cant: 4, base: 572.2, altura: 419.2, veta: false, cantos: null },
    { ref: "8", detalle: "8", cant: 10, base: 515, altura: 430, veta: false, cantos: null },
    { ref: "4", detalle: "4", cant: 4, base: 567.2, altura: 484.2, veta: false, cantos: null },
    { ref: "2", detalle: "2", cant: 8, base: 570, altura: 484.6, veta: false, cantos: null },
    { ref: "10", detalle: "10", cant: 1, base: 2430, altura: 499.6, veta: false, cantos: null },
    { ref: "14", detalle: "14", cant: 2, base: 1700, altura: 499.6, veta: false, cantos: null },
    { ref: "5", detalle: "5", cant: 2, base: 1870, altura: 570, veta: false, cantos: null },
    { ref: "13", detalle: "13", cant: 8, base: 2430, altura: 99.6, veta: false, cantos: null },
  ],
  config: { ...BASE_CONFIG, placaBase: 2440, placaAltura: 1220, sierra: 4.4 },
  expectedBoards: 7,
};

const CASE_4056900 = {
  lines: [
    { ref: "1", detalle: "1", cant: 16, base: 2000, altura: 350, veta: false, cantos: null },
    { ref: "2", detalle: "2", cant: 24, base: 964, altura: 350, veta: false, cantos: null },
    { ref: "4", detalle: "4", cant: 24, base: 564, altura: 350, veta: false, cantos: null },
    { ref: "3", detalle: "3", cant: 30, base: 378, altura: 350, veta: false, cantos: null },
  ],
  config: { ...BASE_CONFIG, placaBase: 2740, placaAltura: 1820, sierra: 4.4 },
  expectedBoards: 6,
};

const CASE_4057401 = {
  lines: [
    { ref: "1", detalle: "1", cant: 2, base: 1800, altura: 1050, veta: false, cantos: null },
    { ref: "3", detalle: "3", cant: 2, base: 2000, altura: 1100, veta: false, cantos: null },
    { ref: "2", detalle: "2", cant: 1, base: 1900, altura: 1500, veta: false, cantos: null },
    { ref: "4", detalle: "4", cant: 14, base: 744, altura: 450, veta: false, cantos: null },
  ],
  config: { ...BASE_CONFIG, placaBase: 2742, placaAltura: 1822, sierra: 4.5 },
  expectedBoards: 4,
};

const CASE_4047508 = {
  lines: [
    { ref: "1", detalle: "B", cant: 1, base: 880, altura: 649.6, veta: false, cantos: { arr: true, aba: false, izq: false, der: false } },
    { ref: "4", detalle: "B1", cant: 1, base: 1725, altura: 649.6, veta: false, cantos: { arr: true, aba: false, izq: false, der: false } },
    { ref: "3", detalle: "VBM", cant: 9, base: 782, altura: 649.6, veta: false, cantos: { arr: true, aba: false, izq: false, der: false } },
    { ref: "2", detalle: "VH", cant: 2, base: 2220, altura: 649.6, veta: false, cantos: { arr: true, aba: false, izq: false, der: false } },
    { ref: "8", detalle: "8", cant: 1, base: 600, altura: 599.6, veta: false, cantos: { arr: true, aba: false, izq: false, der: false } },
    { ref: "5", detalle: "5", cant: 1, base: 560, altura: 649.6, veta: false, cantos: { arr: true, aba: false, izq: false, der: false } },
    { ref: "6", detalle: "6", cant: 1, base: 600, altura: 649.6, veta: false, cantos: { arr: true, aba: false, izq: false, der: false } },
    { ref: "7", detalle: "7", cant: 1, base: 665, altura: 649.6, veta: false, cantos: { arr: true, aba: false, izq: false, der: false } },
    { ref: "9", detalle: "9", cant: 1, base: 1610, altura: 649.6, veta: false, cantos: { arr: true, aba: false, izq: false, der: false } },
  ],
  config: { ...BASE_CONFIG, placaBase: 2600, placaAltura: 1830, sierra: 4.5 },
};

function quality(plan: any, config: any) {
  const q = motor.calidadPlanPlacas(plan.placas ?? [], config);
  return { mayor: q.mayor, segundo: q.segundo, fragmentos: q.fragmentos, total: q.total };
}

function patternDigest(pool: any[]) {
  return pool.map((pattern) => ({
    usage: [...pattern.uso.entries()].sort((a, b) => Number(a[0]) - Number(b[0])),
    area: pattern.area,
    placements: (pattern.placa?.colocadas ?? []).map((placement: any) => [
      placement?.pieza?.ref,
      placement.base,
      placement.altura,
    ]),
  }));
}

describe("incremental Pattern Master prefix7", () => {
  it.each([
    ["4050594", CASE_4050594, { mayor: 0, segundo: 0, fragmentos: 0, total: 0 }],
    ["4056900", CASE_4056900, { mayor: 0, segundo: 0, fragmentos: 0, total: 0 }],
    ["4057401", CASE_4057401, { mayor: 721146, segundo: 721146, fragmentos: 10, total: 3577592 }],
  ])("certifies %s at the board lower bound from rounds 0..6", (_id, fixture, expectedQuality) => {
    process.env.OPTIMIZER_RUST_LEGACY_STRICT = "1";
    process.env.OPTIMIZER_MASTER_UNIQUE_MASKS_LE4_EXPERIMENTAL = "0";

    const result = v10.optimizarV10(
      fixture.lines,
      fixture.config,
      v10.nuevasMetricas(),
    );

    expect(result.plan.resumen.placas).toBe(fixture.expectedBoards);
    expect(result.metricas.masterPrefix.runs).toBe(1);
    expect(result.metricas.masterPrefix.certified).toBe(1);
    expect(result.metricas.masterPrefix.fallthrough).toBe(0);
    expect(result.metricas.masterPrefix.errors).toBe(0);
    expect(result.metricas.masterPrefix.nodes).toBeLessThanOrEqual(5000);
    expect(result.metricas.master.ganancias).toBe(1);
    expect(quality(result.plan, fixture.config)).toEqual(expectedQuality);
  });

  it("reconstructs the exact 40-round Rust pool from prefix7 + remaining33", () => {
    process.env.OPTIMIZER_RUST_LEGACY_STRICT = "1";
    process.env.OPTIMIZER_MASTER_UNIQUE_MASKS_LE4_EXPERIMENTAL = "0";

    const config = { ...CASE_4047508.config };
    const direct = patterns.generarPatrones(CASE_4047508.lines, config, 40, 7);
    const prefix = patterns.generarPatronesRondasRust(
      CASE_4047508.lines,
      { ...CASE_4047508.config },
      [0, 1, 2, 3, 4, 5, 6],
      40,
      7,
    );
    const rest = patterns.generarPatronesRondasRust(
      CASE_4047508.lines,
      { ...CASE_4047508.config },
      Array.from({ length: 33 }, (_, index) => index + 7),
      40,
      7,
    );
    const staged = patterns.combinarPatrones(prefix, rest);

    expect(patternDigest(staged)).toEqual(patternDigest(direct));
  });

  it("falls through to an identical physical plan when prefix7 cannot certify LB", () => {
    process.env.OPTIMIZER_RUST_LEGACY_STRICT = "1";
    process.env.OPTIMIZER_MASTER_UNIQUE_MASKS_LE4_EXPERIMENTAL = "0";

    const control = v10.optimizarV10(
      CASE_4047508.lines,
      { ...CASE_4047508.config, usarMasterPrefijo7Experimental: false },
      v10.nuevasMetricas(),
    );
    const staged = v10.optimizarV10(
      CASE_4047508.lines,
      { ...CASE_4047508.config, usarMasterPrefijo7Experimental: true },
      v10.nuevasMetricas(),
    );

    expect(staged.metricas.masterPrefix.runs).toBe(1);
    expect(staged.metricas.masterPrefix.certified).toBe(0);
    expect(staged.metricas.masterPrefix.fallthrough).toBe(1);
    expect(staged.metricas.masterPrefix.errors).toBe(0);
    expect(staged.plan.resumen.placas).toBe(control.plan.resumen.placas);
    expect(staged.plan.placas).toEqual(control.plan.placas);
    expect(quality(staged.plan, CASE_4047508.config)).toEqual(
      quality(control.plan, CASE_4047508.config),
    );
  });

  it("stays fully disabled by default", () => {
    delete process.env.OPTIMIZER_MASTER_PREFIX7_EXPERIMENTAL;
    const result = v10.optimizarV10(
      CASE_4047508.lines,
      { ...CASE_4047508.config, usarMasterPrefijo7Experimental: false },
      v10.nuevasMetricas(),
    );
    expect(result.metricas.masterPrefix.runs).toBe(0);
  });
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

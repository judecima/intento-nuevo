import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  generarPatrones,
  generarPatronesJs,
} = require("../../src/lib/optimizer/legacy/patrones.cjs");

const CONFIG = {
  placaBase: 2600,
  placaAltura: 1830,
  refiladoX: 0,
  refiladoY: 0,
  sierra: 4.5,
  etapas: 4,
  materialConVeta: false,
  descontarCanto: false,
  cantoEspesor: 0,
  ruido: 0.3,
  pases: 2,
  restartsPorPlaca: 4,
  restoMin: 250,
  restoMax: 400,
  tolerancia: 0.02,
  beamWidth: 4,
  maxPiezasBeam: 120,
  presupuestoBeamMs: 1500,
  semilla: 20260812,
  preferirMenorProfundidad: true,
  usarRescue: true,
  maxPiezasRescue: 30,
  presupuestoRescueMs: 300,
  multiRebanada: false,
  multiVariantes: false,
  trazaDiag: false,
};

const LINES = [
  { ref: "A", detalle: "A", cant: 3, base: 900, altura: 600, veta: false },
  { ref: "B", detalle: "B", cant: 4, base: 600, altura: 400, veta: false },
  { ref: "C", detalle: "C", cant: 4, base: 500, altura: 300, veta: false },
  { ref: "D", detalle: "D", cant: 2, base: 1200, altura: 70, veta: false },
];

function normalize(pool: any[]) {
  return pool
    .map((pattern) => ({
      usage: [...pattern.uso.entries()].sort((a: any, b: any) => a[0] - b[0]),
      area: pattern.area,
      placements: pattern.placa.colocadas
        .map((placement: any) => ({
          ref: placement.pieza.ref,
          x: placement.x,
          y: placement.y,
          base: placement.base,
          altura: placement.altura,
          rotada: Boolean(placement.rotada),
          nivel: placement.nivel,
        }))
        .sort((a: any, b: any) =>
          String(a.ref).localeCompare(String(b.ref)) ||
          a.x - b.x ||
          a.y - b.y ||
          a.base - b.base ||
          a.altura - b.altura
        ),
    }))
    .sort((a, b) => JSON.stringify(a.usage).localeCompare(JSON.stringify(b.usage)));
}

afterEach(() => {
  delete process.env.OPTIMIZER_RUST_LEGACY_FORCE_FALLBACK;
  delete process.env.OPTIMIZER_RUST_LEGACY_STRICT;
});

describe("production Rust Pattern Master routing", () => {
  it("keeps JS as the default path", () => {
    const options: any = { ...CONFIG };
    expect(normalize(generarPatrones(LINES, options, 6, 7))).toEqual(
      normalize(generarPatronesJs(LINES, options, 6, 7)),
    );
    expect(options._rustPatternGeneratorUsed).toBeUndefined();
  });

  it("routes explicitly to the native Rust generator", () => {
    const options: any = { ...CONFIG, usarRustPatternGenerator: true };
    const rust = generarPatrones(LINES, options, 6, 7);
    const legacy = generarPatronesJs(LINES, { ...CONFIG }, 6, 7);

    expect(normalize(rust)).toEqual(normalize(legacy));
    expect(options._rustPatternGeneratorUsed).toBe("rust");
    expect(options._rustPatternGeneratorFallback).not.toBe(true);
  });

  it("falls back to JS without changing the pool when Rust is unavailable", () => {
    process.env.OPTIMIZER_RUST_LEGACY_FORCE_FALLBACK = "1";
    const options: any = { ...CONFIG, usarRustPatternGenerator: true };
    const result = generarPatrones(LINES, options, 6, 7);
    const legacy = generarPatronesJs(LINES, { ...CONFIG }, 6, 7);

    expect(normalize(result)).toEqual(normalize(legacy));
    expect(options._rustPatternGeneratorFallback).toBe(true);
    expect(options._rustPatternGeneratorError).toContain("FORCED_FALLBACK");
  });

  it("surfaces native failures in strict diagnostic mode", () => {
    process.env.OPTIMIZER_RUST_LEGACY_FORCE_FALLBACK = "1";
    process.env.OPTIMIZER_RUST_LEGACY_STRICT = "1";
    const options: any = { ...CONFIG, usarRustPatternGenerator: true };

    expect(() => generarPatrones(LINES, options, 6, 7)).toThrow(
      "OPTIMIZER_RUST_LEGACY_FORCED_FALLBACK",
    );
  });
});

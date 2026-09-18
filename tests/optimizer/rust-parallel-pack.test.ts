import { createRequire } from "node:module";

import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { optimizarLegacyHybrid } = require("../../src/lib/optimizer/legacy/rust/rust-hybrid.cjs");
const { generarPatronesLegacyRustHybrid } = require("../../src/lib/optimizer/legacy/rust/rust-patrones.cjs");

const oldParallel = process.env.OPTIMIZER_RUST_PARALLEL_PACK_EXPERIMENTAL;

afterEach(() => {
  if (oldParallel === undefined) delete process.env.OPTIMIZER_RUST_PARALLEL_PACK_EXPERIMENTAL;
  else process.env.OPTIMIZER_RUST_PARALLEL_PACK_EXPERIMENTAL = oldParallel;
});

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
  restartsPorPlaca: 6,
  restoMin: 250,
  restoMax: 400,
  tolerancia: 0.02,
  beamWidth: 5,
  maxPiezasBeam: 120,
  presupuestoBeamMs: 1500,
  maxExpansionesBeam: 1024,
  watchdogBeamMs: 5000,
  semilla: 20260812,
  preferirMenorProfundidad: true,
  usarRescue: true,
  maxPiezasRescue: 30,
  presupuestoRescueMs: 300,
  multiRebanada: false,
  multiVariantes: false,
};

const LINES = [
  { ref: "A", detalle: "A", cant: 4, base: 882, altura: 600, veta: false },
  { ref: "B", detalle: "B", cant: 2, base: 1554, altura: 600, veta: false },
  { ref: "C", detalle: "C", cant: 4, base: 1518, altura: 70, veta: false },
  { ref: "D", detalle: "D", cant: 3, base: 516, altura: 880, veta: false },
  { ref: "E", detalle: "E", cant: 5, base: 1550, altura: 100, veta: false },
];

function normalizeTree(node: any): any {
  if (!node) return null;
  return {
    x: node.x,
    y: node.y,
    w: node.w,
    h: node.h,
    dir: node.dir,
    nivel: node.nivel,
    partes: (node.partes ?? []).map((part: any) => ({
      cut: part.cut,
      type: part.type,
      pieceId: part.pieza?.id ?? null,
      bloque: part.bloque,
      hijo: normalizeTree(part.hijo),
      ...(part.terminal === undefined ? {} : { terminal: Boolean(part.terminal) }),
    })),
  };
}

function normalizeBoard(board: any) {
  return {
    ancho: board.ancho,
    alto: board.alto,
    colocadas: board.colocadas.map((placement: any) => ({
      id: placement.pieza.id,
      ref: placement.pieza.ref,
      x: placement.x,
      y: placement.y,
      base: placement.base,
      altura: placement.altura,
      rotada: Boolean(placement.rotada),
      nivel: placement.nivel,
    })),
    cortes: board.cortes,
    restos: board.restos,
    arbol: normalizeTree(board.arbol),
  };
}

function normalizePlan(plan: any) {
  return plan.placas.map(normalizeBoard);
}

function normalizePool(pool: any[]) {
  return pool
    .map((pattern) => ({
      usage: [...pattern.uso.entries()].sort((a: any, b: any) => Number(a[0]) - Number(b[0])),
      area: pattern.area,
      board: normalizeBoard(pattern.placa),
    }))
    .sort((a, b) => JSON.stringify(a.usage).localeCompare(JSON.stringify(b.usage)));
}

function runParallel<T>(enabled: boolean, fn: () => T): T {
  process.env.OPTIMIZER_RUST_PARALLEL_PACK_EXPERIMENTAL = enabled ? "1" : "0";
  return fn();
}

describe("experimental Rust parallel pack", () => {
  it("matches the sequential hybrid plan bit-for-bit at the physical-plan level", () => {
    const sequential = runParallel(false, () => optimizarLegacyHybrid(LINES, CONFIG));
    const parallel = runParallel(true, () => optimizarLegacyHybrid(LINES, CONFIG));

    expect(parallel.resumen).toEqual(sequential.resumen);
    expect(normalizePlan(parallel)).toEqual(normalizePlan(sequential));
  });

  it("matches the sequential Pattern Master pool including physical boards", () => {
    const sequential = runParallel(false, () =>
      generarPatronesLegacyRustHybrid(LINES, CONFIG, 12, 7),
    );
    const parallel = runParallel(true, () =>
      generarPatronesLegacyRustHybrid(LINES, CONFIG, 12, 7),
    );

    expect(normalizePool(parallel)).toEqual(normalizePool(sequential));
  });

  it("keeps the default path on the certified sequential exports", () => {
    delete process.env.OPTIMIZER_RUST_PARALLEL_PACK_EXPERIMENTAL;
    const implicit = optimizarLegacyHybrid(LINES, CONFIG);
    const explicitSequential = runParallel(false, () => optimizarLegacyHybrid(LINES, CONFIG));
    expect(normalizePlan(implicit)).toEqual(normalizePlan(explicitSequential));
  });
});

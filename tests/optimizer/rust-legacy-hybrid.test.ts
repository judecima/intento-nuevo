import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { optimizar } = require("../../src/lib/optimizer/legacy/motor.cjs");
const {
  generarPatrones,
} = require("../../src/lib/optimizer/legacy/patrones.cjs");
const {
  optimizarLegacyHybrid,
} = require("../../research/optimizer/pattern-generators/rust/legacy-hybrid-engine.mjs");
const {
  generarPatronesLegacyRustHybrid,
} = require("../../research/optimizer/pattern-generators/rust/legacy-outer-adapter.mjs");

function normalizeTree(node: any): any {
  if (!node) return null;
  return {
    x: node.x, y: node.y, w: node.w, h: node.h, dir: node.dir, nivel: node.nivel,
    partes: (node.partes ?? []).map((part: any) => ({
      cut: part.cut,
      type: part.type,
      pieceId: part.pieza?.id ?? null,
      bloque: { x: part.bloque.x, y: part.bloque.y, w: part.bloque.w, h: part.bloque.h },
      hijo: normalizeTree(part.hijo),
      ...(part.terminal === undefined ? {} : { terminal: Boolean(part.terminal) }),
    })),
  };
}

function normalizePlan(plan: any) {
  return plan.placas.map((board: any) => ({
    ancho: board.ancho,
    alto: board.alto,
    colocadas: board.colocadas.map((placement: any) => ({
      id: placement.pieza.id,
      ref: placement.pieza.ref,
      x: placement.x, y: placement.y,
      base: placement.base, altura: placement.altura,
      rotada: Boolean(placement.rotada),
      nivel: placement.nivel,
    })),
    cortes: board.cortes.map((cut: any) => ({
      x1: cut.x1, y1: cut.y1, x2: cut.x2, y2: cut.y2,
      nivel: cut.nivel, largo: cut.largo,
      ...(cut.terminal === undefined ? {} : { terminal: Boolean(cut.terminal) }),
    })),
    restos: board.restos.map((rest: any) => ({ x: rest.x, y: rest.y, w: rest.w, h: rest.h })),
    arbol: normalizeTree(board.arbol),
  }));
}

function normalizePool(pool: any[]) {
  return pool
    .map((pattern) => ({
      usage: [...pattern.uso.entries()].sort((a: any, b: any) => a[0] - b[0]),
      area: pattern.area,
      board: normalizePlan({ placas: [pattern.placa] })[0],
    }))
    .sort((a, b) => JSON.stringify(a.usage).localeCompare(JSON.stringify(b.usage)));
}

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

describe("Rust/JS hybrid legacy engine", () => {
  it("matches full optimizar plan on a mixed multi-board order", () => {
    const lines = [
      { ref: "A", detalle: "A", cant: 4, base: 882, altura: 600, veta: false },
      { ref: "B", detalle: "B", cant: 1, base: 1554, altura: 600, veta: false },
      { ref: "C", detalle: "C", cant: 2, base: 1518, altura: 70, veta: false },
      { ref: "D", detalle: "D", cant: 2, base: 516, altura: 880, veta: false },
      { ref: "E", detalle: "E", cant: 2, base: 1550, altura: 100, veta: false },
    ];
    const js = optimizar(lines, CONFIG);
    const hybrid = optimizarLegacyHybrid(lines, CONFIG);
    expect(hybrid.resumen.placas).toBe(js.resumen.placas);
    expect(normalizePlan(hybrid)).toEqual(normalizePlan(js));
  });

  it("matches generated pattern pool when only the inner packer is native", () => {
    const lines = [
      { ref: "A", detalle: "A", cant: 3, base: 900, altura: 600, veta: false },
      { ref: "B", detalle: "B", cant: 4, base: 600, altura: 400, veta: false },
      { ref: "C", detalle: "C", cant: 4, base: 500, altura: 300, veta: false },
      { ref: "D", detalle: "D", cant: 2, base: 1200, altura: 70, veta: false },
    ];
    const legacy = generarPatrones(lines, CONFIG, 6, 7);
    const hybrid = generarPatronesLegacyRustHybrid(lines, CONFIG, 6, 7);
    expect(normalizePool(hybrid)).toEqual(normalizePool(legacy));
  });
});

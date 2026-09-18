import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  empacarPlaca,
  orientaciones,
  medidaCorte,
} = require("../../src/lib/optimizer/legacy/motor.cjs");
const {
  packBoardLegacyRustCore,
  legacyJsRng,
} = require("../../research/optimizer/pattern-generators/rust/legacy-packer-adapter.mjs");

function prepare(lines: any[], opts: any) {
  let id = 0;
  const pieces: any[] = [];
  for (let ref = 0; ref < lines.length; ref++) {
    const line = lines[ref];
    for (let count = 0; count < line.cant; count++) {
      const piece: any = {
        id: id++,
        base: line.base,
        altura: line.altura,
        detalle: line.detalle ?? "",
        veta: Boolean(line.veta),
        cantos: line.cantos ?? null,
        ref,
      };
      piece._corte = medidaCorte(piece, opts);
      piece._ors = orientaciones(piece, opts.materialConVeta);
      pieces.push(piece);
    }
  }
  const sigs = new Map<string, number>();
  for (const piece of pieces) {
    const key = `${piece._corte.base}|${piece._corte.altura}|${piece.veta ? 1 : 0}`;
    if (!sigs.has(key)) sigs.set(key, sigs.size);
    piece._sig = sigs.get(key);
  }
  opts._cuenta = new Map();
  opts._reps = [];
  opts._medidas = [];
  opts._nSigs = sigs.size;
  opts._cache = null;
  opts._stats = { hits: 0, fallos: 0 };
  return pieces;
}

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
      bloque: {
        x: part.bloque.x,
        y: part.bloque.y,
        w: part.bloque.w,
        h: part.bloque.h,
      },
      hijo: normalizeTree(part.hijo),
      ...(part.terminal === undefined ? {} : { terminal: Boolean(part.terminal) }),
    })),
  };
}

function normalizeBoard(result: any) {
  return {
    colocadas: result.colocadas.map((item: any) => ({
      pieceId: item.pieza.id,
      x: item.x,
      y: item.y,
      base: item.base,
      altura: item.altura,
      rotada: Boolean(item.rotada),
      nivel: item.nivel,
    })),
    cortes: result.cortes.map((cut: any) => ({
      x1: cut.x1, y1: cut.y1, x2: cut.x2, y2: cut.y2,
      nivel: cut.nivel, largo: cut.largo,
      ...(cut.terminal === undefined ? {} : { terminal: Boolean(cut.terminal) }),
    })),
    restos: result.restos.map((rest: any) => ({
      x: rest.x, y: rest.y, w: rest.w, h: rest.h,
    })),
    arbol: normalizeTree(result.arbol),
    area: result.area,
    areaResto: result.areaResto,
  };
}

const BASE_OPTIONS = {
  anchoUtil: 2600,
  altoUtil: 1830,
  sierra: 4.5,
  etapas: 4,
  materialConVeta: false,
  criterio: "perp",
  criterios: ["perp", "area"],
  dirInicial: "y",
  ruido: 0,
  restoMin: 250,
  restoMax: 400,
  multiRebanada: false,
  penalizarFranjaMuerta: false,
  deltasEstructurales: [],
  contraerRebanadaReal: true,
  trazaDiag: false,
};

const FIXTURES = [
  {
    name: "mixed deterministic",
    lines: [
      { detalle: "A", cant: 4, base: 882, altura: 600 },
      { detalle: "B", cant: 1, base: 1554, altura: 600 },
      { detalle: "C", cant: 2, base: 1518, altura: 70 },
      { detalle: "D", cant: 2, base: 516, altura: 880 },
    ],
  },
  {
    name: "terminal and contraction",
    lines: [
      { detalle: "A", cant: 2, base: 622, altura: 800 },
      { detalle: "B", cant: 3, base: 578, altura: 800 },
      { detalle: "C", cant: 3, base: 300, altura: 420 },
    ],
  },
  {
    name: "grain constrained",
    options: { materialConVeta: true, dirInicial: "x" },
    lines: [
      { detalle: "A", cant: 3, base: 900, altura: 500, veta: true },
      { detalle: "B", cant: 4, base: 420, altura: 700, veta: false },
    ],
  },
];

describe("Rust legacy single-board packer", () => {
  for (const fixture of FIXTURES) {
    it(`matches empacarPlaca exactly: ${fixture.name}`, () => {
      const opts: any = { ...BASE_OPTIONS, ...(fixture.options ?? {}) };
      const pool = prepare(fixture.lines, opts);
      const js = empacarPlaca(pool.map((piece: any) => ({ ...piece })), opts, null);
      const rust = packBoardLegacyRustCore(pool, opts);
      expect(normalizeBoard(rust)).toEqual(normalizeBoard(js));
    });
  }

  it("matches noisy candidate selection with the same LCG stream", () => {
    const opts: any = { ...BASE_OPTIONS, ruido: 0.35, criterio: "area", criterios: ["area", "perp"] };
    const pool = prepare([
      { detalle: "A", cant: 4, base: 700, altura: 500 },
      { detalle: "B", cant: 5, base: 520, altura: 420 },
      { detalle: "C", cant: 3, base: 450, altura: 820 },
    ], opts);
    for (const seed of [7, 123456789, 0xffffffff]) {
      const js = empacarPlaca(pool.map((piece: any) => ({ ...piece })), opts, legacyJsRng(seed));
      const rust = packBoardLegacyRustCore(pool, opts, seed);
      expect(normalizeBoard(rust)).toEqual(normalizeBoard(js));
    }
  });

  it("matches multi-rebanada proposals", () => {
    const opts: any = { ...BASE_OPTIONS, multiRebanada: true, etapas: 4, dirInicial: "x" };
    const pool = prepare([
      { detalle: "A", cant: 4, base: 400, altura: 600 },
      { detalle: "B", cant: 3, base: 820, altura: 600 },
      { detalle: "C", cant: 2, base: 1260, altura: 300 },
    ], opts);
    const js = empacarPlaca(pool.map((piece: any) => ({ ...piece })), opts, null);
    const rust = packBoardLegacyRustCore(pool, opts);
    expect(normalizeBoard(rust)).toEqual(normalizeBoard(js));
  });
});

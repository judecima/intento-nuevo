import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  empacarPlaca,
  orientaciones,
  medidaCorte,
  calidadRestos,
  compararCalidad,
} = require("../../src/lib/optimizer/legacy/motor.cjs");
const {
  packBoardLegacyRustCore,
  packBoardLegacyRustBatch,
  packBoardLegacyRustGreedyBest,
  packBoardLegacyRustBeamCandidates,
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

  it("batch execution is byte-for-byte equivalent to individual native calls", () => {
    const opts: any = { ...BASE_OPTIONS, ruido: 0.35, criterio: "area", criterios: ["area", "perp"] };
    const pool = prepare([
      { detalle: "A", cant: 4, base: 700, altura: 500 },
      { detalle: "B", cant: 5, base: 520, altura: 420 },
      { detalle: "C", cant: 3, base: 450, altura: 820 },
    ], opts);
    const requests = [
      { opts: { ...opts, dirInicial: "x" }, randomSeed: 7 },
      { opts: { ...opts, dirInicial: "y", criterio: "perp", criterios: ["perp", "area"] }, randomSeed: 123456789 },
      { opts: { ...opts, dirInicial: "x", ruido: 0, multiRebanada: true }, randomSeed: null },
    ];
    const batch = packBoardLegacyRustBatch(pool, requests).map(normalizeBoard);
    const individual = requests.map(({ opts: requestOptions, randomSeed }) =>
      normalizeBoard(packBoardLegacyRustCore(pool, requestOptions, randomSeed)),
    );
    expect(batch).toEqual(individual);
  });

  it("native greedy selector matches the JS candidate policy", () => {
    const opts: any = { ...BASE_OPTIONS, ruido: 0.35, tolerancia: 0.02 };
    const pool = prepare([
      { detalle: "A", cant: 4, base: 700, altura: 500 },
      { detalle: "B", cant: 5, base: 520, altura: 420 },
      { detalle: "C", cant: 3, base: 450, altura: 820 },
    ], opts);
    const requests = [
      { opts: { ...opts, criterio: "area", criterios: ["area", "perp"], dirInicial: "x" }, randomSeed: 7 },
      { opts: { ...opts, criterio: "perp", criterios: ["perp", "area"], dirInicial: "y" }, randomSeed: 123456789 },
      { opts: { ...opts, criterio: "largo", criterios: ["largo", "perp"], dirInicial: "x", ruido: 0 }, randomSeed: null },
    ];
    const all = packBoardLegacyRustBatch(pool, requests);
    const closing = all.filter((candidate: any) => candidate.colocadas.length === pool.length);
    let expected: any;
    if (closing.length) {
      expected = closing.sort((a: any, b: any) => {
        const q = compararCalidad(calidadRestos(b.restos ?? [], opts), calidadRestos(a.restos ?? [], opts));
        return q || b.area - a.area;
      })[0];
    } else {
      const maxArea = Math.max(...all.map((candidate: any) => candidate.area));
      const threshold = maxArea * (1 - opts.tolerancia);
      expected = null;
      for (const candidate of all) {
        if (candidate.area < threshold) continue;
        if (
          !expected ||
          compararCalidad(calidadRestos(candidate.restos ?? [], opts), calidadRestos(expected.restos ?? [], opts)) > 0 ||
          (
            compararCalidad(calidadRestos(candidate.restos ?? [], opts), calidadRestos(expected.restos ?? [], opts)) === 0 &&
            candidate.area > expected.area + 1e-6
          )
        ) expected = candidate;
      }
    }
    const selected = packBoardLegacyRustGreedyBest(pool, requests, opts.tolerancia);
    expect(normalizeBoard(selected)).toEqual(normalizeBoard(expected));
  });

  it("native Beam selector preserves the JS dedup/top candidate set", () => {
    const opts: any = { ...BASE_OPTIONS, ruido: 0.35, beamWidth: 4 };
    const pool = prepare([
      { detalle: "A", cant: 4, base: 700, altura: 500 },
      { detalle: "B", cant: 5, base: 520, altura: 420 },
      { detalle: "C", cant: 3, base: 450, altura: 820 },
    ], opts);
    const requests = [
      { opts: { ...opts, criterio: "area", criterios: ["area", "perp"], dirInicial: "x" }, randomSeed: 7 },
      { opts: { ...opts, criterio: "perp", criterios: ["perp", "area"], dirInicial: "y" }, randomSeed: 123456789 },
      { opts: { ...opts, criterio: "largo", criterios: ["largo", "perp"], dirInicial: "x", ruido: 0 }, randomSeed: null },
      { opts: { ...opts, criterio: "area", criterios: ["area", "area"], dirInicial: "y" }, randomSeed: 99 },
    ];
    const all = packBoardLegacyRustBatch(pool, requests);
    const byUsage = new Map<string, any>();
    for (const candidate of all) {
      const signature = candidate.colocadas.map((p: any) => p.pieza.id).sort((a: number, b: number) => a - b).join(",");
      const previous = byUsage.get(signature);
      const q = previous == null ? 1 :
        compararCalidad(calidadRestos(candidate.restos ?? [], opts), calidadRestos(previous.restos ?? [], opts));
      if (!previous || q > 0 || (q === 0 && candidate.area > previous.area + 1e-6)) byUsage.set(signature, candidate);
    }
    const boardArea = opts.anchoUtil * opts.altoUtil;
    const expected = [...byUsage.values()].map((candidate: any) => {
      const used = new Set(candidate.colocadas.map((p: any) => p.pieza.id));
      const pending = pool.filter((p: any) => !used.has(p.id))
        .reduce((sum: number, p: any) => sum + p._corte.base * p._corte.altura, 0);
      return { candidate, lb: Math.ceil(Math.max(0, pending) / boardArea) };
    }).sort((a: any, b: any) => {
      const primary = a.lb - b.lb || b.candidate.area - a.candidate.area;
      if (primary) return primary;
      return -compararCalidad(
        calidadRestos(a.candidate.restos ?? [], opts),
        calidadRestos(b.candidate.restos ?? [], opts),
      );
    }).slice(0, Math.max(opts.beamWidth * 3, opts.beamWidth))
      .map((x: any) => normalizeBoard(x.candidate));

    const selected = packBoardLegacyRustBeamCandidates(pool, requests, opts.beamWidth).map(normalizeBoard);
    expect(selected).toEqual(expected);
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

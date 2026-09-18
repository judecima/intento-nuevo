import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";

import { generarPatronesLegacyRustHybrid } from "./legacy-outer-adapter.mjs";

const require = createRequire(import.meta.url);
const { generarPatrones } = require("../../../../src/lib/optimizer/legacy/patrones.cjs");

const lines = [
  { ref: "1", detalle: "1", cant: 2, base: 1800, altura: 1050, veta: false },
  { ref: "3", detalle: "3", cant: 2, base: 2000, altura: 1100, veta: false },
  { ref: "2", detalle: "2", cant: 1, base: 1900, altura: 1500, veta: false },
  { ref: "4", detalle: "4", cant: 14, base: 744, altura: 450, veta: false },
];

const config = {
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
  multiVariantes: false,
  trazaDiag: false,
};

const rounds = Number(process.env.LEGACY_RUST_BENCH_ROUNDS || 40);

function normalize(pool) {
  return pool.map((pattern) => ({
    usage: [...pattern.uso.entries()].sort((a, b) => a[0] - b[0]),
    area: pattern.area,
    pieces: pattern.placa.colocadas
      .map((placement) => ({
        ref: placement.pieza.ref,
        x: placement.x,
        y: placement.y,
        base: placement.base,
        altura: placement.altura,
        rotada: Boolean(placement.rotada),
        nivel: placement.nivel,
      }))
      .sort((a, b) =>
        String(a.ref).localeCompare(String(b.ref)) ||
        a.x - b.x || a.y - b.y || a.base - b.base || a.altura - b.altura
      ),
    cuts: pattern.placa.cortes.map((cut) => ({
      x1: cut.x1, y1: cut.y1, x2: cut.x2, y2: cut.y2,
      nivel: cut.nivel, largo: cut.largo, terminal: Boolean(cut.terminal),
    })),
    remnants: pattern.placa.restos.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h })),
  })).sort((a, b) => JSON.stringify(a.usage).localeCompare(JSON.stringify(b.usage)));
}

const t0 = performance.now();
const legacy = generarPatrones(lines, config, rounds, 7);
const legacyMs = performance.now() - t0;

const t1 = performance.now();
const native = generarPatronesLegacyRustHybrid(lines, config, rounds, 7);
const rustBatchMs = performance.now() - t1;

const left = JSON.stringify(normalize(legacy));
const right = JSON.stringify(normalize(native));
if (left !== right) {
  console.error(JSON.stringify({
    ok: false,
    rounds,
    legacyPatterns: legacy.length,
    rustPatterns: native.length,
    legacyMs,
    rustBatchMs,
  }));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  order: "4057401",
  rounds,
  patterns: legacy.length,
  legacyMs: Number(legacyMs.toFixed(3)),
  rustBatchMs: Number(rustBatchMs.toFixed(3)),
  speedup: Number((legacyMs / rustBatchMs).toFixed(3)),
  savingPct: Number(((1 - rustBatchMs / legacyMs) * 100).toFixed(2)),
}));

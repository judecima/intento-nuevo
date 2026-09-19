import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const fixtures = require("./p99-tail-fixtures.cjs");
const { generarPatronesLegacyRustHybrid } = require("../../../../src/lib/optimizer/legacy/rust/rust-patrones.cjs");

const wanted = process.env.P99_BENCH_CASE || "4059795";
const label = process.env.P99_BENCH_LABEL || "candidate";
const fixture = fixtures.find((x) => x.order === wanted);
if (!fixture) throw new Error("missing p99 fixture " + wanted);

function tree(node) {
  if (!node) return null;
  return {
    x: node.x, y: node.y, w: node.w, h: node.h, dir: node.dir, nivel: node.nivel,
    partes: (node.partes || []).map((p) => ({
      cut: p.cut,
      type: p.type,
      pieceId: p.pieza?.id ?? null,
      bloque: p.bloque,
      terminal: p.terminal,
      hijo: tree(p.hijo),
    })),
  };
}

function board(p) {
  return {
    ancho: p.ancho,
    alto: p.alto,
    colocadas: (p.colocadas || []).map((c) => ({
      id: c.pieza?.id ?? null,
      ref: c.pieza?.ref ?? null,
      x: c.x, y: c.y, base: c.base, altura: c.altura,
      rotada: Boolean(c.rotada), nivel: c.nivel,
    })),
    cortes: p.cortes || [],
    restos: p.restos || [],
    arbol: tree(p.arbol),
  };
}

const options = { ...fixture.config };
const t0 = process.hrtime.bigint();
const pool = generarPatronesLegacyRustHybrid(fixture.lines, options, 40, 7);
const ms = Number(process.hrtime.bigint() - t0) / 1e6;

const normalized = pool.map((pattern) => ({
  uso: [...pattern.uso.entries()].sort((a,b) => a[0]-b[0]),
  area: pattern.area,
  placa: board(pattern.placa),
}));
const digest = createHash("sha256").update(JSON.stringify(normalized)).digest("hex");

console.log(JSON.stringify({
  ok: true,
  label,
  order: fixture.order,
  pieces: fixture.lines.reduce((s,x) => s + x.cant, 0),
  typeCount: fixture.lines.length,
  patterns: pool.length,
  ms: +ms.toFixed(3),
  digest,
}));

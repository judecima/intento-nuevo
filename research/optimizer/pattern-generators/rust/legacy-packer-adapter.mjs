import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const addonPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../native/optimizer-pattern-generator/optimizer_pattern_generator.node",
);

let addon;
function native() {
  addon ??= require(addonPath);
  if (typeof addon.packBoardLegacyCore !== "function") {
    throw new Error("native addon does not expose packBoardLegacyCore()");
  }
  return addon;
}

function packOptions(opts) {
  return {
    anchoUtil: opts.anchoUtil,
    altoUtil: opts.altoUtil,
    sierra: opts.sierra,
    etapas: opts.etapas,
    materialConVeta: Boolean(opts.materialConVeta),
    criterio: opts.criterio,
    criterios: Array.isArray(opts.criterios) ? opts.criterios : [],
    dirInicial: opts.dirInicial,
    ruido: opts.ruido ?? 0,
    restoMin: opts.restoMin,
    restoMax: opts.restoMax,
    multiRebanada: Boolean(opts.multiRebanada),
    penalizarFranjaMuerta: Boolean(opts.penalizarFranjaMuerta),
    deltasEstructurales: Array.isArray(opts.deltasEstructurales) ? opts.deltasEstructurales : [],
    contraerRebanadaReal: opts.contraerRebanadaReal !== false,
  };
}

function pieces(pool) {
  return pool.map((piece) => ({
    id: piece.id,
    base: piece.base,
    altura: piece.altura,
    cutBase: piece._corte.base,
    cutAltura: piece._corte.altura,
    veta: Boolean(piece.veta),
    sig: piece._sig,
    detalle: piece.detalle ?? "",
    refValue: piece.ref ?? null,
  }));
}

function hydrateTree(node, byId) {
  if (!node) return null;
  return {
    x: node.x,
    y: node.y,
    w: node.w,
    h: node.h,
    dir: node.dir,
    nivel: node.nivel,
    partes: (node.partes ?? []).map((part) => ({
      cut: part.cut,
      type: part.type,
      pieza: part.pieceId == null ? null : byId.get(part.pieceId) ?? null,
      bloque: part.bloque,
      hijo: hydrateTree(part.hijo, byId),
      ...(part.terminal === undefined ? {} : { terminal: Boolean(part.terminal) }),
    })),
  };
}

export function packBoardLegacyRustCore(pool, opts, randomSeed = null) {
  const raw = JSON.parse(
    native().packBoardLegacyCore(
      JSON.stringify(pieces(pool)),
      JSON.stringify(packOptions(opts)),
      randomSeed == null ? undefined : randomSeed >>> 0,
    ),
  );
  const byId = new Map(pool.map((piece) => [piece.id, piece]));
  return {
    colocadas: raw.colocadas.map(({ id, refValue: _refValue, detalle: _detalle, ...placement }) => ({
      ...placement,
      pieza: byId.get(id),
    })),
    cortes: raw.cortes,
    restos: raw.restos,
    arbol: hydrateTree(raw.arbol, byId),
    area: raw.area,
    areaResto: raw.areaResto,
  };
}

export function legacyJsRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

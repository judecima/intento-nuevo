"use strict";
const path = require("node:path");
const addonPath = path.join(
  __dirname,
  "../../../../../native/optimizer-pattern-generator/optimizer_pattern_generator.node",
);

let addon;
function native() {
  addon ??= require(addonPath);
  if (
    typeof addon.packBoardLegacyCore !== "function" ||
    typeof addon.packBoardLegacyBatch !== "function" ||
    typeof addon.packBoardLegacyGreedyBest !== "function" ||
    typeof addon.packBoardLegacyBeamCandidates !== "function"
  ) {
    throw new Error("native addon does not expose legacy packer core/batch/selectors");
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


function serializeRequests(requests) {
  return JSON.stringify(requests.map(({ opts, randomSeed = null }) => ({
    options: packOptions(opts),
    randomSeed: randomSeed == null ? null : randomSeed >>> 0,
  })));
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


function hydrateResult(raw, pool) {
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

function useParallelPack() {
  return /^(1|true|yes|on)$/i.test(
    String(process.env.OPTIMIZER_RUST_PARALLEL_PACK_EXPERIMENTAL || ""),
  );
}

function nativePackFunction(sequentialName, parallelName) {
  const addon = native();
  if (!useParallelPack()) return addon[sequentialName];
  const fn = addon[parallelName];
  if (typeof fn !== "function") {
    throw new Error(`native addon does not expose experimental parallel export ${parallelName}`);
  }
  return fn;
}

function packBoardLegacyRustBatch(pool, requests) {
  const raw = JSON.parse(
    nativePackFunction("packBoardLegacyBatch", "packBoardLegacyBatchParallel")(
      JSON.stringify(pieces(pool)),
      serializeRequests(requests),
    ),
  );
  return raw.map((result) => hydrateResult(result, pool));
}

function packBoardLegacyRustGreedyBest(pool, requests, tolerance) {
  const raw = JSON.parse(
    nativePackFunction("packBoardLegacyGreedyBest", "packBoardLegacyGreedyBestParallel")(
      JSON.stringify(pieces(pool)),
      serializeRequests(requests),
      tolerance,
    ),
  );
  return raw == null ? null : hydrateResult(raw, pool);
}

function packBoardLegacyRustBeamCandidates(pool, requests, beamWidth) {
  const raw = JSON.parse(
    nativePackFunction("packBoardLegacyBeamCandidates", "packBoardLegacyBeamCandidatesParallel")(
      JSON.stringify(pieces(pool)),
      serializeRequests(requests),
      beamWidth >>> 0,
    ),
  );
  return raw.map((result) => hydrateResult(result, pool));
}

function packBoardLegacyRustCore(pool, opts, randomSeed = null) {
  const raw = JSON.parse(
    native().packBoardLegacyCore(
      JSON.stringify(pieces(pool)),
      JSON.stringify(packOptions(opts)),
      randomSeed == null ? undefined : randomSeed >>> 0,
    ),
  );
  return hydrateResult(raw, pool);
}

function legacyJsRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}


module.exports = {
  packBoardLegacyRustBatch,
  packBoardLegacyRustGreedyBest,
  packBoardLegacyRustBeamCandidates,
  packBoardLegacyRustCore,
  legacyJsRng,
};

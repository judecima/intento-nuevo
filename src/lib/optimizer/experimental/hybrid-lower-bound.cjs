"use strict";

const { computeStrongLowerBound } = require("./strong-lower-bound.cjs");
const claude = require("./claude-lower-bounds.cjs");

/**
 * Hybrid certificate used by the staged V10 path.
 *
 * Cheap stage = max(V14 strong LB, Claude cheap cascade without raster).
 * Raster is delegated to Claude's adaptive policy (piece/type thresholds), so
 * heavy jobs don't pay the raster cost unless explicitly overridden.
 */
function computeHybridLowerBound(lineas, opts, incumbentBoards, config = {}) {
  const t0 = process.hrtime.bigint();
  const v14 = computeStrongLowerBound(lineas, opts, config.v14 || {});
  const t1 = process.hrtime.bigint();

  const cascadeConfig = {
    usarKerf: true,
    usarDff: true,
    usarRaster: config.useRaster !== false,
    usarProyeccion: true,
    usarClique: true,
    rasterMaxPiezas: config.rasterMaxPieces ?? config.rasterMaxPiezas ?? 40,
    rasterMaxTipos: config.rasterMaxTypes ?? config.rasterMaxTipos ?? 16,
    ...(config.claude || {}),
  };
  const casc = claude.computeLowerBoundCascade(lineas, opts, incumbentBoards, cascadeConfig);
  const t2 = process.hrtime.bigint();

  const best = Math.max(v14.lowerBound || 0, casc.best || 0);
  const parts = [
    { name: `v14:${v14.reason || "unknown"}`, value: v14.lowerBound || 0 },
    { name: `claude:${casc.binding || "unknown"}`, value: casc.best || 0 },
  ].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

  return {
    lowerBound: best,
    reason: parts[0]?.name || "none",
    certified: Number.isFinite(incumbentBoards) ? best >= incumbentBoards : false,
    cheapLowerBound: Math.max(v14.lowerBound || 0, casc.bestBarata || 0),
    cheapCertified: Number.isFinite(incumbentBoards)
      ? Math.max(v14.lowerBound || 0, casc.bestBarata || 0) >= incumbentBoards
      : false,
    rasterRan: !!casc.rasterCorrio,
    rasterOmittedByPolicy: !!casc.rasterOmitidoPorPolitica,
    stage: casc.etapa,
    v14,
    claudeCascade: casc,
    timingsMs: {
      v14: Number(t1 - t0) / 1e6,
      claudeCascade: Number(t2 - t1) / 1e6,
      total: Number(t2 - t0) / 1e6,
    },
    parts,
  };
}

module.exports = { computeHybridLowerBound };

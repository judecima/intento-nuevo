"use strict";

/* V19 experimental — memoizacion exacta entre rondas Pattern Master.
   No reduce rondas ni cambia subconjuntos/RNG. Comparte solamente resultados
   deterministas de empacarPlaca entre llamadas a optimizar(). */
const { optimizar } = require('../../../../src/lib/optimizer/legacy/motor.cjs');
const { claveVector } = require('../../../../src/lib/optimizer/legacy/patrones.cjs');

function generarPatronesCrossRound(lineas, O, rondas = 40, semilla = 7, telemetry = null, minPool = 0) {
  let s = semilla >>> 0;
  const R = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return (s & 0x7fffffff) / 0x7fffffff; };

  const conRef = lineas.map((l, i) => ({ ...l, ref: i, _refOriginal: l.ref }));
  const porVector = new Map();
  const sharedPackingCache = new Map();
  const sharedPackingCacheStats = { hits: 0, misses: 0 };
  const roundStats = [];

  const registrar = (placa) => {
    const uso = new Map();
    for (const c of placa.colocadas) {
      const t = c.pieza.ref;
      if (typeof t !== 'number') return;
      uso.set(t, (uso.get(t) || 0) + 1);
    }
    if (!uso.size) return;
    const area = placa.colocadas.reduce((a, c) => a + c.base * c.altura, 0);
    const k = claveVector(uso);
    const previo = porVector.get(k);
    if (!previo || area > previo.area) porVector.set(k, { uso, area, placa });
  };

  const warn = console.warn; console.warn = () => {};
  try {
    for (let r = 0; r < rondas; r++) {
      const sub = r === 0 ? conRef : conRef.filter(() => R() > 0.45);
      if (!sub.length) continue;
      const h0 = sharedPackingCacheStats.hits;
      const m0 = sharedPackingCacheStats.misses;
      const t0 = Date.now();
      try {
        const res = optimizar(sub.map(l => ({ ...l })), {
          ...O,
          semilla: 1000 + r,
          pases: 2,
          sharedPackingCache,
          sharedPackingCacheStats,
          sharedPackingSigCount: conRef.length,
          sharedPackingMinPool: minPool,
        });
        for (const p of res.placas) registrar(p);
      } catch (e) {}
      roundStats.push({
        round: r,
        ms: Date.now() - t0,
        hits: sharedPackingCacheStats.hits - h0,
        misses: sharedPackingCacheStats.misses - m0,
        cacheSize: sharedPackingCache.size,
      });
    }
  } finally { console.warn = warn; }

  if (telemetry && typeof telemetry === 'object') {
    telemetry.hits = sharedPackingCacheStats.hits;
    telemetry.misses = sharedPackingCacheStats.misses;
    telemetry.cacheSize = sharedPackingCache.size;
    telemetry.rounds = roundStats;
    telemetry.hitRate = (telemetry.hits + telemetry.misses) > 0
      ? telemetry.hits / (telemetry.hits + telemetry.misses) : 0;
  }
  return [...porVector.values()];
}

module.exports = { generarPatronesCrossRound };

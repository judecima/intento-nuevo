// Generated mechanically from Optimizador_V10_Interactivo_Modos_Validacion_XML_Lepton.html.
// Do not edit these legacy files by hand; update the extractor if the source changes.
"use strict";

/* Generacion de patrones para el master de cobertura.
   ------------------------------------------------------------------
   Cada patron conserva DOS cosas:
     - el vector de consumo por tipo (lo que el master necesita para decidir)
     - la placa fisica que lo origino (colocadas, cortes, restos)

   Sin lo segundo el master puede demostrar una mejora pero no entregar las
   placas al validador ni exportarlas: la mejora queda sin materializar.

   El indice de tipo viaja por `ref`, que el motor copia de la linea a cada
   pieza. Deducirlo comparando medidas confunde lineas de igual dimension y
   distinta veta o referencia. */
const { optimizar } = require('./motor.cjs');

function claveVector(uso) {
  return [...uso.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => k + ':' + v).join(',');
}

function envFlag(name) {
  return /^(1|true|yes|on)$/i.test(String(process.env[name] || ''));
}

/* Oculta subconjuntos de tipos al constructor: asi propone placas que nunca
   elegiria con el pool completo, que son justamente las que el optimo global
   necesita aunque sean peores por placa. */
function generarPatrones(lineas, O, rondas = 60, semilla = 7) {
  let s = semilla >>> 0;
  const R = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return (s & 0x7fffffff) / 0x7fffffff; };

  const conRef = lineas.map((l, i) => ({ ...l, ref: i, _refOriginal: l.ref }));
  const porVector = new Map();
  const usarV21 = O.usarV21FamilyMaster === true || envFlag('OPTIMIZER_V21_FAMILY_MASTER_EXPERIMENTAL');
  const rondasEfectivas = usarV21 ? Math.min(rondas, 20) : rondas;

  const registrar = (placa, meta = null) => {
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
    if (!previo || area > previo.area) {
      porVector.set(k, {
        uso,
        area,
        placa,
        ...(meta ? { _patternMeta: meta } : {})
      });
    }
  };

  const warn = console.warn; console.warn = () => {};

  // V21b: generar primero columnas deterministas por familias geométricas y
  // reducir la exploración aleatoria de 40 a 20 rondas. El mismo motor
  // guillotina construye cada placa; sólo cambia cómo se propone el pool.
  // Con el flag apagado, el comportamiento legacy permanece exacto.
  if (usarV21) {
    try {
      const { buildFurniturePatternSeeds } = require('../experimental/furniture-pattern-seeds.cjs');
      const seeds = buildFurniturePatternSeeds(lineas, { maxFamilies: 12, minTypes: 2, minPieces: 2 });
      for (const seed of seeds) {
        const sub = seed.typeIndexes.map((typeIndex) => ({ ...conRef[typeIndex] }));
        if (!sub.length) continue;
        try {
          const res = optimizar(sub, { ...O, semilla: 50000 + seed.ordinal, pases: 1 });
          for (const p of res.placas) registrar(p, {
            origin: seed.origin,
            familyKey: seed.key,
            familyAxis: seed.axis,
            familyDimension: seed.dimension,
            firstSeenRound: -1,
            sourceRound: -1
          });
        } catch (e) { /* familia no materializable: continuar */ }
      }
    } catch (e) { /* conservar rondas random si falla instrumentacion V21 */ }
  }

  for (let r = 0; r < rondasEfectivas; r++) {
    const sub = r === 0 ? conRef : conRef.filter(() => R() > 0.45);
    if (!sub.length) continue;
    try {
      const res = optimizar(sub.map(l => ({ ...l })), { ...O, semilla: 1000 + r, pases: 2 });
      for (const p of res.placas) registrar(p, usarV21 ? {
        origin: 'random',
        firstSeenRound: r,
        sourceRound: r
      } : null);
    } catch (e) { /* subconjunto invalido: continuar */ }
  }
  console.warn = warn;
  return [...porVector.values()];
}

/* Patrones de un solo tipo: garantizan que exista alguna cobertura exacta, para
   que "no hay solucion" signifique algo real y no un pool incompleto. */
function patronesMonotipo(lineas, O) {
  const out = [];
  const warn = console.warn; console.warn = () => {};
  for (let i = 0; i < lineas.length; i++) {
    try {
      const res = optimizar([{ ...lineas[i], ref: i }], { ...O, pases: 1 });
      const placa = res.placas[0];
      if (placa && placa.colocadas.length)
        out.push({ uso: new Map([[i, placa.colocadas.length]]),
                   area: placa.colocadas.reduce((a, c) => a + c.base * c.altura, 0),
                   placa });
    } catch (e) { /* tipo que no entra en la placa */ }
  }
  console.warn = warn;
  return out;
}

module.exports = { generarPatrones, patronesMonotipo, claveVector };

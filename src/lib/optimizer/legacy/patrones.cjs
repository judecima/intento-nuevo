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
  let patronesDirigidos = 0;

  const registrar = (placa, meta = null) => {
    const uso = new Map();
    for (const c of placa.colocadas) {
      const t = c.pieza.ref;
      if (typeof t !== 'number') return false;
      uso.set(t, (uso.get(t) || 0) + 1);
    }
    if (!uso.size) return false;
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
      return true;
    }
    return false;
  };

  const warn = console.warn; console.warn = () => {};

  // V21b: construir una base geométrica DIRECTA de tiras repetitivas + fillers.
  // No se vuelve a llamar `optimizar()` sobre subconjuntos "inteligentes": ese
  // enfoque ya fue medido y no recupera el caso oro 4058501. Las placas aquí
  // nacen de un constructor guillotina determinista de dos etapas.
  if (usarV21) {
    try {
      const {
        buildRepetitiveFamilyBasis,
        materializeStripRecipe,
      } = require('../experimental/repetitive-family-basis.cjs');
      const recipes = buildRepetitiveFamilyBasis(lineas, O, {
        minRepeat: 4,
        maxFamilies: 12,
        fillersPerFamily: 1,
        maxPatterns: 24,
      });
      for (let i = 0; i < recipes.length; i++) {
        const recipe = recipes[i];
        try {
          const placa = materializeStripRecipe(recipe, lineas, O);
          if (registrar(placa, {
            origin: recipe.origin,
            dominantTypeIndex: recipe.dominantTypeIndex,
            dominantRotated: !!recipe.dominantRotated,
            firstSeenRound: -1,
            sourceRound: -1,
          })) patronesDirigidos++;
        } catch (_error) { /* receta no materializable: continuar */ }
      }
    } catch (_error) { /* conservar las rondas legacy si falla V21 */ }
  }

  // Reducir 40 -> 20 sólo si V21 pudo aportar columnas físicas directas.
  // Si el pedido no tiene estructura repetitiva reconocida, el comportamiento
  // permanece en las rondas legacy y no hereda el riesgo conocido de la ablación.
  const rondasEfectivas = usarV21 && patronesDirigidos > 0 ? Math.min(rondas, 20) : rondas;

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

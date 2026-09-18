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

function combinarPatrones(...grupos) {
  const porVector = new Map();
  for (const grupo of grupos) {
    for (const patron of grupo || []) {
      const k = claveVector(patron.uso);
      const previo = porVector.get(k);
      if (!previo || patron.area > previo.area) porVector.set(k, patron);
    }
  }
  return [...porVector.values()];
}

function usarMascarasUnicasLe4(lineas, O, rondas, semilla) {
  const flag =
    O?.usarMascarasUnicasMasterLe4 === true ||
    /^(1|true|yes|on)$/i.test(String(process.env.OPTIMIZER_MASTER_UNIQUE_MASKS_LE4_EXPERIMENTAL || ''));
  return !!(
    flag &&
    Array.isArray(lineas) &&
    lineas.length >= 1 &&
    lineas.length <= 4 &&
    rondas === 40 &&
    semilla === 7
  );
}

function registrarTelemetriaMascaras(O, ejecutadas, omitidas, total, tipos) {
  if (!O || typeof O !== 'object') return;
  O._patternMaskPolicy = {
    policy: 'first-unique-mask-le4',
    typeCount: tipos,
    totalRounds: total,
    executedRounds: ejecutadas,
    skippedDuplicateRounds: omitidas,
  };
}

/* Oculta subconjuntos de tipos al constructor: asi propone placas que nunca
   elegiria con el pool completo, que son justamente las que el optimo global
   necesita aunque sean peores por placa. */
function generarPatronesJs(lineas, O, rondas = 60, semilla = 7) {
  let s = semilla >>> 0;
  const R = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return (s & 0x7fffffff) / 0x7fffffff; };

  const conRef = lineas.map((l, i) => ({ ...l, ref: i, _refOriginal: l.ref }));
  const porVector = new Map();

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

  const uniqueMasks = usarMascarasUnicasLe4(lineas, O, rondas, semilla);
  const seenMasks = uniqueMasks ? new Set() : null;
  let executedRounds = 0;
  let skippedDuplicateRounds = 0;

  const warn = console.warn; console.warn = () => {};
  for (let r = 0; r < rondas; r++) {
    const sub = r === 0 ? conRef : conRef.filter(() => R() > 0.45);
    if (!sub.length) continue;
    if (seenMasks) {
      const maskKey = sub.map((linea) => linea.ref).join(',');
      if (seenMasks.has(maskKey)) {
        skippedDuplicateRounds++;
        continue;
      }
      seenMasks.add(maskKey);
    }
    executedRounds++;
    try {
      const res = optimizar(sub.map(l => ({ ...l })), { ...O, semilla: 1000 + r, pases: 2 });
      for (const p of res.placas) registrar(p);
    } catch (e) { /* subconjunto invalido: continuar */ }
  }
  console.warn = warn;
  if (uniqueMasks) {
    registrarTelemetriaMascaras(
      O,
      executedRounds,
      skippedDuplicateRounds,
      rondas,
      lineas.length,
    );
  }
  return [...porVector.values()];
}

let rustGenerator = null;
let rustRoundGenerator = null;

function generarPatronesRondasRust(lineas, O, rondasSeleccionadas, rondasTotales = 40, semilla = 7) {
  if (!O || O.usarRustPatternGenerator !== true) {
    throw new Error('OPTIMIZER_MASTER_PREFIX_REQUIRES_RUST');
  }

  if (process.env.OPTIMIZER_RUST_LEGACY_FORCE_FALLBACK === '1') {
    throw new Error('OPTIMIZER_RUST_LEGACY_FORCED_FALLBACK');
  }

  rustRoundGenerator ??= require('./rust/rust-patrones.cjs').generarPatronesLegacyRustHybridRondas;
  if (typeof rustRoundGenerator !== 'function') {
    throw new Error('OPTIMIZER_RUST_LEGACY_ROUND_GENERATOR_UNAVAILABLE');
  }

  const pool = rustRoundGenerator(lineas, O, rondasSeleccionadas, rondasTotales, semilla);
  if (!Array.isArray(pool) || pool.length === 0) {
    throw new Error('OPTIMIZER_RUST_LEGACY_EMPTY_ROUND_POOL');
  }

  O._rustPatternGeneratorUsed = 'rust';
  return pool;
}

function generarPatrones(lineas, O, rondas = 60, semilla = 7) {
  if (!O || O.usarRustPatternGenerator !== true) {
    return generarPatronesJs(lineas, O, rondas, semilla);
  }

  try {
    if (process.env.OPTIMIZER_RUST_LEGACY_FORCE_FALLBACK === '1') {
      throw new Error('OPTIMIZER_RUST_LEGACY_FORCED_FALLBACK');
    }

    rustGenerator ??= require('./rust/rust-patrones.cjs').generarPatronesLegacyRustHybrid;
    if (typeof rustGenerator !== 'function') {
      throw new Error('OPTIMIZER_RUST_LEGACY_GENERATOR_UNAVAILABLE');
    }

    const pool = rustGenerator(lineas, O, rondas, semilla);
    if (!Array.isArray(pool) || pool.length === 0) {
      throw new Error('OPTIMIZER_RUST_LEGACY_EMPTY_POOL');
    }

    O._rustPatternGeneratorUsed = 'rust';
    return pool;
  } catch (error) {
    O._rustPatternGeneratorFallback = true;
    O._rustPatternGeneratorError = error instanceof Error ? error.message : String(error);

    if (process.env.OPTIMIZER_RUST_LEGACY_STRICT === '1') throw error;
    return generarPatronesJs(lineas, O, rondas, semilla);
  }
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

module.exports = {
  generarPatrones,
  generarPatronesJs,
  generarPatronesRondasRust,
  combinarPatrones,
  patronesMonotipo,
  claveVector,
};

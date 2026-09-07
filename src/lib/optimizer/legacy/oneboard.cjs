// Generated mechanically from Optimizador_V10_Interactivo_Modos_Validacion_XML_Lepton.html.
// Do not edit these legacy files by hand; update the extractor if the source changes.
"use strict";

/* OneBoardRescue: problema de FACTIBILIDAD, no de optimizacion.
   -----------------------------------------------------------------
   Se activa solo con una condicion observable en produccion:

       cota inferior por area === 1   y   plan actual > 1 placa

   Ahi sabemos que por superficie todo podria entrar en una placa y que
   nuestro plan no lo logra. No hay que decidir entre placas ni puntuar
   remanentes: solo responder si existe un arbol guillotina que coloque todo.

   Como los cortes de referencia de estos casos usan solo espesores de una
   pieza (k=1), el arbol correcto YA pertenece al espacio generable. Por eso
   se diversifican trayectorias, no primitivas. */
// Requiere el motor exportando ademas: empacarPlaca, orientaciones,
// medidaCorte, hashTexto, DIR_X, DIR_Y.
const M = require('./motor.cjs');

function rescatarUnaPlaca(lineas, config = {}) {
  // Todo parametro leido con opts.x necesita su default aca mismo: sin esto
  // el rescate no ejecuta ninguna corrida y falla en silencio.
  const opts = { pases: 40, semillasRescate: 6, msRescate: 20000, ...config };
  const base = M.optimizar(lineas, { ...config });
  const areaTotal = lineas.reduce((s, l) => s + l.cant * l.base * l.altura, 0);
  const areaPlaca = (config.placaBase - (config.refiladoX || 0)) *
                    (config.placaAltura - (config.refiladoY || 0));
  const cota = Math.ceil(areaTotal / areaPlaca - 1e-9);

  if (base.resumen.placas <= 1 || cota !== 1)
    return { plan: base, baseline: base, activado: false, historial: [] };

  const total = lineas.reduce((s, l) => s + l.cant, 0);
  const historial = [];
  let mejorRestante = Infinity, mejorPlan = null;
  const t0 = Date.now();

  const CR = ['perp', 'exacta', 'area', 'largo'];
  const ordenes = [
    (a, b) => b.base * b.altura - a.base * a.altura,
    (a, b) => Math.max(b.base, b.altura) - Math.max(a.base, a.altura),
    (a, b) => b.altura - a.altura || b.base - a.base,
    (a, b) => b.base - a.base || b.altura - a.altura,
    (a, b) => a.base * a.altura - b.base * b.altura,       // ascendente: no comprometer
    (a, b) => Math.min(a.base, a.altura) - Math.min(b.base, b.altura),
  ];

  let corrida = 0;
  for (let s = 0; s < opts.semillasRescate && Date.now() - t0 < opts.msRescate; s++) {
    for (const c1 of CR) for (const c2 of CR)
      for (const dir of [M.DIR_Y, M.DIR_X])
        for (const multi of [false, true]) {
          if (Date.now() - t0 > opts.msRescate) break;
          const cfg = { criterios: [c1, c2], criterio: c1, dirInicial: dir,
                        ruido: s === 0 ? 0 : 0.3, multiRebanada: multi };
          cfg._id = M.hashTexto(c1 + '>' + c2 + '|' + dir + '|' + multi);
          const res = intentar(lineas, cfg, ordenes[s % ordenes.length], opts, 1000 + s * 97);
          if (!res) continue;
          corrida++;
          const restan = total - res.colocadas.length;
          if (restan < mejorRestante) {
            mejorRestante = restan; mejorPlan = res;
            historial.push({ corrida, restan, ms: Date.now() - t0 });
          }
          if (restan === 0) {
            const plan = comoPlan(res, opts);
            return { plan, baseline: base, activado: true, exito: true,
                     restante: 0, historial, corridas: corrida,
                     ms: Date.now() - t0 };
          }
        }
  }
  return { plan: base, baseline: base, activado: true, exito: false,
           restante: mejorRestante, historial, corridas: corrida,
           ms: Date.now() - t0 };
}

function intentar(lineas, cfg, orden, config, semilla) {
  const piezas = [];
  let id = 0;
  for (let li=0; li<lineas.length; li++) {
    const l=lineas[li];
    for (let k = 0; k < l.cant; k++)
      piezas.push({ id: id++, base: +l.base, altura: +l.altura, detalle: l.detalle || '',
                    veta: !!l.veta, cantos: l.cantos || null, ref: l.ref,
                    _codigoXml: String(l.ref!==undefined && l.ref!==null && l.ref!=='' ? l.ref : li+1) });
  }
  const opts = { placaBase: 2750, placaAltura: 1830, refiladoX: 0, refiladoY: 0,
                 sierra: 4.5, etapas: 4, materialConVeta: false, descontarCanto: false,
                 cantoEspesor: 0, ruido: 0.3, restoMin: 250, restoMax: 400,
                 ...config, ...cfg };
  opts.anchoUtil = opts.placaBase - opts.refiladoX;
  opts.altoUtil = opts.placaAltura - opts.refiladoY;
  const sigs = new Map();
  for (const p of piezas) {
    p._corte = M.medidaCorte(p, opts);
    p._ors = M.orientaciones(p, opts.materialConVeta);
    const k = p._corte.base + '|' + p._corte.altura + '|' + (p.veta ? 1 : 0);
    if (!sigs.has(k)) sigs.set(k, sigs.size);
    p._sig = sigs.get(k);
  }
  opts._vistas = new Set(); opts._cuenta = new Map(); opts._reps = []; opts._medidas = [];
  opts._nSigs = sigs.size; opts._cache = null; opts._stats = { hits: 0, fallos: 0 };
  let sem = semilla >>> 0;
  const rnd = cfg.ruido > 0 ? () => { sem = (Math.imul(sem, 1664525) + 1013904223) >>> 0; return sem / 4294967296; } : null;
  try { return M.empacarPlaca(piezas.slice().sort(orden), opts, rnd); }
  catch (e) { return null; }
}

/* Envuelve el resultado de empacarPlaca en la misma forma que devuelve el
   motor, para que el plan pueda ir al validador y al exportador sin traduccion. */
function comoPlan(res, opts) {
  const cortado = res.colocadas.reduce((a, c) => a + c.base * c.altura, 0);
  const bruto = opts.placaBase * opts.placaAltura;
  return {
    placas: [{ ancho: opts.placaBase - (opts.refiladoX || 0),
               alto: opts.placaAltura - (opts.refiladoY || 0),
               colocadas: res.colocadas, cortes: res.cortes, restos: res.restos, arbol: res.arbol }],
    opts,
    resumen: {
      placas: 1, piezas: res.colocadas.length,
      m2Totales: bruto / 1e6, m2Cortados: cortado / 1e6,
      aprovechamiento: cortado / bruto * 100,
      desperdicio: (1 - cortado / bruto) * 100,
      cortes: res.cortes ? res.cortes.length : 0,
      origen: 'oneboard-rescue',
    },
  };
}

module.exports = { rescatarUnaPlaca, comoPlan };

// Generated mechanically from Optimizador_V10_Interactivo_Remante_Lepton.html.
// Do not edit these legacy files by hand; update the extractor if the source changes.
"use strict";

/* Materializacion: convierte una solucion del master en placas fisicas.
   ------------------------------------------------------------------
   El master decide CUANTAS veces usar cada patron. Para entregar el plan al
   validador y al exportador hacen falta las placas reales, con sus piezas,
   cortes y sobrantes.

   Las placas guardadas en los patrones referencian objetos de pieza de las
   corridas de generacion, no del pedido real. Como dos piezas del mismo tipo
   son intercambiables, se reasignan por indice de tipo. Si algun tipo no
   alcanza, se devuelve null en vez de un plan silenciosamente incorrecto. */

function materializar(planPatrones, lineas, opts) {
  // piezas reales del pedido, agrupadas por tipo
  const porTipo = new Map();
  let id = 0;
  lineas.forEach((l, t) => {
    const arr = [];
    for (let k = 0; k < l.cant; k++)
      arr.push({ id: id++, base: +l.base, altura: +l.altura, detalle: l.detalle || '',
                 veta: !!l.veta, cantos: l.cantos || null, ref: l.ref, tipo: t,
                 // el validador industrial compara contra _corte: sin esto los
                 // chequeos de dimension y veta se saltean en silencio
                 _corte: { base: +l.base, altura: +l.altura },
                 _codigoXml: String(l.ref!==undefined && l.ref!==null && l.ref!=='' ? l.ref : t+1) });
    porTipo.set(t, arr);
  });

  function clonarArbol(n, mapa) {
    if (!n) return null;
    const out = { ...n, partes: [] };
    for (const p of (n.partes || [])) {
      const real = p.pieza && mapa.get(p.pieza.id);
      out.partes.push({ ...p, pieza: real || p.pieza || null, hijo: clonarArbol(p.hijo, mapa) });
    }
    return out;
  }

  const placas = [];
  for (const pat of planPatrones) {
    const colocadas = [];
    const mapaPiezas = new Map();
    for (const c of pat.placa.colocadas) {
      const libres = porTipo.get(c.pieza.ref);
      if (!libres || !libres.length) return null;   // demanda insuficiente
      const real = libres.pop();
      // Conservar la medida de corte que uso el motor al generar este patron.
      // Es importante si hay descuento por tapacanto/trim: usar base/altura
      // nominales produciria falsos invalidos o validaria contra otra medida.
      if (c.pieza && c.pieza._corte) real._corte = { ...c.pieza._corte };
      mapaPiezas.set(c.pieza.id, real);
      colocadas.push({ ...c, pieza: real });
    }
    placas.push({ ancho: pat.placa.ancho, alto: pat.placa.alto, colocadas,
                  cortes: pat.placa.cortes, restos: pat.placa.restos,
                  arbol: clonarArbol(pat.placa.arbol, mapaPiezas) });
  }

  // toda la demanda tiene que quedar consumida: si sobra, el plan no es exacto
  for (const [, libres] of porTipo) if (libres.length) return null;

  const cortado = placas.reduce((s, p) => s + p.colocadas.reduce((a, c) => a + c.base * c.altura, 0), 0);
  const bruto = placas.length * opts.placaBase * opts.placaAltura;
  return {
    placas, opts,
    resumen: {
      placas: placas.length,
      piezas: placas.reduce((s, p) => s + p.colocadas.length, 0),
      m2Totales: bruto / 1e6, m2Cortados: cortado / 1e6,
      aprovechamiento: cortado / bruto * 100,
      desperdicio: (1 - cortado / bruto) * 100,
      cortes: placas.reduce((s, p) => s + (p.cortes ? p.cortes.length : 0), 0),
      origen: 'pattern-master',
    },
  };
}

/* Aceptacion: una sola fuente de verdad para seguridad.
   ------------------------------------------------------------------
   No se valida aca. El unico validador es el industrial V3, que ademas de
   geometria simula la secuencia de cortes y exige que cada pieza quede
   liberada como region exacta. Tener dos validadores distintos es peor que
   tener uno estricto: el debil aprueba planes que el fuerte rechaza.

   Regla: el candidato reemplaza al baseline solo si es VALIDO y usa MENOS
   placas. Empate o invalidez conservan V8, que queda como piso operativo.

   El criterio lexicografico completo (a igual cantidad, mejor remanente) se
   deja para despues de estabilizar: hoy el objetivo es recuperar fallas +1/+2,
   no reabrir el problema de sobrantes. */
function aceptar(baseline, candidato, expectedPieceCount, validarPlanIndustrial) {
  if (!candidato) return { plan: baseline, aceptado: false, motivo: 'sin candidato' };
  if (typeof validarPlanIndustrial !== 'function')
    throw new Error('aceptar() requiere el validador industrial: no hay validacion propia.');

  if (candidato.resumen.placas >= baseline.resumen.placas)
    return { plan: baseline, aceptado: false,
             motivo: candidato.resumen.placas > baseline.resumen.placas ? 'usa mas placas' : 'no mejora' };

  const v = validarPlanIndustrial(candidato, expectedPieceCount);
  if (!v.ok) {
    const causa = !v.geometriaValida ? 'geometria' :
                  !v.secuenciaCompleta ? 'secuencia incompleta' :
                  !v.coberturaCompleta ? 'cobertura' : 'desconocida';
    return { plan: baseline, aceptado: false, motivo: 'invalido: ' + causa, validacion: v };
  }
  return { plan: candidato, aceptado: true, motivo: 'mejor y valido', validacion: v };
}

module.exports = { materializar, aceptar };

// Generated mechanically from Optimizador_V10_Interactivo_Modos_Validacion_XML_Lepton.html.
// Do not edit these legacy files by hand; update the extractor if the source changes.
"use strict";

/* Master problem de cobertura sobre patrones ya generados.
   -----------------------------------------------------------------
   El constructor sabe armar cada placa; lo que falla es elegir la COMBINACION.
   Aca se resuelve eso: dado un pool de patrones (vectores de consumo por tipo),
   buscar el minimo numero de placas que cubre exactamente la demanda.

     min  sum x_p
     s.a. sum a_pi * x_p = demanda_i    para cada tipo i
          x_p entero >= 0

   Se resuelve con ramificacion y acotacion, usando el plan de V8 como
   incumbente inicial: nunca puede devolver algo peor. */

function resolverCobertura(patrones, demanda, areaPlaca, incumbente, limiteMs = 20000) {
  const T = demanda.length;
  // area de cada tipo, para la cota inferior
  // Conservar la placa fisica: sin ella el plan no se puede materializar,
  // validar ni exportar, y la mejora queda como un numero sin respaldo.
  const pats = patrones.map(p => {
    const v = new Array(T).fill(0);
    for (const [i, q] of p.uso) if (i >= 0 && i < T) v[i] = q;
    return { v, area: p.area, uso: p.uso, placa: p.placa };
  }).filter(p => p.v.some(x => x > 0));

  // cobertura maxima de cada tipo en un solo patron: da una segunda cota
  const maxCob = new Array(T).fill(0);
  for (const p of pats) for (let i = 0; i < T; i++) maxCob[i] = Math.max(maxCob[i], p.v[i]);
  for (let i = 0; i < T; i++)
    if (demanda[i] > 0 && maxCob[i] === 0) return null;   // tipo imposible de cubrir

  const t0 = Date.now();
  let mejor = incumbente, mejorPlan = null;
  const memo = new Map();
  let nodos = 0, agotado = false;

  const areaTipo = p => p;   // el area por tipo se pasa aparte

  function cota(rest, areaRest) {
    let lb = Math.ceil(areaRest / areaPlaca - 1e-9);
    for (let i = 0; i < T; i++)
      if (rest[i] > 0) lb = Math.max(lb, Math.ceil(rest[i] / maxCob[i]));
    return lb;
  }

  function dfs(rest, areaRest, usadas, plan) {
    if (Date.now() - t0 > limiteMs) { agotado = true; return; }
    if (areaRest <= 1e-9) {
      if (usadas < mejor) { mejor = usadas; mejorPlan = plan.slice(); }
      return;
    }
    if (usadas + cota(rest, areaRest) >= mejor) return;

    const clave = rest.join(',');
    const previo = memo.get(clave);
    if (previo !== undefined && previo <= usadas) return;
    memo.set(clave, usadas);
    nodos++;

    // ramificar por el tipo mas restringido: el que menos patrones pueden cubrir
    let tipo = -1, mejorRatio = Infinity;
    for (let i = 0; i < T; i++) {
      if (rest[i] <= 0) continue;
      const r = maxCob[i] / rest[i];
      if (r < mejorRatio) { mejorRatio = r; tipo = i; }
    }
    if (tipo < 0) return;

    // candidatos: patrones que cubren ese tipo sin exceder la demanda restante
    const cands = [];
    for (const p of pats) {
      if (p.v[tipo] <= 0) continue;
      let ok = true;
      for (let i = 0; i < T; i++) if (p.v[i] > rest[i]) { ok = false; break; }
      if (ok) cands.push(p);
    }
    cands.sort((a, b) => b.area - a.area);

    for (const p of cands) {
      const nr = rest.slice();
      let da = 0;
      for (let i = 0; i < T; i++) { nr[i] -= p.v[i]; da += p.v[i] * areaPorTipo[i]; }
      plan.push(p);
      dfs(nr, areaRest - da, usadas + 1, plan);
      plan.pop();
      if (Date.now() - t0 > limiteMs) return;
    }
  }

  let areaPorTipo = null;
  return {
    resolver(areaTipos) {
      areaPorTipo = areaTipos;
      const areaTotal = demanda.reduce((s, d, i) => s + d * areaTipos[i], 0);
      dfs(demanda.slice(), areaTotal, 0, []);
      return { placas: mejor, plan: mejorPlan, nodos, agotado };
    }
  };
}

module.exports = { resolverCobertura };

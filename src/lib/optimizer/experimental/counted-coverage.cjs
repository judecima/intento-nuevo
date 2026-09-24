"use strict";

/*
 * Experimental counted coverage solver for serial/repeated demand.
 *
 * Same mathematical master problem as cobertura.cjs:
 *   min sum x_p
 *   s.t. sum a_pi*x_p = demand_i, x_p integer >= 0
 *
 * Difference: one DFS edge can consume k copies of a physical pattern.
 * This keeps search depth tied to pattern changes rather than physical boards.
 * Research-only: production keeps cobertura.cjs unchanged.
 */
function resolverCoberturaContada(patrones, demanda, areaPlaca, incumbente, limiteMs = 20000, control = null) {
  if (!Array.isArray(demanda) || !demanda.length) return null;
  const T = demanda.length;
  const targetRaw = Number(control && control.targetBoards);
  const targetBoards = Number.isFinite(targetRaw) && targetRaw > 0 ? Math.floor(targetRaw) : null;
  const maxNodosRaw = Number(control && control.maxNodos);
  const maxNodos = Number.isFinite(maxNodosRaw) && maxNodosRaw > 0 ? Math.floor(maxNodosRaw) : null;
  const watchdogRaw = Number(control && control.watchdogMs);
  const watchdogMs = Number.isFinite(watchdogRaw) && watchdogRaw > 0 ? watchdogRaw : null;
  const expandPlan = control?.expandPlan !== false;

  const byVector = new Map();
  for (const source of patrones || []) {
    const v = new Array(T).fill(0);
    for (const [i, q] of source?.uso || []) {
      if (i >= 0 && i < T && Number.isFinite(+q) && +q > 0) v[i] = Math.floor(+q);
    }
    if (!v.some(Boolean) || !source?.placa) continue;
    const key = v.join(",");
    const area = Number(source.area) || 0;
    const previous = byVector.get(key);
    if (!previous || area > previous.area) byVector.set(key, { v, area, source });
  }
  const pats = [...byVector.values()];
  if (!pats.length) return null;

  const maxCob = new Array(T).fill(0);
  for (const p of pats) {
    for (let i = 0; i < T; i++) maxCob[i] = Math.max(maxCob[i], p.v[i]);
  }
  for (let i = 0; i < T; i++) {
    if (demanda[i] > 0 && maxCob[i] === 0) return null;
  }

  let areaPorTipo = null;
  const t0 = Date.now();
  let mejor = Number.isFinite(+incumbente) && +incumbente > 0 ? Math.floor(+incumbente) : Number.MAX_SAFE_INTEGER;
  let mejorCounts = null;
  const memo = new Map();
  let nodos = 0;
  let ramasMultiplicidad = 0;
  let agotado = false;
  let targetReached = false;
  let timeout = false;
  let budgetHit = false;
  let watchdogHit = false;

  function stopped() {
    if (targetReached) return true;
    if (maxNodos !== null && nodos >= maxNodos) {
      agotado = true;
      budgetHit = true;
      return true;
    }
    const elapsed = Date.now() - t0;
    if (watchdogMs !== null && elapsed > watchdogMs) {
      agotado = true;
      watchdogHit = true;
      return true;
    }
    if (maxNodos === null && elapsed > limiteMs) {
      agotado = true;
      timeout = true;
      return true;
    }
    return false;
  }

  function cota(rest, areaRest) {
    let lb = Math.ceil(Math.max(0, areaRest) / areaPlaca - 1e-9);
    for (let i = 0; i < T; i++) {
      if (rest[i] > 0) lb = Math.max(lb, Math.ceil(rest[i] / maxCob[i]));
    }
    return lb;
  }

  function maxCopies(p, rest) {
    let k = Number.MAX_SAFE_INTEGER;
    for (let i = 0; i < T; i++) {
      if (p.v[i] <= 0) continue;
      k = Math.min(k, Math.floor(rest[i] / p.v[i]));
    }
    return Number.isFinite(k) ? k : 0;
  }

  function restEmpty(rest) {
    for (let i = 0; i < T; i++) if (rest[i] !== 0) return false;
    return true;
  }

  function dfs(rest, areaRest, usadas, counts) {
    if (targetReached) return;
    if (restEmpty(rest)) {
      if (usadas < mejor) {
        mejor = usadas;
        mejorCounts = counts.map((x) => ({ pattern: x.pattern, count: x.count }));
        if (targetBoards !== null && mejor <= targetBoards) targetReached = true;
      }
      return;
    }
    if (usadas + cota(rest, areaRest) >= mejor) return;
    if (stopped()) return;

    const key = rest.join(",");
    const previous = memo.get(key);
    if (previous !== undefined && previous <= usadas) return;
    memo.set(key, usadas);
    nodos++;

    let tipo = -1;
    let ratio = Infinity;
    for (let i = 0; i < T; i++) {
      if (rest[i] <= 0) continue;
      const current = maxCob[i] / rest[i];
      if (current < ratio) {
        ratio = current;
        tipo = i;
      }
    }
    if (tipo < 0) return;

    const candidates = [];
    for (const p of pats) {
      if (p.v[tipo] <= 0) continue;
      const copies = maxCopies(p, rest);
      if (copies <= 0) continue;
      candidates.push({ p, copies });
    }
    candidates.sort((a, b) =>
      b.copies - a.copies ||
      b.p.area - a.p.area ||
      b.p.v[tipo] - a.p.v[tipo] ||
      a.p.v.join(",").localeCompare(b.p.v.join(","))
    );

    for (const { p, copies } of candidates) {
      for (let k = copies; k >= 1; k--) {
        ramasMultiplicidad++;
        const nr = rest.slice();
        let deltaArea = 0;
        let valid = true;
        for (let i = 0; i < T; i++) {
          const used = p.v[i] * k;
          if (used > nr[i]) {
            valid = false;
            break;
          }
          nr[i] -= used;
          deltaArea += used * areaPorTipo[i];
        }
        if (!valid) continue;
        const nextUsed = usadas + k;
        const nextArea = Math.max(0, areaRest - deltaArea);
        if (nextUsed + cota(nr, nextArea) >= mejor) continue;

        counts.push({ pattern: p.source, count: k });
        dfs(nr, nextArea, nextUsed, counts);
        counts.pop();

        if (targetReached || stopped()) return;
      }
    }
  }

  return {
    resolver(areaTipos) {
      if (!Array.isArray(areaTipos) || areaTipos.length !== T) {
        throw new TypeError("areaTipos incompatible con demanda");
      }
      areaPorTipo = areaTipos.map(Number);
      const areaTotal = demanda.reduce((sum, count, index) => sum + count * areaPorTipo[index], 0);
      dfs(demanda.slice(), areaTotal, 0, []);

      let plan = null;
      if (mejorCounts && expandPlan) {
        plan = [];
        for (const entry of mejorCounts) {
          for (let i = 0; i < entry.count; i++) plan.push(entry.pattern);
        }
      }
      return {
        placas: mejor,
        plan,
        counts: mejorCounts,
        nodos,
        ramasMultiplicidad,
        agotado,
        targetReached,
        timeout,
        budgetHit,
        watchdogHit,
        elapsedMs: Date.now() - t0,
        patterns: pats.length,
      };
    },
  };
}

module.exports = { resolverCoberturaContada };

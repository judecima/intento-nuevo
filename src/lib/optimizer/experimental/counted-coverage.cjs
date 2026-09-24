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

  function applyCopies(p, rest, k) {
    const nr = rest.slice();
    let deltaArea = 0;
    for (let i = 0; i < T; i++) {
      const used = p.v[i] * k;
      if (used > nr[i]) return null;
      nr[i] -= used;
      deltaArea += used * areaPorTipo[i];
    }
    return { rest: nr, deltaArea };
  }

  function pushCount(counts, pattern, count) {
    if (count <= 0) return;
    const previous = counts[counts.length - 1];
    if (previous && previous.pattern === pattern) previous.count += count;
    else counts.push({ pattern, count });
  }

  function buildMonotypeIncumbent() {
    const counts = [];
    let boards = 0;
    for (let type = 0; type < T; type++) {
      let remaining = demanda[type];
      if (remaining <= 0) continue;
      const mono = pats
        .filter((p) => p.v[type] > 0 && p.v.every((value, index) => index === type || value === 0))
        .sort((a, b) => b.v[type] - a.v[type] || b.area - a.area);
      if (!mono.length) return null;
      while (remaining > 0) {
        const candidate = mono.find((p) => p.v[type] <= remaining);
        if (!candidate) return null;
        const copies = Math.floor(remaining / candidate.v[type]);
        const use = Math.max(1, copies);
        pushCount(counts, candidate.source, use);
        boards += use;
        remaining -= candidate.v[type] * use;
      }
    }
    return { boards, counts };
  }

  function preferredMultiplicities(p, rest, areaRest, usadas, maxK) {
    const candidates = new Set();
    for (const raw of [
      maxK,
      Math.floor(maxK * 0.75),
      Math.floor(maxK * 0.5),
      Math.floor(maxK * 0.25),
      1,
    ]) {
      if (raw >= 1 && raw <= maxK) candidates.add(raw);
    }
    const scored = [];
    for (const k of candidates) {
      const applied = applyCopies(p, rest, k);
      if (!applied) continue;
      const nextArea = Math.max(0, areaRest - applied.deltaArea);
      scored.push({
        k,
        projected: usadas + k + cota(applied.rest, nextArea),
      });
    }
    scored.sort((a, b) => a.projected - b.projected || b.k - a.k);
    return scored;
  }

  function buildGreedyIncumbent(seed) {
    const rest = demanda.slice();
    const counts = [];
    let boards = 0;
    let areaRest = demanda.reduce((sum, count, index) => sum + count * areaPorTipo[index], 0);
    let guard = 0;
    const guardLimit = Math.max(64, T * 16);

    while (!restEmpty(rest) && guard++ < guardLimit) {
      let best = null;
      for (const p of pats) {
        const maxK = maxCopies(p, rest);
        if (maxK <= 0) continue;
        for (const { k, projected } of preferredMultiplicities(p, rest, areaRest, boards, maxK)) {
          const applied = applyCopies(p, rest, k);
          if (!applied) continue;
          const density = p.area / areaPlaca;
          const pieces = p.v.reduce((sum, value) => sum + value, 0);
          const candidate = { p, k, projected, density, pieces, applied };
          if (
            !best ||
            candidate.projected < best.projected ||
            (candidate.projected === best.projected && candidate.density > best.density) ||
            (candidate.projected === best.projected && candidate.density === best.density && candidate.pieces > best.pieces)
          ) best = candidate;
        }
      }
      if (!best) break;
      for (let i = 0; i < T; i++) rest[i] = best.applied.rest[i];
      areaRest = Math.max(0, areaRest - best.applied.deltaArea);
      boards += best.k;
      pushCount(counts, best.p.source, best.k);
      if (seed && boards >= seed.boards) return seed;
    }

    if (!restEmpty(rest)) return seed || null;
    if (!seed || boards < seed.boards) return { boards, counts };
    return seed;
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
      const maxK = Math.min(copies, Math.max(0, mejor - usadas - 1));
      if (maxK <= 0) continue;
      const preferred = preferredMultiplicities(p, rest, areaRest, usadas, maxK);
      const bestProjected = preferred.length ? preferred[0].projected : Number.MAX_SAFE_INTEGER;
      candidates.push({ p, maxK, preferred, bestProjected });
    }
    candidates.sort((a, b) =>
      a.bestProjected - b.bestProjected ||
      b.p.area - a.p.area ||
      b.p.v[tipo] - a.p.v[tipo] ||
      a.p.v.join(",").localeCompare(b.p.v.join(","))
    );

    for (const { p, maxK, preferred } of candidates) {
      const ordered = preferred.map((entry) => entry.k);
      const preferredSet = new Set(ordered);
      for (let k = maxK; k >= 1; k--) {
        if (!preferredSet.has(k)) ordered.push(k);
      }

      for (const k of ordered) {
        ramasMultiplicidad++;
        const applied = applyCopies(p, rest, k);
        if (!applied) continue;
        const nextUsed = usadas + k;
        const nextArea = Math.max(0, areaRest - applied.deltaArea);
        if (nextUsed + cota(applied.rest, nextArea) >= mejor) continue;

        counts.push({ pattern: p.source, count: k });
        dfs(applied.rest, nextArea, nextUsed, counts);
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

      const initialIncumbent = mejor;
      const monoSeed = buildMonotypeIncumbent();
      const greedySeed = buildGreedyIncumbent(monoSeed);
      if (greedySeed && greedySeed.boards < mejor) {
        mejor = greedySeed.boards;
        mejorCounts = greedySeed.counts.map((entry) => ({ ...entry }));
        if (targetBoards !== null && mejor <= targetBoards) targetReached = true;
      }

      if (!targetReached) dfs(demanda.slice(), areaTotal, 0, []);

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
        initialIncumbent,
        seededIncumbent: greedySeed?.boards ?? monoSeed?.boards ?? null,
        monotypeIncumbent: monoSeed?.boards ?? null,
      };
    },
  };
}

module.exports = { resolverCoberturaContada };

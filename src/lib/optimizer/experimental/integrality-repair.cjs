"use strict";

// Experimental/offline only. Do not wire into production V10 yet.
// Goal: repair a +1 board integrality gap using a tiny set of mutations
// derived from an early physical pattern pool.

const motor = require("../legacy/motor.cjs");
const { resolverCobertura } = require("../legacy/cobertura.cjs");
const { materializar } = require("../legacy/materializar.cjs");
const { validarPlanIndustrial } = require("../legacy/validador_industrial_v3.cjs");

const { empacarPlaca, orientaciones, medidaCorte, hashTexto, DIR_X, DIR_Y } = motor;

function part1(n) {
  n &= 0xffff;
  n = (n | (n << 8)) & 0x00ff00ff;
  n = (n | (n << 4)) & 0x0f0f0f0f;
  n = (n | (n << 2)) & 0x33333333;
  n = (n | (n << 1)) & 0x55555555;
  return n >>> 0;
}

function mortonCode(x, y) {
  const xi = Math.max(0, Math.min(65535, Math.floor(x * 65535)));
  const yi = Math.max(0, Math.min(65535, Math.floor(y * 65535)));
  return (part1(xi) | (part1(yi) << 1)) >>> 0;
}

function vectorOfPattern(pattern, typeCount) {
  return Array.from({ length: typeCount }, (_, i) => pattern.uso.get(i) || 0);
}

function vectorKey(v) { return v.join(","); }

function createMortonIndex(lineas, opts) {
  const W = opts.placaBase;
  const H = opts.placaAltura;
  const codes = lineas.map((l) => {
    const a = Math.min(+l.base / W, +l.altura / H);
    const b = Math.max(+l.base / W, +l.altura / H);
    return mortonCode(a, b);
  });
  const order = Array.from({ length: lineas.length }, (_, i) => i)
    .sort((a, b) => codes[a] - codes[b] || a - b);
  const pos = Array(lineas.length);
  order.forEach((idx, i) => { pos[idx] = i; });
  return { codes, order, pos };
}

function enumerateReplacePlusTwo({ lineas, opts, basePatterns, demand, radius = 2 }) {
  const T = lineas.length;
  const A = opts.placaBase * opts.placaAltura;
  const areas = lineas.map((l) => +l.base * +l.altura);
  const baseVec = basePatterns.map((p) => vectorOfPattern(p, T));
  const baseKeys = new Set(baseVec.map(vectorKey));
  const { order, pos } = createMortonIndex(lineas, opts);
  const candidates = new Map();

  function area(v) {
    let sum = 0;
    for (let i = 0; i < T; i++) sum += v[i] * areas[i];
    return sum;
  }

  function add(src, v) {
    for (let i = 0; i < T; i++) {
      if (v[i] < 0 || v[i] > demand[i]) return;
    }
    const occ = area(v) / A;
    if (occ < 0.28 || occ > 0.995) return;
    const key = vectorKey(v);
    if (baseKeys.has(key)) return;
    if (!candidates.has(key)) candidates.set(key, { src, op: "replace+2", v: v.slice(), occ });
  }

  for (let si = 0; si < basePatterns.length; si++) {
    const bv = baseVec[si];
    const present = [];
    const absent = new Set();
    for (let i = 0; i < T; i++) {
      if (bv[i] > 0) present.push(i); else absent.add(i);
    }

    for (const i of present) {
      const lo = Math.max(0, pos[i] - radius);
      const hi = Math.min(T - 1, pos[i] + radius);
      const allowed = [];
      for (let q = lo; q <= hi; q++) {
        const j = order[q];
        if (j !== i && absent.has(j)) allowed.push(j);
      }
      if (!allowed.length) continue;

      const remChoices = bv[i] === 1 ? [1] : [1, bv[i]];
      for (const rem of remChoices) {
        for (let a = 0; a < allowed.length; a++) {
          for (let b = a; b < allowed.length; b++) {
            for (const qj of [1, 2]) {
              for (const qk of [1, 2]) {
                const v = bv.slice();
                v[i] -= rem;
                v[allowed[a]] += qj;
                v[allowed[b]] += qk;
                add(si, v);
              }
            }
          }
        }
      }
    }
  }

  return { candidates: [...candidates.values()], baseVec };
}

function industrialFilter(candidates, baseVec, demand, config = {}) {
  const minOcc = config.minOcc ?? 0.80;
  const maxOcc = config.maxOcc ?? 0.93;
  const minClosed = config.minClosed ?? 2;
  const minCloseDelta = config.minCloseDelta ?? 1;
  const minRelativeCoverage = config.minRelativeCoverage ?? 2.5;

  const out = [];
  for (const x of candidates) {
    const src = baseVec[x.src];
    let supp = 0, srcSupp = 0, close = 0, srcClose = 0, frac = 0;
    for (let i = 0; i < demand.length; i++) {
      if (x.v[i]) {
        supp++;
        frac += x.v[i] / demand[i];
        if (x.v[i] === demand[i]) close++;
      }
      if (src[i]) {
        srcSupp++;
        if (src[i] === demand[i]) srcClose++;
      }
    }
    const supportDelta = supp - srcSupp;
    const closeDelta = close - srcClose;
    if (supportDelta !== 2 || close < minClosed || closeDelta < minCloseDelta ||
        frac < minRelativeCoverage || x.occ < minOcc || x.occ > maxOcc) continue;

    const score = 2 * close + 1.5 * closeDelta + supportDelta + 0.5 * frac + 0.5 * x.occ;
    out.push({ ...x, supportDelta, close, closeDelta, frac, score });
  }
  out.sort((a, b) => b.score - a.score || b.occ - a.occ || vectorKey(a.v).localeCompare(vectorKey(b.v)));
  return out;
}

function encodeMixedRadixFactory(demand) {
  const weights = [];
  let mul = 1n;
  for (let i = 0; i < demand.length; i++) {
    weights[i] = mul;
    mul *= BigInt(demand[i] + 1);
  }
  return function encode(v) {
    let z = 0n;
    for (let i = 0; i < v.length; i++) z += BigInt(v[i]) * weights[i];
    return z;
  };
}

function buildExactKSums(baseVec, demand, k) {
  const T = demand.length;
  const encode = encodeMixedRadixFactory(demand);
  let states = [new Uint16Array(T)];
  let codes = new Set([0n]);
  for (let step = 0; step < k; step++) {
    const nextCodes = new Set();
    const nextStates = [];
    for (const st of states) {
      for (const col of baseVec) {
        const v = new Uint16Array(T);
        let ok = true;
        for (let i = 0; i < T; i++) {
          const q = st[i] + col[i];
          if (q > demand[i]) { ok = false; break; }
          v[i] = q;
        }
        if (!ok) continue;
        const code = encode(v);
        if (nextCodes.has(code)) continue;
        nextCodes.add(code);
        nextStates.push(v);
      }
    }
    states = nextStates;
    codes = nextCodes;
  }
  return { codes, encode };
}

function exactRepairSieve(candidates, baseVec, demand, targetBoards, config = {}) {
  const k = targetBoards - 1;
  const maxK = config.maxExactK ?? 4;
  if (k < 0 || k > maxK) return { applied: false, candidates, buildMs: 0, queryMs: 0, states: 0 };

  const tb = Date.now();
  const { codes, encode } = buildExactKSums(baseVec, demand, k);
  const buildMs = Date.now() - tb;
  const tq = Date.now();
  const passed = [];
  for (const x of candidates) {
    const rem = demand.map((q, i) => q - x.v[i]);
    if (rem.some((q) => q < 0)) continue;
    if (codes.has(encode(rem))) passed.push(x);
  }
  return { applied: true, candidates: passed, buildMs, queryMs: Date.now() - tq, states: codes.size };
}

function directPackVector(v, lineas, opts, config = {}) {
  const T = lineas.length;
  const piezas = [];
  let pid = 0;
  const packOpts = {
    placaBase: opts.placaBase,
    placaAltura: opts.placaAltura,
    refiladoX: opts.refiladoX || 0,
    refiladoY: opts.refiladoY || 0,
    sierra: opts.sierra || 0,
    etapas: opts.etapas || 4,
    materialConVeta: !!opts.materialConVeta,
    descontarCanto: !!opts.descontarCanto,
    cantoEspesor: opts.cantoEspesor || 0,
    ruido: 0,
    pases: 4,
    restartsPorPlaca: 14,
    restoMin: opts.restoMin ?? 250,
    restoMax: opts.restoMax ?? 400,
    tolerancia: opts.tolerancia ?? 0.02,
    beamWidth: 5,
    maxPiezasBeam: opts.maxPiezasBeam || 120,
    presupuestoBeamMs: config.presupuestoBeamMs ?? 1500,
    maxPiezasCache: 0,
    semilla: config.semilla ?? 20260812,
    preferirMenorProfundidad: true,
    usarRescue: false,
    multiRebanada: false,
    multiVariantes: false,
  };

  for (let i = 0; i < T; i++) {
    for (let k = 0; k < v[i]; k++) {
      const l = lineas[i];
      piezas.push({
        id: pid++, base: +l.base, altura: +l.altura, detalle: l.detalle || "",
        veta: !!l.veta, cantos: l.cantos || null, ref: i, _codigoXml: String(i),
      });
    }
  }
  for (const p of piezas) p._corte = medidaCorte(p, packOpts);
  const sigs = new Map();
  for (const p of piezas) {
    p._ors = orientaciones(p, packOpts.materialConVeta);
    const kk = p._corte.base + "|" + p._corte.altura + "|" + (p.veta ? 1 : 0);
    if (!sigs.has(kk)) sigs.set(kk, sigs.size);
    p._sig = sigs.get(kk);
  }
  Object.assign(packOpts, {
    _vistas: new Set(), _cuenta: new Map(), _reps: [], _medidas: [],
    _nSigs: sigs.size, _cache: null, _stats: { hits: 0, fallos: 0 },
    anchoUtil: packOpts.placaBase - (packOpts.refiladoX || 0) * 2,
    altoUtil: packOpts.placaAltura - (packOpts.refiladoY || 0) * 2,
  });

  const SIM = ["perp", "exacta", "area", "largo"];
  const CROSS = [["largo", "perp"], ["perp", "area"], ["area", "perp"], ["largo", "area"]];
  const cfgs = [];
  for (const cc of SIM) for (const dir of [DIR_Y, DIR_X]) cfgs.push({ criterios: [cc, cc], criterio: cc, dirInicial: dir, ruido: 0 });
  for (const [a, b] of CROSS) for (const dir of [DIR_Y, DIR_X]) cfgs.push({ criterios: [a, b], criterio: a, dirInicial: dir, ruido: 0 });
  for (const cfg of cfgs) cfg._id = hashTexto(cfg.criterios.join(">") + "|" + cfg.dirInicial + "|det");

  const orders = [
    (a, b) => b.base * b.altura - a.base * a.altura,
    (a, b) => Math.max(b.base, b.altura) - Math.max(a.base, a.altura),
    (a, b) => b.altura - a.altura || b.base - a.base,
    (a, b) => b.base - a.base || b.altura - a.altura,
  ];

  for (const ord of orders) {
    const pool = piezas.slice().sort(ord);
    for (const cfg of cfgs) {
      for (const etapas of [2, 3, 4]) {
        const r = empacarPlaca(pool, { ...packOpts, ...cfg, etapas }, null);
        if (r.colocadas.length === piezas.length) {
          return { ...r, ancho: opts.placaBase, alto: opts.placaAltura };
        }
      }
    }
  }
  return null;
}

function makePatternFromPacked(v, packed) {
  return {
    uso: new Map(v.map((q, i) => [i, q]).filter(([, q]) => q > 0)),
    area: packed.colocadas.reduce((s, z) => s + z.base * z.altura, 0),
    placa: packed,
    _industrialRepair: true,
  };
}

function runIntegralityRepair({ lineas, opts, basePatterns, baseSolution, config = {} }) {
  const started = Date.now();
  const demand = lineas.map((l) => l.cant);
  const areas = lineas.map((l) => +l.base * +l.altura);
  const boardArea = opts.placaBase * opts.placaAltura;
  const lowerBound = Math.ceil(demand.reduce((s, q, i) => s + q * areas[i], 0) / boardArea - 1e-9);
  const baseBoards = baseSolution?.placas;

  if (!baseSolution || !Number.isFinite(baseBoards)) return { improved: false, reason: "no-base-solution" };
  if (baseBoards <= lowerBound) return { improved: false, reason: "at-lower-bound", lowerBound, baseBoards };

  const radii = config.radii || [2, 3, 4];
  const physicalQuota = config.physicalQuota ?? 4;
  const maxLogicalToPack = config.maxLogicalToPack ?? 24;
  const useExactWhenTargetAtMost = config.useExactWhenTargetAtMost ?? 5;
  const bbMs = config.bbMs ?? 8000;
  const expectedPieces = demand.reduce((a, b) => a + b, 0);

  for (const radius of radii) {
    const tGen = Date.now();
    const { candidates, baseVec } = enumerateReplacePlusTwo({ lineas, opts, basePatterns, demand, radius });
    const generated = candidates.length;
    const filtered = industrialFilter(candidates, baseVec, demand, config.filter);
    const genMs = Date.now() - tGen;
    if (!filtered.length) continue;

    let survivors = filtered;
    let sieve = { applied: false, buildMs: 0, queryMs: 0, states: 0 };
    const targetBoards = baseBoards - 1;
    if (targetBoards <= useExactWhenTargetAtMost) {
      sieve = exactRepairSieve(filtered, baseVec, demand, targetBoards, { maxExactK: 4 });
      survivors = sieve.candidates;
      if (!survivors.length) {
        return {
          improved: false, reason: "exact-sieve-proved-no-one-column-repair",
          lowerBound, baseBoards, radius, generated, filtered: filtered.length,
          sieve: { ...sieve, candidates: undefined }, totalMs: Date.now() - started,
        };
      }
    }

    const physical = [];
    const tMat = Date.now();
    let attempts = 0;
    for (const x of survivors) {
      if (attempts >= maxLogicalToPack || physical.length >= physicalQuota) break;
      attempts++;
      const packed = directPackVector(x.v, lineas, opts, config.materialize);
      if (packed) physical.push({ pattern: makePatternFromPacked(x.v, packed), meta: x });
    }
    const matMs = Date.now() - tMat;
    if (!physical.length) continue;

    const pool = basePatterns.concat(physical.map((x) => x.pattern));
    const solver = resolverCobertura(pool, demand, boardArea, baseBoards, bbMs);
    const tSolve = Date.now();
    const sol = solver ? solver.resolver(areas) : null;
    const solveMs = Date.now() - tSolve;
    if (!sol || !sol.plan || sol.placas >= baseBoards) continue;

    const materialized = materializar(sol.plan, lineas, opts);
    const validation = materialized ? validarPlanIndustrial(materialized, expectedPieces) : { ok: false };
    if (!validation.ok) continue;

    return {
      improved: true,
      lowerBound,
      baseBoards,
      boards: sol.placas,
      nodes: sol.nodos,
      exhausted: sol.agotado,
      radius,
      generated,
      filtered: filtered.length,
      survivors: survivors.length,
      physicalAttempts: attempts,
      physicalAdded: physical.length,
      genMs,
      sieve: { applied: sieve.applied, buildMs: sieve.buildMs, queryMs: sieve.queryMs, states: sieve.states },
      matMs,
      solveMs,
      totalMs: Date.now() - started,
      validation,
      plan: materialized,
      selectedMutations: physical.map((x) => ({ v: x.meta.v, score: x.meta.score, src: x.meta.src, occ: x.meta.occ })),
    };
  }

  return { improved: false, reason: "no-improvement", lowerBound, baseBoards, totalMs: Date.now() - started };
}

module.exports = {
  mortonCode,
  createMortonIndex,
  enumerateReplacePlusTwo,
  industrialFilter,
  exactRepairSieve,
  directPackVector,
  runIntegralityRepair,
};

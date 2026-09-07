"use strict";

const {
  optimizar,
  calidadRestos,
  compararCalidad,
  calidadPlanPlacas,
} = require("../legacy/motor.cjs");
const { validarPlanIndustrial } = require("../legacy/validador_industrial_v3.cjs");

/**
 * Experimental V20 remnant repair.
 *
 * It NEVER moves pieces between boards. Each physical board is rebuilt as an
 * independent one-board subproblem and is accepted only when:
 *   1) the candidate still uses exactly one board;
 *   2) the one-board candidate has strictly better industrial remnant quality;
 *   3) the final whole plan passes the industrial validator.
 *
 * This module is intentionally not wired into v10.cjs yet. First it must prove
 * that it recovers the equal-board remnant improvements that V20 currently
 * loses by returning before global compactation.
 */
function defragmentarPlanPorPlaca(plan, options = {}) {
  if (!plan || !Array.isArray(plan.placas) || !plan.opts) {
    return {
      plan,
      changed: false,
      attemptedBoards: 0,
      improvedBoards: 0,
      rejectedBoards: 0,
      invalidFinal: false,
      ms: 0,
    };
  }

  const started = process.hrtime.bigint();
  const opts = plan.opts;
  const nuevas = [];
  let attemptedBoards = 0;
  let improvedBoards = 0;
  let rejectedBoards = 0;

  for (let i = 0; i < plan.placas.length; i++) {
    const original = plan.placas[i];
    const lineas = lineasDesdePlaca(original);

    if (!lineas.length) {
      nuevas.push(original);
      continue;
    }

    attemptedBoards++;
    let candidato = null;
    try {
      const cfg = configLimpia(opts);
      const deltasEstructurales = detectarDeltasEstructurales(lineas, cfg);
      candidato = optimizar(lineas, {
        ...cfg,
        multiVariantes: false,
        penalizarFranjaMuerta: true,
        deltasEstructurales,
        // Deterministic but plate-specific seed. This avoids coupling the result
        // of one plate with how many plates preceded it in the order.
        semilla: (Number(cfg.semilla) || 20260812) + 700001 + i,
      });
    } catch (_) {
      candidato = null;
    }

    if (!candidato || !Array.isArray(candidato.placas) || candidato.placas.length !== 1) {
      nuevas.push(original);
      rejectedBoards++;
      continue;
    }

    const nuevaPlaca = candidato.placas[0];
    const qOriginal = calidadRestos(original.restos || [], opts);
    const qCandidato = calidadRestos(nuevaPlaca.restos || [], opts);

    if (compararCalidad(qCandidato, qOriginal) > 0) {
      nuevas.push(nuevaPlaca);
      improvedBoards++;
    } else {
      nuevas.push(original);
    }
  }

  const candidatoPlan = {
    ...plan,
    placas: nuevas,
    resumen: {
      ...(plan.resumen || {}),
      placas: nuevas.length,
      calidadRemanente: calidadPlanPlacas(nuevas, opts),
    },
  };

  const piezasEsperadas = Number.isFinite(+options.piezasEsperadas)
    ? +options.piezasEsperadas
    : nuevas.reduce((sum, placa) => sum + ((placa && placa.colocadas) || []).length, 0);
  const validacion = validarPlanIndustrial(candidatoPlan, piezasEsperadas);

  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  if (!validacion || !validacion.ok) {
    return {
      plan,
      changed: false,
      attemptedBoards,
      improvedBoards: 0,
      rejectedBoards,
      invalidFinal: true,
      validation: validacion || null,
      ms,
    };
  }

  return {
    plan: candidatoPlan,
    changed: improvedBoards > 0,
    attemptedBoards,
    improvedBoards,
    rejectedBoards,
    invalidFinal: false,
    validation: validacion,
    ms,
  };
}

/** Reference implementation of the compactation pass currently skipped by V20. */
function compactacionGlobalReferencia(lineas, config) {
  const started = process.hrtime.bigint();
  try {
    const cfg = configLimpia(config);
    const deltasEstructurales = detectarDeltasEstructurales(lineas, cfg);
    const plan = optimizar(lineas, {
      ...cfg,
      multiVariantes: false,
      penalizarFranjaMuerta: true,
      deltasEstructurales,
    });
    return {
      plan,
      ms: Number(process.hrtime.bigint() - started) / 1e6,
      error: null,
    };
  } catch (error) {
    return {
      plan: null,
      ms: Number(process.hrtime.bigint() - started) / 1e6,
      error: String(error && error.message ? error.message : error),
    };
  }
}

function lineasDesdePlaca(placa) {
  const grupos = new Map();
  for (const colocada of (placa && placa.colocadas) || []) {
    const p = colocada && colocada.pieza ? colocada.pieza : null;
    if (!p) continue;

    const cantos = p.cantos || null;
    const key = JSON.stringify([
      p.ref ?? p._codigoXml ?? null,
      +p.base,
      +p.altura,
      !!p.veta,
      p.detalle || "",
      cantos ? !!cantos.arr : false,
      cantos ? !!cantos.aba : false,
      cantos ? !!cantos.izq : false,
      cantos ? !!cantos.der : false,
    ]);

    let g = grupos.get(key);
    if (!g) {
      g = {
        ref: p.ref ?? p._codigoXml ?? grupos.size + 1,
        detalle: p.detalle || "",
        cant: 0,
        base: +p.base,
        altura: +p.altura,
        veta: !!p.veta,
        cantos: cantos
          ? {
              arr: !!cantos.arr,
              aba: !!cantos.aba,
              izq: !!cantos.izq,
              der: !!cantos.der,
            }
          : null,
      };
      grupos.set(key, g);
    }
    g.cant++;
  }
  return [...grupos.values()];
}

// Same structural-delta detector used by V10 global dead-strip compactation.
function detectarDeltasEstructurales(lineas, O) {
  const restoMin = +O.restoMin || 60;
  const saw = +O.sierra || 0;
  const candidatos = [];

  for (let i = 0; i < lineas.length; i++) {
    const li = lineas[i];
    const oriI = [{ a: +li.base, b: +li.altura }];
    if (!(O.materialConVeta && li.veta) && Math.abs(+li.base - +li.altura) > 1e-9) {
      oriI.push({ a: +li.altura, b: +li.base });
    }

    for (let j = i + 1; j < lineas.length; j++) {
      const lj = lineas[j];
      const oriJ = [{ a: +lj.base, b: +lj.altura }];
      if (!(O.materialConVeta && lj.veta) && Math.abs(+lj.base - +lj.altura) > 1e-9) {
        oriJ.push({ a: +lj.altura, b: +lj.base });
      }

      for (const oi of oriI) for (const oj of oriJ) {
        if (Math.abs(oi.b - oj.b) > Math.max(1, saw + 0.5)) continue;
        const delta = Math.abs(oi.a - oj.a);
        if (delta <= Math.max(10, saw) || delta >= restoMin) continue;
        candidatos.push(delta);
      }
    }
  }

  const cnt = new Map();
  for (const d of candidatos) {
    const k = Math.round(d * 10) / 10;
    cnt.set(k, (cnt.get(k) || 0) + 1);
  }

  return [...cnt.entries()]
    .filter(([, n]) => n >= 2)
    .map(([delta, n]) => ({ delta, n }))
    .sort((a, b) => b.n - a.n || a.delta - b.delta);
}

function configLimpia(config) {
  const out = { ...(config || {}) };
  for (const key of Object.keys(out)) {
    if (key.startsWith("_")) delete out[key];
  }
  return out;
}

module.exports = {
  defragmentarPlanPorPlaca,
  compactacionGlobalReferencia,
  lineasDesdePlaca,
  detectarDeltasEstructurales,
};

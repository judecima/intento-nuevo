"use strict";

// Experimental/offline only.
// Apples-to-apples V10 path:
//   pre-master V10 (same baseline/compactation/multislice/oneboard)
//   -> Pattern Master rounds 0..19
//   -> Integrality Repair
//   -> only if needed, incremental Pattern Master rounds 20..39
// Production legacy files remain untouched.

const motor = require("../legacy/motor.cjs");
const legacyV10 = require("../legacy/v10.cjs");
const { generarPatrones, patronesMonotipo, claveVector } = require("../legacy/patrones.cjs");
const { resolverCobertura } = require("../legacy/cobertura.cjs");
const { materializar, aceptar } = require("../legacy/materializar.cjs");
const { validarPlanIndustrial } = require("../legacy/validador_industrial_v3.cjs");
const { rescatarUnaPlaca } = require("../legacy/oneboard.cjs");
const { runIntegralityRepair } = require("./integrality-repair.cjs");
const { computeHybridLowerBound } = require("./hybrid-lower-bound.cjs");

const { optimizar } = motor;

function dedupPatterns(patterns) {
  const byKey = new Map();
  for (const p of patterns || []) {
    if (!p || !p.uso || !p.placa) continue;
    const k = claveVector(p.uso);
    const prev = byKey.get(k);
    if (!prev || (+p.area || 0) > (+prev.area || 0)) byKey.set(k, p);
  }
  return [...byKey.values()];
}

function generarPatronesRango(lineas, O, startRound, endRound, semilla = 7) {
  let s = semilla >>> 0;
  const R = () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return (s & 0x7fffffff) / 0x7fffffff;
  };
  const conRef = lineas.map((l, i) => ({ ...l, ref: i, _refOriginal: l.ref }));
  const porVector = new Map();

  const registrar = (placa) => {
    const uso = new Map();
    for (const c of placa.colocadas || []) {
      const t = c.pieza?.ref;
      if (typeof t !== "number") return;
      uso.set(t, (uso.get(t) || 0) + 1);
    }
    if (!uso.size) return;
    const area = (placa.colocadas || []).reduce((a, c) => a + c.base * c.altura, 0);
    const k = claveVector(uso);
    const prev = porVector.get(k);
    if (!prev || area > prev.area) porVector.set(k, { uso, area, placa });
  };

  const warn = console.warn;
  console.warn = () => {};
  try {
    for (let r = 0; r < endRound; r++) {
      let sub;
      if (r === 0) sub = conRef;
      else sub = conRef.filter(() => R() > 0.45);
      if (r < startRound || !sub.length) continue;
      try {
        const res = optimizar(sub.map((l) => ({ ...l })), { ...O, semilla: 1000 + r, pases: 2 });
        for (const p of res.placas || []) registrar(p);
      } catch (_) {}
    }
  } finally {
    console.warn = warn;
  }
  return [...porVector.values()];
}

function areaLowerBound(lineas, config) {
  const total = lineas.reduce((s, l) => s + (+l.cant || 0) * (+l.base || 0) * (+l.altura || 0), 0);
  const area = (config.placaBase - (config.refiladoX || 0)) *
               (config.placaAltura - (config.refiladoY || 0));
  return Math.ceil(total / area - 1e-9);
}

function solveMaster(pool, lineas, config, incumbentBoards, ms) {
  const demand = lineas.map((l) => +l.cant || 0);
  const areas = lineas.map((l) => (+l.base || 0) * (+l.altura || 0));
  const areaPlaca = (config.placaBase - (config.refiladoX || 0)) *
                    (config.placaAltura - (config.refiladoY || 0));
  const t = Date.now();
  const solver = resolverCobertura(pool, demand, areaPlaca, incumbentBoards, ms);
  const sol = solver ? solver.resolver(areas) : null;
  return { sol, solveMs: Date.now() - t };
}

function acceptBoardsOnly(currentPlan, candidate, expectedPieces) {
  if (!candidate) return { plan: currentPlan, accepted: false, reason: "no-candidate" };
  const r = aceptar(currentPlan, candidate, expectedPieces, validarPlanIndustrial);
  return { plan: r.plan, accepted: r.aceptado, reason: r.motivo, validation: r.validacion };
}

function acceptLexicographic(currentPlan, candidate, expectedPieces) {
  if (!candidate || !candidate.resumen) return { plan: currentPlan, accepted: false, reason: "no-candidate" };
  const validation = validarPlanIndustrial(candidate, expectedPieces);
  if (!validation.ok) return { plan: currentPlan, accepted: false, reason: "invalid", validation };
  const cb = candidate.resumen.placas, bb = currentPlan.resumen.placas;
  if (cb < bb) return { plan: candidate, accepted: true, reason: "fewer-boards", validation };
  if (cb > bb) return { plan: currentPlan, accepted: false, reason: "more-boards", validation };
  const cq = motor.calidadPlanPlacas(candidate.placas || [], candidate.opts || currentPlan.opts || {});
  const bq = motor.calidadPlanPlacas(currentPlan.placas || [], currentPlan.opts || candidate.opts || {});
  if (motor.compararCalidad(cq, bq) > 0)
    return { plan: candidate, accepted: true, reason: "same-boards-better-remnant", validation };
  return { plan: currentPlan, accepted: false, reason: "same-boards-not-better", validation };
}

function runV10HybridPipeline(lineas, config, options = {}) {
  const started = Date.now();
  const expectedPieces = lineas.reduce((s, l) => s + (+l.cant || 0), 0);
  const cota = areaLowerBound(lineas, config);
  const firstRounds = options.firstRounds ?? 20;
  const totalRounds = options.totalRounds ?? 40;
  const masterMs = options.masterMs ?? config.msMaster ?? 8000;
  const fallbackMasterMs = options.fallbackMasterMs ?? config.msMaster ?? 8000;
  const enableStrongLowerBound = options.enableStrongLowerBound !== false;
  const enablePreMultisliceCertification = options.enablePreMultisliceCertification !== false;
  const enableRasterLowerBound = options.enableRasterLowerBound !== false;
  const enableRepair = options.enableRepair !== false;
  const repairMaxTypes = options.repairMaxTypes ?? 16;
  const enableIncrementalMaster = options.enableIncrementalMaster !== false;

  const metrics = {
    cota,
    preMasterMs: 0,
    baselineCompactMs: 0,
    preMultisliceCertified: false,
    multisliceMs: 0,
    multisliceAccepted: false,
    oneboardMs: 0,
    oneboardAccepted: false,
    rounds20GenMs: 0,
    rounds20Pool: 0,
    rounds20SolveMs: 0,
    rounds20Nodes: 0,
    rounds20Exhausted: false,
    rounds20Accepted: false,
    repairMs: 0,
    repairImproved: false,
    repairReason: null,
    repairRadius: null,
    repairPhysicalAdded: 0,
    fallbackNeeded: false,
    fallbackGenMs: 0,
    fallbackExtraPool: 0,
    fallbackCombinedPool: 0,
    fallbackSolveMs: 0,
    fallbackNodes: 0,
    fallbackExhausted: false,
    fallbackAccepted: false,
    strongLowerBoundEnabled: enableStrongLowerBound,
    preMultisliceCertificationEnabled: enablePreMultisliceCertification,
    repairEnabled: enableRepair,
    repairMaxTypes,
    repairEligible: enableRepair && lineas.length <= repairMaxTypes,
    incrementalMasterEnabled: enableIncrementalMaster,
    totalMs: 0,
  };

  const tp = Date.now();
  const pre = legacyV10.optimizarV10(
    lineas,
    { ...config, usarMaster: false, usarMultiSlice: false, usarOneBoard: false },
    legacyV10.nuevasMetricas(),
  );
  metrics.baselineCompactMs = Date.now() - tp;
  let best = pre.plan;
  const preMasterBoards = best?.resumen?.placas ?? null;
  if (!best || !best.resumen) {
    metrics.preMasterMs = Date.now() - tp;
    metrics.totalMs = Date.now() - started;
    return { plan: best, cota, metrics, reason: "no-pre-master-plan" };
  }

  if (best.resumen.placas <= cota || config.usarMaster === false) {
    metrics.preMasterMs = Date.now() - tp;
    metrics.totalMs = Date.now() - started;
    return { plan: best, cota, metrics, reason: "baseline-compact-at-lower-bound" };
  }

  let strong = { lowerBound: cota, reason: "area-only-disabled" };
  if (enableStrongLowerBound) {
    const tLb0 = Date.now();
    strong = computeHybridLowerBound(lineas, best.opts || config, best.resumen.placas, {
      ...(options.strongLowerBound || {}),
      useRaster: enableRasterLowerBound,
      rasterMaxPieces: options.rasterMaxPieces ?? 40,
      rasterMaxTypes: options.rasterMaxTypes ?? 16,
    });
    metrics.strongLowerBoundRasterEligible = enableRasterLowerBound && !strong.rasterOmittedByPolicy;
    metrics.strongLowerBoundRasterOmittedByPolicy = !!strong.rasterOmittedByPolicy;
    metrics.strongLowerBound = strong.lowerBound;
    metrics.strongLowerBoundReason = strong.reason;
    metrics.strongLowerBoundCheap = strong.cheapLowerBound;
    metrics.strongLowerBoundCheapCertified = strong.cheapCertified;
    metrics.strongLowerBoundRasterRan = strong.rasterRan;
    metrics.strongLowerBoundDetailedMs = strong.timingsMs;
    metrics.strongLowerBoundMs = Date.now() - tLb0;
    if (enablePreMultisliceCertification && strong.lowerBound >= best.resumen.placas) {
      metrics.preMultisliceCertified = true;
      metrics.preMasterMs = Date.now() - tp;
      metrics.totalMs = Date.now() - started;
      return { plan: best, cota, metrics, reason: "strong-lower-bound-certified-pre-multislice", strongLowerBound: strong };
    }
  } else {
    metrics.strongLowerBound = cota;
    metrics.strongLowerBoundReason = "disabled";
    metrics.strongLowerBoundMs = 0;
  }

  if (config.usarMultiSlice !== false) {
    const tm = Date.now();
    let alt = null;
    try { alt = optimizar(lineas, { ...config, multiVariantes: true }); } catch (_) {}
    metrics.multisliceMs = Date.now() - tm;
    if (alt) {
      const acc = acceptBoardsOnly(best, alt, expectedPieces);
      best = acc.plan;
      metrics.multisliceAccepted = acc.accepted;
    }
  }

  if (best.resumen.placas <= cota || (enableStrongLowerBound && strong.lowerBound >= best.resumen.placas)) {
    metrics.preMasterMs = Date.now() - tp;
    metrics.totalMs = Date.now() - started;
    return { plan: best, cota, metrics, reason: best.resumen.placas <= cota ? "multislice-at-lower-bound" : "strong-lower-bound-certified-after-multislice", strongLowerBound: strong };
  }

  if (config.usarOneBoard !== false && cota === 1 && best.resumen.placas > 1) {
    const to = Date.now();
    let res = null;
    try { res = rescatarUnaPlaca(lineas, config); } catch (_) {}
    metrics.oneboardMs = Date.now() - to;
    if (res?.exito && res.plan) {
      const acc = acceptBoardsOnly(best, res.plan, expectedPieces);
      best = acc.plan;
      metrics.oneboardAccepted = acc.accepted;
    }
  }

  metrics.preMasterMs = Date.now() - tp;
  if (best.resumen.placas <= cota) {
    metrics.totalMs = Date.now() - started;
    return { plan: best, cota, metrics, reason: "oneboard-at-lower-bound", strongLowerBound: strong };
  }

  let mono = null;
  let pool20;
  if (Array.isArray(options.persistedPool20)) {
    pool20 = dedupPatterns(options.persistedPool20);
    metrics.rounds20GenMs = 0;
    metrics.rounds20PoolSource = "persisted";
  } else {
    const tg20 = Date.now();
    const random20 = generarPatrones(lineas, config, firstRounds);
    mono = patronesMonotipo(lineas, config);
    pool20 = dedupPatterns(random20.concat(mono));
    metrics.rounds20GenMs = Date.now() - tg20;
    metrics.rounds20PoolSource = "generated";
    if (typeof options.onPool20 === "function") options.onPool20(pool20);
  }
  metrics.rounds20Pool = pool20.length;

  const s20 = solveMaster(pool20, lineas, config, best.resumen.placas, masterMs);
  metrics.rounds20SolveMs = s20.solveMs;
  metrics.rounds20Nodes = s20.sol?.nodos || 0;
  metrics.rounds20Exhausted = !!s20.sol?.agotado;
  if (s20.sol?.plan && s20.sol.placas < best.resumen.placas) {
    const cand20 = materializar(s20.sol.plan, lineas, best.opts || config);
    const acc20 = acceptBoardsOnly(best, cand20, expectedPieces);
    best = acc20.plan;
    metrics.rounds20Accepted = acc20.accepted;
  }

  if (best.resumen.placas <= cota) {
    metrics.totalMs = Date.now() - started;
    return { plan: best, cota, metrics, reason: "rounds20-at-lower-bound", pool20 };
  }

  if (enableStrongLowerBound && strong.lowerBound >= best.resumen.placas) {
    metrics.totalMs = Date.now() - started;
    return { plan: best, cota, metrics, reason: "strong-lower-bound-certified-after-20", pool20, strongLowerBound: strong };
  }

  const repairEligible = enableRepair && lineas.length <= repairMaxTypes;
  let repair = { improved: false, reason: enableRepair ? (repairEligible ? "not-run" : "omitted-by-type-policy") : "disabled", physicalAdded: 0 };
  metrics.repairEligible = repairEligible;
  metrics.repairOmittedByPolicy = enableRepair && !repairEligible;
  if (repairEligible) {
    const tr = Date.now();
    repair = runIntegralityRepair({
      lineas,
      opts: best.opts || config,
      basePatterns: pool20,
      baseSolution: { placas: best.resumen.placas },
      config: {
        radii: options.repairRadii || [2, 3, 4],
        physicalQuota: options.physicalQuota ?? 4,
        maxLogicalToPack: options.maxLogicalToPack ?? 24,
        useExactWhenTargetAtMost: options.useExactWhenTargetAtMost ?? 5,
        bbMs: options.repairBbMs ?? masterMs,
        ...(options.repairConfig || {}),
      },
    });
    metrics.repairMs = Date.now() - tr;
    metrics.repairImproved = !!repair.improved;
    metrics.repairReason = repair.reason || null;
    metrics.repairRadius = repair.radius || null;
    metrics.repairPhysicalAdded = repair.physicalAdded || 0;

    if (repair.improved && repair.plan) {
      const accRepair = acceptBoardsOnly(best, repair.plan, expectedPieces);
      if (accRepair.accepted) best = accRepair.plan;
    }
  } else {
    metrics.repairReason = "disabled";
  }

  if (metrics.repairImproved &&
      (best.resumen.placas <= cota || strong.lowerBound >= best.resumen.placas || options.allowUncertifiedRepairStop === true)) {
    metrics.totalMs = Date.now() - started;
    return {
      plan: best, cota, metrics,
      reason: options.allowUncertifiedRepairStop === true ? "repair-win-uncertified-experimental" : "repair-win-certified",
      pool20, repair, strongLowerBound: strong
    };
  }

  if (best.resumen.placas <= cota) {
    metrics.totalMs = Date.now() - started;
    return { plan: best, cota, metrics, reason: "at-lower-bound-after-repair", pool20, repair };
  }

  metrics.fallbackNeeded = true;
  const tgf = Date.now();
  let extra = [];
  let pool40inc;
  if (enableIncrementalMaster) {
    if (Array.isArray(options.persistedIncrementalExtra)) {
      extra = dedupPatterns(options.persistedIncrementalExtra);
      metrics.fallbackPoolSource = "persisted";
    } else {
      extra = generarPatronesRango(lineas, config, firstRounds, totalRounds);
      metrics.fallbackPoolSource = "generated";
      if (typeof options.onIncrementalExtra === "function") options.onIncrementalExtra(extra);
    }
    pool40inc = dedupPatterns(pool20.concat(extra));
  } else {
    const fullRandom = generarPatrones(lineas, config, totalRounds);
    if (!mono) mono = patronesMonotipo(lineas, config);
    pool40inc = dedupPatterns(fullRandom.concat(mono));
    metrics.fallbackPoolSource = "monolithic";
  }
  metrics.fallbackGenMs = Date.now() - tgf;
  metrics.fallbackExtraPool = enableIncrementalMaster ? extra.length : Math.max(0, pool40inc.length - pool20.length);
  metrics.fallbackCombinedPool = pool40inc.length;

  const fallbackIncumbent = Number.isFinite(preMasterBoards) ? preMasterBoards : best.resumen.placas;
  const sf = solveMaster(pool40inc, lineas, config, fallbackIncumbent, fallbackMasterMs);
  metrics.fallbackSolveMs = sf.solveMs;
  metrics.fallbackNodes = sf.sol?.nodos || 0;
  metrics.fallbackExhausted = !!sf.sol?.agotado;
  if (sf.sol?.plan) {
    const cand40 = materializar(sf.sol.plan, lineas, best.opts || config);
    const acc40 = acceptLexicographic(best, cand40, expectedPieces);
    best = acc40.plan;
    metrics.fallbackAccepted = acc40.accepted;
    metrics.fallbackAcceptanceReason = acc40.reason;
  }

  metrics.totalMs = Date.now() - started;
  return { plan: best, cota, metrics, reason: metrics.fallbackAccepted ? "fallback-win" : "fallback-no-win", pool20, repair };
}

module.exports = {
  dedupPatterns,
  generarPatronesRango,
  areaLowerBound,
  runV10HybridPipeline,
};

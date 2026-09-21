"use strict";
const {
  packBoardLegacyRustBatch,
  packBoardLegacyRustGreedyBest,
  packBoardLegacyRustGreedyPlan,
  packBoardLegacyRustGreedyRound,
  packBoardLegacyRustMaster40Large,
  packBoardLegacyRustBeamCandidates,
  packBoardLegacyRustBeamCandidatesLite,
  packBoardLegacyRustCore,
} = require("./rust-packer.cjs");

const {
  medidaCorte,
  orientaciones,
  hashTexto,
  calidadRestos,
  compararCalidad,
  calidadPlanPlacas,
  mejorPlanIgualPlacas,
  mejorCandidatoPlaca,
} = require("../motor.cjs");

const DIR_X = "x";
const DIR_Y = "y";

function mezclar(...nums) {
  let h = 2166136261 >>> 0;
  for (const n of nums) {
    h ^= n >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 2654435761) >>> 0;
  }
  return h >>> 0;
}

function randomSeedFor(opts, pass, config, restart, board) {
  return mezclar(opts.semilla, pass, config._id, restart, board);
}

function toBoard(candidate, opts) {
  return {
    ancho: opts.anchoUtil,
    alto: opts.altoUtil,
    colocadas: candidate.colocadas,
    cortes: candidate.cortes,
    restos: candidate.restos,
    arbol: candidate.arbol,
  };
}

function buildRequests(opts, configs, pass, board) {
  const requests = [];
  for (const cfg of configs) {
    const reps = cfg.ruido > 0 ? opts.restartsPorPlaca : 1;
    for (let restart = 0; restart < reps; restart++) {
      requests.push({
        opts: { ...opts, ...cfg },
        randomSeed: cfg.ruido > 0 ? randomSeedFor(opts, pass, cfg, restart, board) : null,
      });
    }
  }
  return requests;
}

function packBatch(pool, opts, configs, pass, board) {
  return packBoardLegacyRustBatch(pool, buildRequests(opts, configs, pass, board));
}

function packGreedyBest(pool, opts, configs, pass, board) {
  return packBoardLegacyRustGreedyBest(
    pool,
    buildRequests(opts, configs, pass, board),
    opts.tolerancia,
  );
}

function packBeamCandidates(pool, opts, configs, pass, board) {
  return packBoardLegacyRustBeamCandidates(
    pool,
    buildRequests(opts, configs, pass, board),
    opts.beamWidth,
  );
}

function packBeamCandidatesLite(pool, opts, configs, pass, board) {
  return packBoardLegacyRustBeamCandidatesLite(
    pool,
    buildRequests(opts, configs, pass, board),
    opts.beamWidth,
  );
}

function calidadLite(raw) {
  return {
    mayor: +raw?.largest || 0,
    segundo: +raw?.second || 0,
    fragmentos: +raw?.fragments || 0,
    total: +raw?.total || 0,
  };
}

function combinarCalidadLite(a, b) {
  const top = [a.mayor, a.segundo, b.mayor, b.segundo].sort((x, y) => y - x);
  return {
    mayor: top[0] || 0,
    segundo: top[1] || 0,
    fragmentos: a.fragmentos + b.fragmentos,
    total: a.total + b.total,
  };
}

const CALIDAD_VACIA = Object.freeze({ mayor: 0, segundo: 0, fragmentos: 0, total: 0 });

function generateBoardCandidatesLite(pool, opts, configs, pass, boardIndex) {
  const selected = packBeamCandidatesLite(pool, opts, configs, pass, boardIndex);
  const boardArea = opts.anchoUtil * opts.altoUtil;
  const candidates = selected.map((result) => {
    const used = new Set(result.usedIds);
    return {
      requestIndex: result.requestIndex,
      usedIds: result.usedIds,
      area: result.area,
      areaResto: result.areaResto,
      quality: calidadLite(result.quality),
      restante: pool.filter((piece) => !used.has(piece.id)),
      lbAdicional: Math.ceil(Math.max(0, result.pendingArea) / boardArea),
    };
  });

  // Same JS oracle as the full path. Native lite output already carries the
  // canonical usage-signature tie-break, and Array#sort is stable for ties.
  candidates.sort((a, b) => {
    const primary = a.lbAdicional - b.lbAdicional || b.area - a.area;
    if (primary) return primary;
    return -compararCalidad(a.quality, b.quality);
  });
  return candidates.slice(0, Math.max(opts.beamWidth * 3, opts.beamWidth));
}

function materializeBeamRecipes(recipes, opts, configs, pass) {
  return recipes.map((recipe) => {
    const requests = buildRequests(opts, configs, pass, recipe.boardIndex);
    const request = requests[recipe.requestIndex];
    if (!request) throw new Error("Lean Beam recipe request is out of range.");
    const full = packBoardLegacyRustCore(recipe.pool, request.opts, request.randomSeed);
    const actual = full.colocadas.map((placement) => placement.pieza.id).sort((a, b) => a - b);
    if (
      actual.length !== recipe.usedIds.length ||
      actual.some((id, index) => id !== recipe.usedIds[index])
    ) {
      throw new Error("Lean Beam materialization diverged from the selected candidate.");
    }
    return toBoard(full, opts);
  });
}

function armGreedy(pieces, opts, configs, pass) {
  const nativeWholePlan =
    pieces.length > opts.maxPiezasBeam &&
    (
      opts.usarGreedyPlanNativo === true ||
      /^(1|true|yes|on)$/i.test(String(process.env.OPTIMIZER_RUST_GREEDY_PLAN_EXPERIMENTAL || ""))
    );

  if (nativeWholePlan) {
    return packBoardLegacyRustGreedyPlan(pieces, opts, configs, pass)
      .map((board) => toBoard(board, opts));
  }

  let pool = pieces.slice();
  const boards = [];
  let guard = 0;

  while (pool.length && guard++ < 300) {
    const best = packGreedyBest(pool, opts, configs, pass, boards.length);
    if (!best || !best.colocadas.length) throw new Error("No se pudo empacar la placa.");

    const used = new Set(best.colocadas.map((placement) => placement.pieza.id));
    pool = pool.filter((piece) => !used.has(piece.id));
    boards.push(toBoard(best, opts));
  }
  return boards;
}

function generateBoardCandidates(pool, opts, configs, pass, boardIndex) {
  const selected = packBeamCandidates(pool, opts, configs, pass, boardIndex);
  const boardArea = opts.anchoUtil * opts.altoUtil;
  const candidates = [];
  for (const result of selected) {
    const used = new Set(result.colocadas.map((placement) => placement.pieza.id));
    const remaining = pool.filter((piece) => !used.has(piece.id));
    const pendingArea = remaining.reduce((sum, piece) => sum + piece._corte.base * piece._corte.altura, 0);
    candidates.push({
      ...result,
      restante: remaining,
      lbAdicional: Math.ceil(Math.max(0, pendingArea) / boardArea),
    });
  }

  // Keep the JS sort as an executable oracle for the native selector order.
  candidates.sort((a, b) => {
    const primary = a.lbAdicional - b.lbAdicional || b.area - a.area;
    if (primary) return primary;
    return -compararCalidad(
      calidadRestos(a.restos || [], opts),
      calidadRestos(b.restos || [], opts),
    );
  });
  return candidates.slice(0, Math.max(opts.beamWidth * 3, opts.beamWidth));
}

function armBeamLean(pieces, opts, configs, pass) {
  const started = Date.now();
  const rawMax = Number(opts.maxExpansionesBeam);
  const maxExpansions = Number.isFinite(rawMax) && rawMax > 0 ? Math.floor(rawMax) : null;
  const deterministic = maxExpansions !== null;
  const rawWatchdog = Number(opts.watchdogBeamMs);
  const watchdogMs = Number.isFinite(rawWatchdog) && rawWatchdog > 0 ? rawWatchdog : null;
  let expansions = 0;
  let beam = [{
    pool: pieces.slice(),
    recipes: [],
    quality: CALIDAD_VACIA,
    count: 0,
    lowerBound: 0,
  }];
  let completed = [];
  let guard = 0;

  beamLoop:
  while (beam.length && guard++ < 300) {
    if (!deterministic && Date.now() - started > opts.presupuestoBeamMs) break;
    if (deterministic && watchdogMs !== null && Date.now() - started > watchdogMs) break;
    const next = [];

    for (const state of beam) {
      if (!state.pool.length) {
        completed.push(state);
        continue;
      }
      const candidates = generateBoardCandidatesLite(
        state.pool,
        opts,
        configs,
        pass,
        state.count,
      );
      if (!candidates.length) continue;

      for (const candidate of candidates) {
        if (deterministic && watchdogMs !== null && Date.now() - started > watchdogMs) break beamLoop;
        if (deterministic && expansions >= maxExpansions) break beamLoop;
        expansions++;

        const nextCount = state.count + 1;
        next.push({
          pool: candidate.restante,
          recipes: state.recipes.concat({
            pool: state.pool,
            boardIndex: state.count,
            requestIndex: candidate.requestIndex,
            usedIds: candidate.usedIds,
          }),
          quality: combinarCalidadLite(state.quality, candidate.quality),
          count: nextCount,
          lowerBound: nextCount + candidate.lbAdicional,
        });
      }
    }

    if (completed.length) {
      const bestComplete = Math.min(...completed.map((state) => state.count));
      for (let index = next.length - 1; index >= 0; index--) {
        if (next[index].lowerBound > bestComplete) next.splice(index, 1);
      }
    }

    next.sort((a, b) => {
      const primary = a.lowerBound - b.lowerBound || a.pool.length - b.pool.length;
      if (primary) return primary;
      return -compararCalidad(a.quality, b.quality);
    });

    const unique = [];
    const signatures = new Set();
    for (const state of next) {
      const signature = state.pool.map((piece) => piece.id).sort((a, b) => a - b).join(",");
      if (signatures.has(signature)) continue;
      signatures.add(signature);
      unique.push(state);
      if (unique.length >= opts.beamWidth) break;
    }
    beam = unique;
  }

  completed = completed.concat(beam.filter((state) => !state.pool.length));
  if (!completed.length) throw new Error("No se pudo completar el plan con Lean Beam Search.");

  completed.sort((a, b) => {
    const boardDelta = a.count - b.count;
    if (boardDelta) return boardDelta;
    return -compararCalidad(a.quality, b.quality);
  });

  return materializeBeamRecipes(completed[0].recipes, opts, configs, pass);
}

function armBeam(pieces, opts, configs, pass) {
  const boardArea = opts.anchoUtil * opts.altoUtil;
  const reuseDerivedMetrics =
    opts.reusarMetricasBeam === true ||
    /^(1|true|yes|on)$/i.test(String(process.env.OPTIMIZER_RUST_BEAM_DERIVED_METRICS_EXPERIMENTAL || ""));
  const started = Date.now();
  const rawMax = Number(opts.maxExpansionesBeam);
  const maxExpansions = Number.isFinite(rawMax) && rawMax > 0 ? Math.floor(rawMax) : null;
  const deterministic = maxExpansions !== null;
  const rawWatchdog = Number(opts.watchdogBeamMs);
  const watchdogMs = Number.isFinite(rawWatchdog) && rawWatchdog > 0 ? rawWatchdog : null;
  let expansions = 0;
  let beam = [{ pool: pieces.slice(), placas: [], util: 0 }];
  let completed = [];
  let guard = 0;

  beamLoop:
  while (beam.length && guard++ < 300) {
    if (!deterministic && Date.now() - started > opts.presupuestoBeamMs) break;
    if (deterministic && watchdogMs !== null && Date.now() - started > watchdogMs) break;
    const next = [];

    for (const state of beam) {
      if (!state.pool.length) {
        completed.push(state);
        continue;
      }
      const candidates = generateBoardCandidates(state.pool, opts, configs, pass, state.placas.length);
      if (!candidates.length) continue;

      for (const candidate of candidates) {
        if (deterministic && watchdogMs !== null && Date.now() - started > watchdogMs) break beamLoop;
        if (deterministic && expansions >= maxExpansions) break beamLoop;
        expansions++;
        const nextBoards = state.placas.concat(toBoard(candidate, opts));
        next.push({
          pool: candidate.restante,
          placas: nextBoards,
          util: state.util + candidate.areaResto,
          ...(reuseDerivedMetrics ? {
            _lowerBound: nextBoards.length + candidate.lbAdicional,
            _quality: null,
          } : {}),
        });
      }
    }

    if (completed.length) {
      const bestComplete = Math.min(...completed.map((state) => state.placas.length));
      for (let index = next.length - 1; index >= 0; index--) {
        const state = next[index];
        const lowerBound = reuseDerivedMetrics
          ? state._lowerBound
          : state.placas.length + Math.ceil(
              Math.max(0, state.pool.reduce((sum, piece) => sum + piece._corte.base * piece._corte.altura, 0)) /
              boardArea,
            );
        if (lowerBound > bestComplete) next.splice(index, 1);
      }
    }

    next.sort((a, b) => {
      let lbA, lbB;
      if (reuseDerivedMetrics) {
        lbA = a._lowerBound;
        lbB = b._lowerBound;
      } else {
        const areaA = a.pool.reduce((sum, piece) => sum + piece._corte.base * piece._corte.altura, 0);
        const areaB = b.pool.reduce((sum, piece) => sum + piece._corte.base * piece._corte.altura, 0);
        lbA = a.placas.length + Math.ceil(Math.max(0, areaA) / boardArea);
        lbB = b.placas.length + Math.ceil(Math.max(0, areaB) / boardArea);
      }
      const primary = lbA - lbB || a.pool.length - b.pool.length;
      if (primary) return primary;
      if (!reuseDerivedMetrics) {
        return -compararCalidad(calidadPlanPlacas(a.placas, opts), calidadPlanPlacas(b.placas, opts));
      }
      a._quality ??= calidadPlanPlacas(a.placas, opts);
      b._quality ??= calidadPlanPlacas(b.placas, opts);
      return -compararCalidad(a._quality, b._quality);
    });

    const unique = [];
    const signatures = new Set();
    for (const state of next) {
      const signature = state.pool.map((piece) => piece.id).sort((a, b) => a - b).join(",");
      if (signatures.has(signature)) continue;
      signatures.add(signature);
      unique.push(state);
      if (unique.length >= opts.beamWidth) break;
    }
    beam = unique;
  }

  completed = completed.concat(beam.filter((state) => !state.pool.length));
  if (!completed.length) throw new Error("No se pudo completar el plan con Beam Search.");
  completed.sort((a, b) => {
    const boardDelta = a.placas.length - b.placas.length;
    if (boardDelta) return boardDelta;
    return -compararCalidad(calidadPlanPlacas(a.placas, opts), calidadPlanPlacas(b.placas, opts));
  });
  return completed[0].placas;
}

function armBoards(pieces, opts, configs, pass) {
  const greedy = armGreedy(pieces, opts, configs, pass);
  const totalArea = pieces.reduce((sum, piece) => sum + piece._corte.base * piece._corte.altura, 0);
  const lowerBound = Math.ceil(totalArea / (opts.anchoUtil * opts.altoUtil));
  if (greedy.length <= lowerBound || pieces.length > opts.maxPiezasBeam) return greedy;

  let beam = null;
  try {
    const leanBeam =
      opts.usarLeanBeam === true ||
      /^(1|true|yes|on)$/i.test(String(process.env.OPTIMIZER_RUST_LEAN_BEAM_EXPERIMENTAL || ""));
    beam = leanBeam
      ? armBeamLean(pieces, opts, configs, pass)
      : armBeam(pieces, opts, configs, pass);
  } catch {
    beam = null;
  }
  const beamWins = beam && (
    beam.length < greedy.length ||
    (beam.length === greedy.length && mejorPlanIgualPlacas(beam, greedy, opts))
  );
  return beamWins ? beam : greedy;
}

function makeConfigs(opts) {
  const symmetric = ["perp", "exacta", "area", "largo"];
  const crossed = [["largo", "perp"], ["perp", "area"], ["area", "perp"], ["largo", "area"]];
  const configs = [];

  for (const criterion of symmetric) {
    for (const dirInicial of [DIR_Y, DIR_X]) {
      configs.push({ criterios: [criterion, criterion], criterio: criterion, dirInicial, ruido: 0 });
      configs.push({ criterios: [criterion, criterion], criterio: criterion, dirInicial, ruido: opts.ruido });
    }
  }
  for (const pair of crossed) {
    for (const dirInicial of [DIR_Y, DIR_X]) {
      configs.push({ criterios: [pair[0], pair[1]], criterio: pair[0], dirInicial, ruido: 0 });
    }
  }
  if (opts.multiVariantes !== false) {
    for (const config of configs.slice()) configs.push({ ...config, multiRebanada: true });
  }

  for (const config of configs) {
    config._id = hashTexto(
      config.criterios.join(">") +
      "|" + config.dirInicial +
      "|" + (config.ruido > 0 ? "rnd" : "det") +
      (config.multiRebanada ? "|multi" : ""),
    );
  }

  const dead = new Set([
    "exacta>exacta|y|det",
    "exacta>exacta|x|det",
    "largo>largo|y|det",
    "perp>area|y|det",
    "perp>area|x|det",
    ...(opts.excluirConfigs || []),
  ]);
  return configs.filter((config) => {
    const name = config.criterios.join(">") + "|" + config.dirInicial + "|" + (config.ruido > 0 ? "rnd" : "det");
    return !dead.has(name);
  });
}

function generarMaster40LargeContext(lineas, config = {}, rondas = 40, semilla = 7, uniqueMasksLe4 = false) {
  const opts = {
    placaBase: 2750,
    placaAltura: 1830,
    refiladoX: 10,
    refiladoY: 10,
    sierra: 4.5,
    etapas: 4,
    materialConVeta: false,
    descontarCanto: false,
    cantoEspesor: 0,
    ruido: 0.3,
    pases: 2,
    restartsPorPlaca: 14,
    restoMin: 250,
    restoMax: 400,
    tolerancia: 0.02,
    beamWidth: 5,
    maxPiezasBeam: 120,
    presupuestoBeamMs: 1500,
    maxPiezasCache: 0,
    semilla: 20260812,
    preferirMenorProfundidad: true,
    usarRescue: true,
    maxPiezasRescue: 30,
    presupuestoRescueMs: 300,
    multiRebanada: false,
    multiVariantes: false,
    ...config,
    pases: 2,
  };

  opts.anchoUtil = opts.placaBase - opts.refiladoX;
  opts.altoUtil = opts.placaAltura - opts.refiladoY;
  if (!(opts.anchoUtil > 0 && opts.altoUtil > 0)) {
    throw new Error("Medida util invalida.");
  }

  const catalog = lineas.map((line, typeIndex) => {
    const piece = {
      base: +line.base,
      altura: +line.altura,
      detalle: line.detalle || "",
      veta: Boolean(line.veta),
      cantos: line.cantos || null,
      ref: typeIndex,
    };
    const cut = medidaCorte(piece, opts);
    return {
      quantity: Math.max(0, Math.floor(+line.cant || 0)),
      base: piece.base,
      altura: piece.altura,
      cutBase: cut.base,
      cutAltura: cut.altura,
      veta: piece.veta,
      detalle: piece.detalle,
      cantos: piece.cantos,
      typeIndex,
    };
  });

  if (!catalog.length || catalog.some((item) => item.quantity <= 0)) {
    return { eligible: false, patterns: [] };
  }

  const configs = makeConfigs(opts);
  const explicitRestarts = config.restartsPorPlaca === undefined
    ? null
    : Math.max(1, Math.floor(+opts.restartsPorPlaca || 1));

  const result = packBoardLegacyRustMaster40Large(
    catalog,
    opts,
    configs,
    rondas,
    semilla,
    {
      passes: 2,
      explicitRestartsPerBoard: explicitRestarts,
      defaultRestartsPerBoard: 14,
      tolerance: +opts.tolerancia || 0,
      maxStages: Math.max(2, Math.floor(+opts.etapas || 4)),
      preferLowerDepth: opts.preferirMenorProfundidad !== false,
      maxPiecesBeam: Math.max(0, Math.floor(+opts.maxPiezasBeam || 0)),
      uniqueMasksLe4: Boolean(uniqueMasksLe4),
    },
  );

  if (!result.eligible) return result;

  return {
    ...result,
    patterns: result.patterns.map((pattern) => ({
      uso: new Map(
        pattern.usageVector
          .map((count, index) => [index, count])
          .filter(([, count]) => count > 0),
      ),
      area: pattern.area,
      placa: toBoard(pattern.board, opts),
    })),
  };
}

function makeRescueConfigs(opts) {
  const configs = [
    { criterios: ["largo", "largo", "perp"], criterio: "largo", dirInicial: DIR_X, ruido: opts.ruido },
    { criterios: ["largo", "largo", "perp"], criterio: "largo", dirInicial: DIR_Y, ruido: opts.ruido },
    { criterios: ["largo", "largo", "perp"], criterio: "largo", dirInicial: DIR_Y, ruido: 0 },
    { criterios: ["area", "area", "largo"], criterio: "area", dirInicial: DIR_X, ruido: opts.ruido },
    { criterios: ["area", "area", "exacta"], criterio: "area", dirInicial: DIR_X, ruido: opts.ruido },
    { criterios: ["exacta", "exacta", "exacta"], criterio: "exacta", dirInicial: DIR_X, ruido: opts.ruido },
    { criterios: ["area", "area", "perp"], criterio: "area", dirInicial: DIR_X, ruido: opts.ruido },
    { criterios: ["perp", "perp", "exacta"], criterio: "perp", dirInicial: DIR_Y, ruido: opts.ruido },
    { criterios: ["perp", "perp", "perp"], criterio: "perp", dirInicial: DIR_X, ruido: opts.ruido },
  ];
  for (const config of configs) {
    config._id = hashTexto(config.criterios.join(">") + "|" + config.dirInicial + "|" + (config.ruido > 0 ? "rnd" : "det"));
  }
  return configs;
}

function optimizarLegacyHybrid(lineas, config = {}) {
  const opts = {
    placaBase: 2750,
    placaAltura: 1830,
    refiladoX: 10,
    refiladoY: 10,
    sierra: 4.5,
    etapas: 4,
    materialConVeta: false,
    descontarCanto: false,
    cantoEspesor: 0,
    ruido: 0.3,
    pases: 4,
    restartsPorPlaca: 14,
    restoMin: 250,
    restoMax: 400,
    tolerancia: 0.02,
    beamWidth: 5,
    maxPiezasBeam: 120,
    presupuestoBeamMs: 1500,
    maxPiezasCache: 0,
    semilla: 20260812,
    preferirMenorProfundidad: true,
    usarRescue: true,
    maxPiezasRescue: 30,
    presupuestoRescueMs: 300,
    multiRebanada: false,
    multiVariantes: false,
    ...config,
  };

  const pieces = [];
  let id = 0;
  lineas.forEach((line) => {
    for (let count = 0; count < line.cant; count++) {
      pieces.push({
        id: id++,
        base: +line.base,
        altura: +line.altura,
        detalle: line.detalle || "",
        veta: Boolean(line.veta),
        cantos: line.cantos || null,
        ref: line.ref,
      });
    }
  });
  if (!pieces.length) throw new Error("No hay piezas cargadas.");

  const signatures = new Map();
  for (const piece of pieces) {
    piece._corte = medidaCorte(piece, opts);
    piece._ors = orientaciones(piece, opts.materialConVeta);
    const key = piece._corte.base + "|" + piece._corte.altura + "|" + (piece.veta ? 1 : 0);
    if (!signatures.has(key)) signatures.set(key, signatures.size);
    piece._sig = signatures.get(key);
  }

  opts.anchoUtil = opts.placaBase - opts.refiladoX;
  opts.altoUtil = opts.placaAltura - opts.refiladoY;
  if (!(opts.anchoUtil > 0 && opts.altoUtil > 0)) throw new Error("Medida util invalida.");

  if (config.restartsPorPlaca === undefined) {
    opts.restartsPorPlaca = Math.max(3, Math.round(opts.restartsPorPlaca * 60 / Math.max(60, pieces.length)));
  }

  const configs = makeConfigs(opts);
  const orders = [
    (a, b) => b.base * b.altura - a.base * a.altura,
    (a, b) => Math.max(b.base, b.altura) - Math.max(a.base, a.altura),
    (a, b) => b.altura - a.altura || b.base - a.base,
    (a, b) => b.base - a.base || b.altura - a.altura,
  ];
  const maxStages = Math.max(2, Math.floor(+opts.etapas || 4));
  const stageTrials = opts.preferirMenorProfundidad === false
    ? [maxStages]
    : Array.from({ length: maxStages - 1 }, (_, index) => index + 2);

  const nativeLargeRound =
    pieces.length > opts.maxPiezasBeam &&
    (
      opts.usarRondaGrandeNativa === true ||
      /^(1|true|yes|on)$/i.test(String(process.env.OPTIMIZER_RUST_LARGE_ROUND_EXPERIMENTAL || ""))
    );

  let best = null;
  if (nativeLargeRound) {
    const orderedIds = Array.from({ length: opts.pases }, (_, pass) =>
      pieces.slice().sort(orders[pass % orders.length]).map((piece) => piece.id),
    );
    const nativeRound = packBoardLegacyRustGreedyRound(pieces, opts, configs, orderedIds);
    const boards = nativeRound.placas.map((board) => toBoard(board, opts));
    if (boards.reduce((sum, board) => sum + board.colocadas.length, 0) < pieces.length) {
      throw new Error("La ronda greedy nativa no cubre todas las piezas.");
    }
    best = { placas: boards, etapasUsadas: nativeRound.etapasUsadas };
  } else {
    for (let pass = 0; pass < opts.pases; pass++) {
      for (const stages of stageTrials) {
        const stageOpts = { ...opts, etapas: stages };
        const boards = armBoards(pieces.slice().sort(orders[pass % orders.length]), stageOpts, configs, pass);
        if (boards.reduce((sum, board) => sum + board.colocadas.length, 0) < pieces.length) continue;
        if (
          !best ||
          boards.length < best.placas.length ||
          (boards.length === best.placas.length && mejorPlanIgualPlacas(boards, best.placas, stageOpts))
        ) best = { placas: boards, etapasUsadas: stages };
      }
    }
  }
  if (!best) throw new Error("No se pudo armar un plan completo.");

  const globalArea = pieces.reduce((sum, piece) => sum + piece._corte.base * piece._corte.altura, 0);
  const lowerBound = Math.ceil(globalArea / (opts.anchoUtil * opts.altoUtil));

  if (opts.usarRescue && best.placas.length > lowerBound && pieces.length <= opts.maxPiezasRescue) {
    const ro = {
      ...opts,
      beamWidth: Math.max(opts.beamWidth, 8),
      presupuestoBeamMs: opts.presupuestoRescueMs,
      restartsPorPlaca: Math.max(opts.restartsPorPlaca, 18),
    };
    const configsRescue = makeRescueConfigs(opts);
    let rescued = null;
    for (let pass = 0; pass < opts.pases; pass++) {
      try {
        const boards = armBoards(pieces.slice().sort(orders[pass % orders.length]), ro, configsRescue, pass + 100);
        if (boards.reduce((sum, board) => sum + board.colocadas.length, 0) < pieces.length) continue;
        if (
          !rescued ||
          boards.length < rescued.length ||
          (boards.length === rescued.length && mejorPlanIgualPlacas(boards, rescued, ro))
        ) rescued = boards;
      } catch {}
    }
    if (
      rescued &&
      (
        rescued.length < best.placas.length ||
        (rescued.length === best.placas.length && mejorPlanIgualPlacas(rescued, best.placas, opts))
      )
    ) best = { placas: rescued, etapasUsadas: best.etapasUsadas };
  }

  return {
    placas: best.placas,
    opts,
    resumen: {
      placas: best.placas.length,
      piezas: pieces.length,
      etapasUsadas: best.etapasUsadas || opts.etapas,
    },
  };
}


module.exports = { optimizarLegacyHybrid, generarMaster40LargeContext };

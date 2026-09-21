"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const REPO = path.resolve(__dirname, "../../..");
const OUT = __dirname;
const CORPUS = path.join(REPO, "experiencia/canonical_cases.json");
const SHARD_INDEX = Number(process.env.SHARD_INDEX || 0);
const SHARD_TOTAL = Number(process.env.SHARD_TOTAL || 1);
const MAX_PIECES = Number(process.env.MAX_PIECES || 500);
const MODE = process.argv[2] || "shard";
const TRAIN_CASES = new Set([4058501]);
const HISTORICAL_WINNERS = new Set([4050594, 4056900, 4057401, 4059200]);

const { optimizarV10, nuevasMetricas, validarPlanIndustrial } =
  require(path.join(REPO, "src/lib/optimizer/legacy/v10.cjs"));
const { calidadPlanPlacas } =
  require(path.join(REPO, "src/lib/optimizer/legacy/motor.cjs"));
const { generarPatrones, patronesMonotipo } =
  require(path.join(REPO, "src/lib/optimizer/legacy/patrones.cjs"));

enableModernRuntime();

if (MODE === "shard") shard();
else if (MODE === "report") report();
else throw new Error("mode must be shard|report");

function enableModernRuntime() {
  process.env.OPTIMIZER_RUST_BEAM_RANK_CACHE_EXPERIMENTAL = "1";
  process.env.OPTIMIZER_RUST_LEAN_BEAM_EXPERIMENTAL = "1";
  process.env.OPTIMIZER_RUST_GREEDY_PLAN_EXPERIMENTAL = "1";
  process.env.OPTIMIZER_RUST_LARGE_ROUND_EXPERIMENTAL = "1";
  process.env.OPTIMIZER_RUST_SIMPLE_CHOOSE_EXPERIMENTAL = "1";
  process.env.OPTIMIZER_RUST_MASTER_ROUND_REUSE_EXPERIMENTAL = "0";
  process.env.OPTIMIZER_MASTER_UNIQUE_MASKS_LE4_EXPERIMENTAL = "1";
  delete process.env.OPTIMIZER_RUST_BEAM_DERIVED_METRICS_EXPERIMENTAL;
}

function loadCorpus() {
  const raw = JSON.parse(fs.readFileSync(CORPUS, "utf8"));
  return Array.isArray(raw)
    ? raw
    : (raw.cases || raw.records || raw.canonical_cases || raw.canonicalCases || raw.data || []);
}

function root(e) {
  return e?.case ?? e?.canonical ?? e?.optimization_case ?? e?.optimizationCase ?? e;
}

function num(...xs) {
  for (const x of xs) {
    const n = Number(x);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function candidateStrings(e) {
  const r = root(e);
  return [
    e?.file, e?.file_name, e?.fileName, e?.source_file, e?.sourceFile,
    e?.case_id, e?.caseId, e?.name, e?.id,
    r?.file, r?.file_name, r?.fileName, r?.source_file, r?.sourceFile,
    r?.case_id, r?.caseId, r?.name, r?.id,
  ].filter((v) => typeof v === "string" || Number.isFinite(Number(v)));
}

function orderNumber(v) {
  const runs = String(v || "").replace(/\.xml$/i, "").match(/\d+/g);
  if (!runs) return null;
  const last = runs.at(-1);
  return Number(last.length > 7 ? last.slice(-7) : last);
}

function caseIdentity(e, index) {
  for (const s of candidateStrings(e)) {
    const n = orderNumber(s);
    if (Number.isFinite(n)) return { order: n, file: String(s) };
  }
  return { order: null, file: "canonical-index-" + index };
}

function problem(e) {
  const r = root(e);
  if (!Array.isArray(r?.pieces) || r.pieces.length === 0) throw new Error("missing pieces");
  const width = num(r.panel?.width, r.stock_width, r.stockWidth, r.board_width, r.boardWidth);
  const height = num(r.panel?.height, r.stock_height, r.stockHeight, r.board_height, r.boardHeight);
  if (!(width > 0 && height > 0)) throw new Error("invalid stock dimensions");
  const saw = num(r.kerf, r.saw, r.sierra, 4.5);
  const trimX = num(r.trim?.x, r.trim_x, r.trimX, r.refiladoX, 0);
  const trimY = num(r.trim?.y, r.trim_y, r.trimY, r.refiladoY, 0);
  const directional =
    r.material?.hasGrain === true ||
    Boolean(r.directional ?? r.directional_input ?? r.materialConVeta ?? r.has_grain) ||
    r.pieces.some((p) => p.grain === true || p.veta === true || p.rotationAllowed === false);
  const lines = r.pieces.map((p, i) => ({
    base: num(p.base, p.width),
    altura: num(p.altura, p.height),
    cant: num(p.cant, p.quantity, 1),
    veta: Boolean(p.veta ?? p.grain ?? (p.rotationAllowed === false)),
    ref: p.ref ?? p.reference ?? i,
    detalle: p.detalle ?? p.description ?? "",
  }));
  if (lines.some((l) => !(l.base > 0 && l.altura > 0 && l.cant > 0))) {
    throw new Error("invalid piece dimensions");
  }
  const pieces = lines.reduce((sum, line) => sum + line.cant, 0);
  return { width, height, saw, trimX, trimY, directional, lines, pieces, types: lines.length };
}

function config(p, useMaster) {
  return {
    placaBase: p.width,
    placaAltura: p.height,
    refiladoX: p.trimX,
    refiladoY: p.trimY,
    sierra: p.saw,
    etapas: 4,
    materialConVeta: Boolean(p.directional),
    descontarCanto: false,
    cantoEspesor: 0,
    restoMin: 250,
    restoMax: 400,
    usarOneBoard: true,
    usarMaster: useMaster,
    usarMultiSlice: true,
    usarCompactacion: true,
    usarRustPatternGenerator: true,
    usarCache: false,
    maxPiezasCache: 0,
    rondasPatrones: 40,
    msMaster: 8000,
    usarCotaBarataPostCompactacion: true,
    usarDffFs0PostCompactacion: true,
    usarMascarasUnicasMasterLe4: true,
    minPiezasMultiSliceExperimental: 200,
    maxPiezasMultiSliceExperimental: 500,
  };
}

function runV10(p, useMaster) {
  const cfg = config(p, useMaster);
  const t0 = process.hrtime.bigint();
  try {
    const result = optimizarV10(p.lines, cfg, nuevasMetricas());
    const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;
    const plan = result?.plan || null;
    const validation = plan ? validarPlanIndustrial(plan, p.pieces) : { ok: false };
    return {
      ok: Boolean(plan && validation?.ok),
      elapsedMs,
      boards: plan?.resumen?.placas ?? null,
      cota: result?.cota ?? null,
      cotaArea: result?.cotaArea ?? null,
      plan,
      metricas: result?.metricas ?? null,
      quality: plan ? calidadPlanPlacas(plan.placas, plan.opts || cfg) : null,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      elapsedMs: Number(process.hrtime.bigint() - t0) / 1e6,
      boards: null,
      cota: null,
      cotaArea: null,
      plan: null,
      metricas: null,
      quality: null,
      error: String(error?.stack || error?.message || error).slice(0, 1800),
    };
  }
}

function boardDigest(board) {
  return {
    placements: (board?.colocadas || []).map((p) => [
      p?.pieza?.ref, p.base, p.altura, p.x, p.y, Boolean(p.rotada), p.nivel ?? 0,
    ]),
    cuts: (board?.cortes || []).map((c) => [
      c.x1, c.y1, c.x2, c.y2, c.nivel ?? 0, Boolean(c.terminal),
    ]),
    remnants: (board?.restos || []).map((r) => [r.x, r.y, r.w, r.h]),
  };
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function planDigest(plan) {
  return plan ? digest((plan.placas || []).map(boardDigest)) : null;
}

function patternPoolDigest(pool) {
  return digest(pool.map((pattern) => ({
    usage: [...pattern.uso.entries()].sort((a, b) => a[0] - b[0]),
    area: pattern.area,
    board: boardDigest(pattern.placa),
  })));
}

function certifyPool(p) {
  const cfg = config(p, true);
  const t0 = process.hrtime.bigint();
  const generated = generarPatrones(p.lines, cfg, 40, 7);
  const generatedMs = Number(process.hrtime.bigint() - t0) / 1e6;
  const mono = patronesMonotipo(p.lines, cfg);
  return {
    generatedMs,
    generatedPatterns: generated.length,
    monotypePatterns: mono.length,
    generatedPoolDigest: patternPoolDigest(generated),
    solverPoolDigest: patternPoolDigest(generated.concat(mono)),
    maskPolicy: cfg._patternMaskPolicy || null,
    rustGeneratorUsed: cfg._rustPatternGeneratorUsed || null,
    rustGeneratorFallback: cfg._rustPatternGeneratorFallback === true,
  };
}

function shard() {
  const entries = loadCorpus();
  const counts = {
    corpus: entries.length,
    assigned: 0,
    eligible: 0,
    skippedTooLarge: 0,
    skippedInvalidInput: 0,
    screenErrors: 0,
    masterCandidates: 0,
    fullErrors: 0,
    masterActivations: 0,
    masterWins: 0,
    validWins: 0,
  };
  const candidates = [];
  const wins = [];
  const errors = [];

  for (let index = SHARD_INDEX; index < entries.length; index += SHARD_TOTAL) {
    counts.assigned++;
    const entry = entries[index];
    const id = caseIdentity(entry, index);
    let p;
    try {
      p = problem(entry);
    } catch (error) {
      counts.skippedInvalidInput++;
      if (errors.length < 100) errors.push({ ...id, phase: "input", error: String(error?.message || error) });
      continue;
    }
    if (p.pieces > MAX_PIECES) {
      counts.skippedTooLarge++;
      continue;
    }
    counts.eligible++;

    const screen = runV10(p, false);
    if (!screen.ok) {
      counts.screenErrors++;
      if (errors.length < 100) errors.push({ ...id, pieces: p.pieces, types: p.types, phase: "screen", error: screen.error });
      continue;
    }

    if (!(Number.isFinite(screen.boards) && Number.isFinite(screen.cota) && screen.boards > screen.cota)) {
      continue;
    }

    counts.masterCandidates++;
    const full = runV10(p, true);
    if (!full.ok) {
      counts.fullErrors++;
      if (errors.length < 100) errors.push({ ...id, pieces: p.pieces, types: p.types, phase: "full40", error: full.error });
      continue;
    }

    const master = full.metricas?.master || {};
    const activated = Number(master.activaciones || 0) > 0;
    if (activated) counts.masterActivations++;

    const row = {
      ...id,
      canonicalIndex: index,
      pieces: p.pieces,
      typeCount: p.types,
      preMasterBoards: screen.boards,
      lowerBound: screen.cota,
      areaLowerBound: screen.cotaArea,
      finalBoards: full.boards,
      masterActivated: activated,
      masterWins: Number(master.ganancias || 0),
      boardsSaved: Number(master.placasAhorradas || 0),
      screenMs: +screen.elapsedMs.toFixed(3),
      fullMs: +full.elapsedMs.toFixed(3),
      masterMs: +Number(master.ms || 0).toFixed(3),
      planDigest: planDigest(full.plan),
      quality: full.quality,
      isTrainingCase: TRAIN_CASES.has(id.order),
      historicalWinner: HISTORICAL_WINNERS.has(id.order),
    };
    candidates.push(row);

    if (
      activated &&
      row.masterWins > 0 &&
      Number.isFinite(row.preMasterBoards) &&
      Number.isFinite(row.finalBoards) &&
      row.finalBoards < row.preMasterBoards
    ) {
      let poolCertification = null;
      let poolError = null;
      try {
        poolCertification = certifyPool(p);
      } catch (error) {
        poolError = String(error?.stack || error?.message || error).slice(0, 1800);
      }
      const win = { ...row, poolCertification, poolError };
      wins.push(win);
      counts.masterWins++;
      if (!poolError && poolCertification?.rustGeneratorUsed === "rust" && !poolCertification?.rustGeneratorFallback) {
        counts.validWins++;
      }
      console.log(
        "MASTER_WIN " +
        JSON.stringify({
          order: id.order,
          pre: row.preMasterBoards,
          final: row.finalBoards,
          saved: row.boardsSaved,
          pieces: row.pieces,
          types: row.typeCount,
          training: row.isTrainingCase,
        }),
      );
    }
  }

  const payload = {
    schema: "perfv1-master-win-mining-shard-v1",
    generatedAt: new Date().toISOString(),
    branch: process.env.GITHUB_REF_NAME || null,
    shard: SHARD_INDEX,
    shardTotal: SHARD_TOTAL,
    maxPieces: MAX_PIECES,
    counts,
    candidates,
    wins,
    errors,
  };
  const out = path.join(OUT, "master-win-mining-shard-" + SHARD_INDEX + ".json");
  fs.writeFileSync(out, JSON.stringify(payload, null, 2) + "\n");
  console.log("MASTER_WIN_MINING_SHARD " + JSON.stringify({ shard: SHARD_INDEX, counts, wins: wins.length }));
}

function report() {
  const expected = Number(process.env.SHARD_TOTAL || 32);
  const files = fs.readdirSync(OUT)
    .filter((name) => /^master-win-mining-shard-\d+\.json$/.test(name))
    .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
  if (files.length !== expected) throw new Error("expected " + expected + " shards, got " + files.length);
  const shards = files.map((file) => JSON.parse(fs.readFileSync(path.join(OUT, file), "utf8")));
  const sumField = (field) => shards.reduce((sum, s) => sum + Number(s.counts?.[field] || 0), 0);
  const allWins = shards.flatMap((s) => s.wins || []).sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
  const holdoutWins = allWins.filter((w) => !w.isTrainingCase);
  const novelHoldoutWins = holdoutWins.filter((w) => !w.historicalWinner);
  const known = new Map(allWins.filter((w) => Number.isFinite(w.order)).map((w) => [w.order, w]));

  const result = {
    schema: "perfv1-master-win-mining-v1",
    generatedAt: new Date().toISOString(),
    corpus: {
      cases: sumField("corpus") / expected,
      assigned: sumField("assigned"),
      eligible: sumField("eligible"),
      skippedTooLarge: sumField("skippedTooLarge"),
      skippedInvalidInput: sumField("skippedInvalidInput"),
      maxPieces: shards[0]?.maxPieces ?? null,
    },
    execution: {
      screenErrors: sumField("screenErrors"),
      masterCandidates: sumField("masterCandidates"),
      fullErrors: sumField("fullErrors"),
      masterActivations: sumField("masterActivations"),
    },
    wins: {
      total: allWins.length,
      productionCertified: allWins.filter((w) => !w.poolError && w.poolCertification?.rustGeneratorUsed === "rust" && !w.poolCertification?.rustGeneratorFallback).length,
      training: allWins.filter((w) => w.isTrainingCase).length,
      holdout: holdoutWins.length,
      novelHoldout: novelHoldoutWins.length,
      target20Reached: holdoutWins.length >= 20,
      target30Reached: holdoutWins.length >= 30,
    },
    knownCases: [4050594, 4056900, 4057401, 4059200, 4058501].map((order) => ({
      order,
      foundAsWin: known.has(order),
      row: known.get(order) || null,
    })),
    holdoutWins,
    novelHoldoutWins,
    allWins,
    errors: shards.flatMap((s) => s.errors || []).slice(0, 500),
  };
  const out = path.join(OUT, "master-win-mining-results.json");
  fs.writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
  console.log("MASTER_WIN_MINING " + JSON.stringify({
    corpus: result.corpus,
    execution: result.execution,
    wins: result.wins,
    winOrders: allWins.map((w) => w.order),
  }));
}

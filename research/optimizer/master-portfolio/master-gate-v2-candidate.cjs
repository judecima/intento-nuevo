"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const ROOT = path.resolve(__dirname, "../../..");
const CANONICAL_PATH = path.join(ROOT, "experiencia/canonical_cases.json");
const MANIFEST_PATH = path.join(ROOT, "research/optimizer/master-portfolio/MASTER_ACTIVE_323_MANIFEST_2026-09-18.json");
const FIXTURE_4056900 = path.join(ROOT, "research/optimizer/pattern-generators/guide-slice/INDUSTRIAL_PORTFOLIO_4056900_CHECKPOINT_2026-09-14.json");
const OUT_DIR = path.join(ROOT, "research/optimizer/master-portfolio/out");
const OUT_PATH = path.join(OUT_DIR, "MASTER_GATE_V2_CANDIDATE_2026-09-21.json");

const LEGACY = path.join(ROOT, "src/lib/optimizer/legacy");
const { optimizarV10, nuevasMetricas, validarPlanIndustrial } = require(path.join(LEGACY, "v10.cjs"));
const { generarPatrones, patronesMonotipo } = require(path.join(LEGACY, "patrones.cjs"));
const { resolverCobertura } = require(path.join(LEGACY, "cobertura.cjs"));
const { materializar } = require(path.join(LEGACY, "materializar.cjs"));

const THRESHOLD = Number(process.env.MASTER_GATE_MULT || 4.75);
const TARGET_REJECTED = Number(process.env.MASTER_GATE_REJECT_TARGET || 12);
const MAX_SCANNED = Number(process.env.MASTER_GATE_REJECT_SCAN || 120);
const MASTER_MS = Number(process.env.MASTER_GATE_MS || 8000);
const MAX_PIECES = Number(process.env.MASTER_GATE_MAX_PIECES || 160);

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function boolTrue(v) {
  return v === true || v === 1 || v === "1" || v === "true" || v === "TRUE";
}
function basename(v) {
  return typeof v === "string" ? v.replaceAll("\\", "/").split("/").pop() : null;
}
function qty(p) {
  for (const k of ["quantity", "qty", "count", "cant", "num", "q", "qMin"]) {
    const n = Number(p?.[k]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 1;
}
function dims(p) {
  return {
    w: num(p?.width ?? p?.base ?? p?.l ?? p?.L),
    h: num(p?.height ?? p?.altura ?? p?.w ?? p?.W),
  };
}
function quantile(values, q) {
  if (!values.length) return null;
  const xs = values.slice().sort((a, b) => a - b);
  const pos = (xs.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? xs[lo] : xs[lo] + (xs[hi] - xs[lo]) * (pos - lo);
}
function summaryGate(row) {
  const gap = num(row.preMasterBoards) - num(row.lowerBound);
  const multiplicityMean = num(row.typeCount) > 0 ? num(row.pieces) / num(row.typeCount) : 0;
  return gap > 1 || multiplicityMean >= THRESHOLD;
}
function historicalReplay(manifest) {
  const rows = manifest.cases || [];
  const costs = rows.map(r => num(r.generationMs) + num(r.monotypeMs) + num(r.solveMs));
  const candidate = rows.map((r, i) => summaryGate(r) ? costs[i] : 0);
  const sum = xs => xs.reduce((a, b) => a + b, 0);
  const selected = rows.filter(summaryGate);
  const skipped = rows.filter(r => !summaryGate(r));
  const missed = rows.filter(r => r.masterWin && !summaryGate(r));
  const retained = rows.filter(r => r.masterWin && summaryGate(r));
  const baseMs = sum(costs);
  const candidateMs = sum(candidate);
  return {
    rule: `gap > 1 || multiplicityMean >= ${THRESHOLD}`,
    cases: rows.length,
    selected: selected.length,
    skipped: skipped.length,
    invocationReductionPct: rows.length ? skipped.length / rows.length : 0,
    retainedWinners: retained.map(r => r.order),
    missedWinners: missed.map(r => r.order),
    baseMasterMs: baseMs,
    candidateMasterMs: candidateMs,
    savedMasterMs: baseMs - candidateMs,
    savedMasterPct: baseMs ? (baseMs - candidateMs) / baseMs : 0,
    baseline: {
      p50: quantile(costs, 0.5),
      p95: quantile(costs, 0.95),
      p99: quantile(costs, 0.99),
      max: Math.max(...costs),
    },
    candidate: {
      p50: quantile(candidate, 0.5),
      p95: quantile(candidate, 0.95),
      p99: quantile(candidate, 0.99),
      max: Math.max(...candidate),
    },
  };
}
function features(row) {
  const ps = Array.isArray(row.pieces) ? row.pieces : [];
  const qs = ps.map(qty);
  const pieceCount = num(row.piece_count, qs.reduce((a, b) => a + b, 0));
  const typeCount = num(row.piece_types, ps.length);
  return {
    file: basename(row.source_path || ((row.case_id || "") + ".xml")),
    pieceCount,
    typeCount,
    multiplicityMean: typeCount ? pieceCount / typeCount : 0,
  };
}
function toLines(row) {
  const fmt = String(row.source_format || "").toLowerCase();
  return (row.pieces || []).map((p, i) => ({
    ref: String(i + 1),
    detalle: String(i + 1),
    cant: qty(p),
    base: dims(p).w,
    altura: dims(p).h,
    veta: fmt === "order" && (boolTrue(p?.xmlPartGrain) || boolTrue(p?.rawGrain) || boolTrue(p?.grain)),
    cantos: null,
  }));
}
function toConfig(row) {
  const fmt = String(row.source_format || "").toLowerCase();
  return {
    placaBase: num(row.stock_width, 2600),
    placaAltura: num(row.stock_height, 1830),
    refiladoX: 0,
    refiladoY: 0,
    sierra: num(row.saw, 4.5),
    etapas: 4,
    materialConVeta: fmt === "order" ? boolTrue(row.directional) : false,
    descontarCanto: false,
    cantoEspesor: 0,
    restoMin: 250,
    restoMax: 400,
    usarCache: true,
    maxPiezasCache: 160,
    usarCompactacion: true,
    usarMultiSlice: true,
    usarOneBoard: true,
    usarMaster: false,
    rondasPatrones: 40,
    msMaster: MASTER_MS,
  };
}
function validRow(row) {
  const f = features(row);
  return f.file && f.pieceCount > 0 && f.typeCount > 0 && f.pieceCount <= MAX_PIECES &&
    num(row.stock_width) > 0 && num(row.stock_height) > 0 &&
    Array.isArray(row.pieces) && row.pieces.length > 0 &&
    row.pieces.every(p => dims(p).w > 0 && dims(p).h > 0 && qty(p) > 0);
}
function synthetic4056900() {
  const cp = JSON.parse(fs.readFileSync(FIXTURE_4056900, "utf8")).source;
  return {
    case_id: "4056900__Alfredo_Arrua4056900",
    source_path: cp.file,
    source_format: cp.format,
    stock_width: cp.board.width,
    stock_height: cp.board.height,
    saw: cp.board.kerf,
    directional: false,
    piece_count: cp.pieceQuantity,
    piece_types: cp.pieceTypes,
    pieces: cp.lines.map(x => ({ base: x.width, altura: x.height, cant: x.quantity })),
    _syntheticFrozen: true,
  };
}
function runPreOnly(row, label) {
  const f = features(row);
  const lines = toLines(row);
  const config = toConfig(row);
  const expected = lines.reduce((s, l) => s + l.cant, 0);
  const tPre = performance.now();
  try {
    const pre = optimizarV10(lines, { ...config, usarMaster: false }, nuevasMetricas());
    const prePlan = pre?.plan;
    const preBoards = prePlan?.resumen?.placas ?? null;
    const cota = pre?.cota ?? null;
    const gap = Number.isFinite(preBoards) && Number.isFinite(cota) ? preBoards - cota : null;
    const preValid = prePlan ? validarPlanIndustrial(prePlan, expected) : null;
    return {
      label,
      file: f.file,
      features: f,
      preMs: performance.now() - tPre,
      preBoards,
      cota,
      gap,
      preValid: preValid?.ok ?? false,
      candidateWouldRun: Number.isFinite(gap) && (gap > 1 || f.multiplicityMean >= THRESHOLD),
    };
  } catch (e) {
    return { label, file: f.file, features: f, error: "pre:" + String(e?.message || e) };
  }
}

function runFullMaster(row, label) {
  const f = features(row);
  const lines = toLines(row);
  const config = toConfig(row);
  const expected = lines.reduce((s, l) => s + l.cant, 0);

  const tPre = performance.now();
  let pre;
  try {
    pre = optimizarV10(lines, { ...config, usarMaster: false }, nuevasMetricas());
  } catch (e) {
    return { label, file: f.file, features: f, error: "pre:" + String(e?.message || e) };
  }
  const preMs = performance.now() - tPre;
  const prePlan = pre?.plan;
  const preBoards = prePlan?.resumen?.placas ?? null;
  const cota = pre?.cota ?? null;
  const gap = Number.isFinite(preBoards) && Number.isFinite(cota) ? preBoards - cota : null;
  const preValid = prePlan ? validarPlanIndustrial(prePlan, expected) : null;

  const rec = {
    label,
    file: f.file,
    features: f,
    preMs,
    preBoards,
    cota,
    gap,
    preValid: preValid?.ok ?? false,
    candidateWouldRun: Number.isFinite(gap) && (gap > 1 || f.multiplicityMean >= THRESHOLD),
  };
  if (!prePlan || !preValid?.ok || !Number.isFinite(gap) || gap <= 0) return rec;

  const tGen = performance.now();
  let pool;
  try {
    pool = generarPatrones(lines, config, 40).concat(patronesMonotipo(lines, config));
  } catch (e) {
    return { ...rec, masterError: "gen:" + String(e?.message || e), generationMs: performance.now() - tGen };
  }
  const generationMs = performance.now() - tGen;

  const areaPlaca = (config.placaBase - config.refiladoX) * (config.placaAltura - config.refiladoY);
  const tSolve = performance.now();
  let sol = null;
  try {
    const handle = resolverCobertura(
      pool,
      lines.map(l => l.cant),
      areaPlaca,
      preBoards,
      MASTER_MS,
      { maxNodos: 1_600_000, watchdogMs: Math.max(12000, MASTER_MS + 4000) },
    );
    sol = handle ? handle.resolver(lines.map(l => l.base * l.altura)) : null;
  } catch (e) {
    return { ...rec, poolSize: pool.length, generationMs, masterError: "solve:" + String(e?.message || e), solveMs: performance.now() - tSolve };
  }
  const solveMs = performance.now() - tSolve;

  let candidate = null;
  let validation = null;
  if (sol?.plan) {
    try {
      candidate = materializar(sol.plan, lines, prePlan.opts);
      validation = candidate ? validarPlanIndustrial(candidate, expected) : null;
    } catch (e) {
      return { ...rec, poolSize: pool.length, generationMs, solveMs, masterError: "materialize:" + String(e?.message || e) };
    }
  }
  const masterBoards = candidate?.resumen?.placas ?? sol?.placas ?? null;
  const win = Boolean(validation?.ok && Number.isFinite(masterBoards) && masterBoards < preBoards);
  return {
    ...rec,
    poolSize: pool.length,
    generationMs,
    solveMs,
    nodes: sol?.nodos ?? null,
    exhausted: sol?.agotado ?? null,
    masterBoards,
    masterValid: validation?.ok ?? false,
    win,
    boardsSaved: win ? preBoards - masterBoards : 0,
  };
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const historical = historicalReplay(manifest);
  const raw = JSON.parse(fs.readFileSync(CANONICAL_PATH, "utf8"));
  const all = (Array.isArray(raw) ? raw : raw.cases || []).filter(validRow);
  const byFile = new Map(all.map(row => [features(row).file, row]));
  const labeled = new Set((manifest.cases || []).map(r => basename(r.file)));

  const controlRows = [
    byFile.get("4050594__Mega_Maderas4050594.xml"),
    byFile.get("4057401__GABRIEL_TUMBACO CRUZ4057401.xml"),
    synthetic4056900(),
  ].filter(Boolean);
  const controls = [];
  for (const row of controlRows) {
    const r = runFullMaster(row, "known-winner-control");
    controls.push(r);
    console.log("CONTROL", JSON.stringify({ file: r.file, gap: r.gap, mult: r.features?.multiplicityMean, win: r.win, masterBoards: r.masterBoards }));
  }

  const candidates = all
    .filter(row => !labeled.has(features(row).file))
    .map(row => ({ row, f: features(row) }))
    .filter(x => x.f.multiplicityMean < THRESHOLD)
    .sort((a, b) =>
      (THRESHOLD - a.f.multiplicityMean) - (THRESHOLD - b.f.multiplicityMean) ||
      b.f.pieceCount - a.f.pieceCount ||
      a.f.file.localeCompare(b.f.file)
    );

  const rejected = [];
  let scanned = 0;
  for (const x of candidates) {
    if (scanned >= MAX_SCANNED || rejected.length >= TARGET_REJECTED) break;
    scanned++;
    const preOnly = runPreOnly(x.row, "rejected-precheck");
    if (preOnly.gap !== 1 || !preOnly.preValid) continue;
    const r = runFullMaster(x.row, "rejected-probe");
    rejected.push(r);
    console.log("REJECTED", JSON.stringify({
      file: r.file,
      mult: r.features?.multiplicityMean,
      gap: r.gap,
      preBoards: r.preBoards,
      cota: r.cota,
      win: r.win,
      masterBoards: r.masterBoards,
      generationMs: r.generationMs,
      solveMs: r.solveMs,
    }));
  }

  const rejectWins = rejected.filter(r => r.win);
  const controlWins = controls.filter(r => r.win);
  const summary = {
    schema: "master-gate-v2-candidate",
    generatedAt: new Date().toISOString(),
    threshold: THRESHOLD,
    historical,
    controls: {
      total: controls.length,
      wins: controlWins.length,
      allRecovered: controls.length === 3 && controlWins.length === 3,
      records: controls,
    },
    adversarialRejectedProbe: {
      scanned,
      eligibleGap1Rejected: rejected.length,
      wins: rejectWins.length,
      winFiles: rejectWins.map(r => r.file),
      generationMs: rejected.reduce((s, r) => s + num(r.generationMs), 0),
      solveMs: rejected.reduce((s, r) => s + num(r.solveMs), 0),
      records: rejected,
    },
    pass:
      historical.missedWinners.length === 0 &&
      controls.length === 3 &&
      controls.every(r => r.candidateWouldRun === true) &&
      rejectWins.length === 0,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(summary, null, 2) + "\n", "utf8");
  console.log("SUMMARY", JSON.stringify({
    pass: summary.pass,
    historical: summary.historical,
    controls: { total: summary.controls.total, wins: summary.controls.wins, allRecovered: summary.controls.allRecovered },
    rejected: {
      scanned: summary.adversarialRejectedProbe.scanned,
      eligibleGap1Rejected: summary.adversarialRejectedProbe.eligibleGap1Rejected,
      wins: summary.adversarialRejectedProbe.wins,
    },
  }));
  if (!summary.pass) process.exitCode = 2;
}

main();

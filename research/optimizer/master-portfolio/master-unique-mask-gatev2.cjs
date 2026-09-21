"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const ROOT = path.resolve(__dirname, "../../..");
const CANONICAL_PATH = path.join(ROOT, "experiencia/canonical_cases.json");
const MANIFEST_PATH = path.join(ROOT, "research/optimizer/master-portfolio/MASTER_ACTIVE_323_MANIFEST_2026-09-18.json");
const FIXTURE_4056900 = path.join(ROOT, "research/optimizer/pattern-generators/guide-slice/INDUSTRIAL_PORTFOLIO_4056900_CHECKPOINT_2026-09-14.json");
const OUT_DIR = path.join(ROOT, "research/optimizer/master-portfolio/out");
const OUT_PATH = path.join(OUT_DIR, "MASTER_UNIQUE_MASK_GATEV2_2026-09-21.json");

const LEGACY = path.join(ROOT, "src/lib/optimizer/legacy");
const { optimizarV10, nuevasMetricas, validarPlanIndustrial } = require(path.join(LEGACY, "v10.cjs"));
const { calidadPlanPlacas, compararCalidad } = require(path.join(LEGACY, "motor.cjs"));

const THRESHOLD = Number(process.env.MASTER_GATE_MULT || 4.75);
const MASTER_MS = Number(process.env.MASTER_GATE_MS || 8000);
const LIMIT = Number(process.env.UNIQUE_MASK_LIMIT || 0);

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
function gateV2(m) {
  const gap = num(m.preMasterBoards) - num(m.lowerBound);
  const multiplicityMean = num(m.typeCount) > 0 ? num(m.pieces) / num(m.typeCount) : 0;
  return gap > 1 || multiplicityMean >= THRESHOLD;
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
function toConfig(row, uniqueMasks) {
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
    maxPiezasCache: 3000,
    usarCompactacion: true,
    usarMultiSlice: true,
    usarOneBoard: true,
    usarMaster: true,
    usarMasterGateV2: false,
    usarRustPatternGenerator: false,
    usarMascarasUnicasMasterLe4: uniqueMasks,
    rondasPatrones: 40,
    msMaster: MASTER_MS,
  };
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

function synthetic4057401() {
  // Frozen sentinel used by tests/optimizer/master-unique-masks.test.ts.
  return {
    case_id: "4057401__GABRIEL_TUMBACO CRUZ4057401",
    source_path: "4057401__GABRIEL_TUMBACO CRUZ4057401.xml",
    source_format: "project",
    stock_width: 2742,
    stock_height: 1822,
    saw: 4.5,
    directional: false,
    piece_count: 19,
    piece_types: 4,
    pieces: [
      { base: 1800, altura: 1050, cant: 2 },
      { base: 2000, altura: 1100, cant: 2 },
      { base: 1900, altura: 1500, cant: 1 },
      { base: 744, altura: 450, cant: 14 },
    ],
    _syntheticFrozen: true,
  };
}
function run(row, uniqueMasks) {
  const lines = toLines(row);
  const expected = lines.reduce((s, l) => s + num(l.cant), 0);
  const config = toConfig(row, uniqueMasks);
  const started = performance.now();
  try {
    const out = optimizarV10(lines, config, nuevasMetricas());
    const wallMs = performance.now() - started;
    const valid = out?.plan ? validarPlanIndustrial(out.plan, expected) : null;
    const quality = out?.plan ? calidadPlanPlacas(out.plan.placas || [], out.plan.opts || config) : null;
    return {
      uniqueMasks,
      wallMs,
      valid: valid?.ok ?? false,
      boards: out?.plan?.resumen?.placas ?? null,
      cota: out?.cota ?? null,
      master: out?.metricas?.master ?? null,
      maskPolicy: config._patternMaskPolicy ?? null,
      quality,
    };
  } catch (e) {
    return {
      uniqueMasks,
      wallMs: performance.now() - started,
      error: String(e?.stack || e?.message || e),
    };
  }
}
function qualityCmp(a, b) {
  if (!a || !b) return null;
  return compararCalidad(a, b);
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const raw = JSON.parse(fs.readFileSync(CANONICAL_PATH, "utf8"));
  const all = Array.isArray(raw) ? raw : raw.cases || [];
  const byFile = new Map(all.map(row => [features(row).file, row]));

  let targets = (manifest.cases || [])
    .filter(gateV2)
    .filter(m => num(m.typeCount) >= 1 && num(m.typeCount) <= 4)
    .sort((a, b) => num(b.generationMs) - num(a.generationMs));
  if (LIMIT > 0) targets = targets.slice(0, LIMIT);

  const records = [];
  const unavailable = [];

  for (let i = 0; i < targets.length; i++) {
    const m = targets[i];
    let row =
      num(m.order) === 4056900 ? synthetic4056900() :
      num(m.order) === 4057401 ? synthetic4057401() :
      byFile.get(basename(m.file));
    if (!row) {
      row = all.find(r => String(r.case_id || r.source_path || "").includes(String(m.order)));
    }
    if (!row) {
      unavailable.push({ order: m.order, reason: "missing-canonical-row" });
      continue;
    }

    const f = features(row);
    if (f.pieceCount !== num(m.pieces) || f.typeCount !== num(m.typeCount)) {
      unavailable.push({
        order: m.order,
        reason: "snapshot-mismatch",
        historical: { pieces: num(m.pieces), typeCount: num(m.typeCount) },
        current: { pieces: f.pieceCount, typeCount: f.typeCount },
      });
      continue;
    }

    const candidateFirst = i % 2 === 1;
    let baseline, candidate;
    if (candidateFirst) {
      candidate = run(row, true);
      baseline = run(row, false);
    } else {
      baseline = run(row, false);
      candidate = run(row, true);
    }

    const historicalParity = baseline.valid && baseline.boards === num(m.finalBoards);
    const boardParity = baseline.valid && candidate.valid && baseline.boards === candidate.boards;
    const qcmp = boardParity ? qualityCmp(candidate.quality, baseline.quality) : null;
    const remnantNotWorse = qcmp == null ? false : qcmp >= 0;
    const masterWinParity =
      num(baseline.master?.ganancias) === num(candidate.master?.ganancias) &&
      num(baseline.master?.placasAhorradas) === num(candidate.master?.placasAhorradas);

    const rec = {
      order: m.order,
      file: f.file,
      historical: {
        finalBoards: num(m.finalBoards),
        preMasterBoards: num(m.preMasterBoards),
        lowerBound: num(m.lowerBound),
        masterWin: Boolean(m.masterWin),
        generationMs: num(m.generationMs),
        monotypeMs: num(m.monotypeMs),
        solveMs: num(m.solveMs),
      },
      features: f,
      candidateFirst,
      baseline,
      candidate,
      historicalParity,
      boardParity,
      remnantNotWorse,
      masterWinParity,
      masterSavedMs: num(baseline.master?.ms) - num(candidate.master?.ms),
      wallSavedMs: num(baseline.wallMs) - num(candidate.wallMs),
    };
    records.push(rec);
    console.log("UNIQUE_MASK_PAIR", JSON.stringify({
      order: rec.order,
      types: f.typeCount,
      pieces: f.pieceCount,
      historicalParity,
      boardParity,
      remnantNotWorse,
      masterWinParity,
      baselineBoards: baseline.boards,
      candidateBoards: candidate.boards,
      baselineMasterMs: baseline.master?.ms,
      candidateMasterMs: candidate.master?.ms,
      wallSavedMs: rec.wallSavedMs,
      mask: candidate.maskPolicy,
    }));
  }

  const scored = records.filter(r => r.historicalParity);
  const safe = scored.filter(r => r.boardParity && r.remnantNotWorse && r.masterWinParity);
  const sum = (xs, fn) => xs.reduce((s, x) => s + num(fn(x)), 0);
  const baselineMasterMs = sum(scored, r => r.baseline.master?.ms);
  const candidateMasterMs = sum(scored, r => r.candidate.master?.ms);
  const baselineWallMs = sum(scored, r => r.baseline.wallMs);
  const candidateWallMs = sum(scored, r => r.candidate.wallMs);
  const winners = scored.filter(r => r.historical.masterWin);

  const summary = {
    schema: "master-unique-mask-gatev2-v1",
    generatedAt: new Date().toISOString(),
    scope: {
      gate: `gap > 1 || multiplicityMean >= ${THRESHOLD}`,
      typeCount: "1..4",
      rounds: 40,
      uniqueMaskPolicy: "first unique subset mask; per-round seed differences intentionally ignored",
      intendedUse: "research only",
    },
    counts: {
      historicalTargets: targets.length,
      available: records.length,
      unavailable: unavailable.length,
      scoredHistoricalParity: scored.length,
      safe: safe.length,
      boardParity: scored.filter(r => r.boardParity).length,
      remnantNotWorse: scored.filter(r => r.remnantNotWorse).length,
      masterWinParity: scored.filter(r => r.masterWinParity).length,
      affectedHistoricalWinners: winners.map(r => r.order),
      affectedWinnersSafe: winners.filter(r => r.boardParity && r.remnantNotWorse && r.masterWinParity).map(r => r.order),
    },
    timing: {
      baselineMasterMs,
      candidateMasterMs,
      masterSavedMs: baselineMasterMs - candidateMasterMs,
      masterSavedPct: baselineMasterMs ? (baselineMasterMs - candidateMasterMs) / baselineMasterMs : null,
      baselineWallMs,
      candidateWallMs,
      wallSavedMs: baselineWallMs - candidateWallMs,
      wallSavedPct: baselineWallMs ? (baselineWallMs - candidateWallMs) / baselineWallMs : null,
    },
    pass:
      scored.length > 0 &&
      safe.length === scored.length &&
      winners.every(r => r.boardParity && r.remnantNotWorse && r.masterWinParity),
    unavailable,
    records,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(summary, null, 2) + "\n", "utf8");
  console.log("UNIQUE_MASK_SUMMARY", JSON.stringify({
    pass: summary.pass,
    counts: summary.counts,
    timing: summary.timing,
    unavailable,
  }));
  if (!summary.pass) process.exitCode = 2;
}

main();

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const ROOT = path.resolve(__dirname, "../../..");
const CANONICAL_PATH = path.join(ROOT, "experiencia/canonical_cases.json");
const MANIFEST_PATH = path.join(ROOT, "research/optimizer/master-portfolio/MASTER_ACTIVE_323_MANIFEST_2026-09-18.json");
const OUT_DIR = path.join(ROOT, "research/optimizer/master-portfolio/out");
const OUT_PATH = path.join(OUT_DIR, "MASTER_MANDATORY_TYPE_AB_2026-09-21.json");

const LEGACY = path.join(ROOT, "src/lib/optimizer/legacy");
const { optimizarV10, nuevasMetricas, validarPlanIndustrial } = require(path.join(LEGACY, "v10.cjs"));
const { calidadPlanPlacas, compararCalidad } = require(path.join(LEGACY, "motor.cjs"));

const ORDERS = [4053911, 4050613, 4059488];

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
  return { w: num(p?.width ?? p?.base ?? p?.l ?? p?.L), h: num(p?.height ?? p?.altura ?? p?.w ?? p?.W) };
}
function features(row) {
  const ps = Array.isArray(row.pieces) ? row.pieces : [];
  return {
    file: basename(row.source_path || ((row.case_id || "") + ".xml")),
    pieceCount: num(row.piece_count, ps.reduce((s, p) => s + qty(p), 0)),
    typeCount: num(row.piece_types, ps.length),
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
function configFor(row, prune) {
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
    usarMascarasUnicasMasterLe4: false,
    usarPodaTiposObligatoriosMaster: prune,
    rondasPatrones: 40,
    msMaster: 8000,
  };
}
function run(row, prune) {
  const lines = toLines(row);
  const expected = lines.reduce((s, l) => s + num(l.cant), 0);
  const config = configFor(row, prune);
  const t0 = performance.now();
  try {
    const out = optimizarV10(lines, config, nuevasMetricas());
    const wallMs = performance.now() - t0;
    const validation = out?.plan ? validarPlanIndustrial(out.plan, expected) : null;
    const quality = out?.plan ? calidadPlanPlacas(out.plan.placas || [], out.plan.opts || config) : null;
    return {
      prune,
      wallMs,
      valid: validation?.ok ?? false,
      boards: out?.plan?.resumen?.placas ?? null,
      cota: out?.cota ?? null,
      master: out?.metricas?.master ?? null,
      requiredTypes: config._masterRequiredTypeIndices ?? [],
      requiredPolicy: config._patternRequiredTypePolicy ?? null,
      quality,
    };
  } catch (e) {
    return { prune, wallMs: performance.now() - t0, error: String(e?.stack || e?.message || e) };
  }
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const raw = JSON.parse(fs.readFileSync(CANONICAL_PATH, "utf8"));
  const all = Array.isArray(raw) ? raw : raw.cases || [];
  const records = [];

  for (let idx = 0; idx < ORDERS.length; idx++) {
    const order = ORDERS[idx];
    const hist = (manifest.cases || []).find(x => num(x.order) === order);
    const row = all.find(r => String(r.case_id || r.source_path || "").includes(String(order)));
    if (!hist || !row) continue;
    const f = features(row);
    if (f.pieceCount !== num(hist.pieces) || f.typeCount !== num(hist.typeCount)) continue;

    const candidateFirst = idx % 2 === 1;
    let baseline, candidate;
    if (candidateFirst) {
      candidate = run(row, true);
      baseline = run(row, false);
    } else {
      baseline = run(row, false);
      candidate = run(row, true);
    }

    const boardParity = baseline.valid && candidate.valid && baseline.boards === candidate.boards;
    const remnantNotWorse = boardParity && compararCalidad(candidate.quality, baseline.quality) >= 0;
    const masterWinParity =
      num(baseline.master?.ganancias) === num(candidate.master?.ganancias) &&
      num(baseline.master?.placasAhorradas) === num(candidate.master?.placasAhorradas);

    const rec = {
      order,
      features: f,
      historicalFinalBoards: num(hist.finalBoards),
      historicalGenerationMs: num(hist.generationMs),
      baseline,
      candidate,
      historicalParity: baseline.boards === num(hist.finalBoards),
      boardParity,
      remnantNotWorse,
      masterWinParity,
      masterSavedMs: num(baseline.master?.ms) - num(candidate.master?.ms),
      wallSavedMs: num(baseline.wallMs) - num(candidate.wallMs),
    };
    records.push(rec);
    console.log("MANDATORY_AB_PAIR", JSON.stringify({
      order,
      historicalParity: rec.historicalParity,
      boardParity,
      remnantNotWorse,
      masterWinParity,
      requiredTypes: candidate.requiredTypes,
      policy: candidate.requiredPolicy,
      baselineMasterMs: baseline.master?.ms,
      candidateMasterMs: candidate.master?.ms,
      baselineWallMs: baseline.wallMs,
      candidateWallMs: candidate.wallMs,
    }));
  }

  const scored = records.filter(r => r.historicalParity);
  const sum = (xs, fn) => xs.reduce((s, x) => s + num(fn(x)), 0);
  const baselineMasterMs = sum(scored, r => r.baseline.master?.ms);
  const candidateMasterMs = sum(scored, r => r.candidate.master?.ms);
  const baselineWallMs = sum(scored, r => r.baseline.wallMs);
  const candidateWallMs = sum(scored, r => r.candidate.wallMs);

  const summary = {
    schema: "master-mandatory-type-ab-v1",
    generatedAt: new Date().toISOString(),
    counts: {
      attempted: records.length,
      scored: scored.length,
      safe: scored.filter(r => r.boardParity && r.remnantNotWorse && r.masterWinParity).length,
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
    pass: scored.length > 0 && scored.every(r => r.boardParity && r.remnantNotWorse && r.masterWinParity),
    records,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(summary, null, 2) + "\n", "utf8");
  console.log("MANDATORY_AB_SUMMARY", JSON.stringify({ pass: summary.pass, counts: summary.counts, timing: summary.timing }));
  if (!summary.pass) process.exitCode = 2;
}

main();

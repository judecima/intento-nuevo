"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { performance } = require("node:perf_hooks");

const ROOT = path.resolve(__dirname, "../../..");
const CANONICAL_PATH = path.join(ROOT, "experiencia/canonical_cases.json");
const FIXTURE_4056900 = path.join(ROOT, "research/optimizer/pattern-generators/guide-slice/INDUSTRIAL_PORTFOLIO_4056900_CHECKPOINT_2026-09-14.json");
const OUT_DIR = path.join(ROOT, "research/optimizer/master-portfolio/out");
const OUT_PATH = path.join(OUT_DIR, "MASTER_GATE_V2_AB_2026-09-21.json");

const LEGACY = path.join(ROOT, "src/lib/optimizer/legacy");
const { optimizarV10, nuevasMetricas, validarPlanIndustrial } = require(path.join(LEGACY, "v10.cjs"));

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
function validRow(row) {
  const f = features(row);
  return f.file && f.pieceCount > 0 && f.typeCount > 0 &&
    num(row.stock_width) > 0 && num(row.stock_height) > 0 &&
    Array.isArray(row.pieces) && row.pieces.length > 0 &&
    row.pieces.every(p => dims(p).w > 0 && dims(p).h > 0 && qty(p) > 0);
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
function configFor(row, gateOn) {
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
    usarCache: false,
    maxPiezasCache: 160,
    usarCompactacion: true,
    usarMultiSlice: true,
    usarOneBoard: true,
    usarMaster: true,
    usarMasterGateV2: gateOn,
    rondasPatrones: 40,
    msMaster: 8000,
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
  };
}
function stableDigest(plan) {
  if (!plan) return null;
  const normalized = JSON.stringify(plan, (k, v) => {
    if (["metricas", "ms", "peorMs", "tiempoMs", "durationMs"].includes(k)) return undefined;
    return v;
  });
  return crypto.createHash("sha256").update(normalized).digest("hex");
}
function run(row, gateOn) {
  const lines = toLines(row);
  const expected = lines.reduce((s, l) => s + l.cant, 0);
  const cfg = configFor(row, gateOn);
  const t0 = performance.now();
  let out;
  try {
    out = optimizarV10(lines, cfg, nuevasMetricas());
  } catch (e) {
    return { gateOn, error: String(e?.stack || e?.message || e), wallMs: performance.now() - t0 };
  }
  const wallMs = performance.now() - t0;
  const validation = out?.plan ? validarPlanIndustrial(out.plan, expected) : null;
  return {
    gateOn,
    wallMs,
    valid: validation?.ok ?? false,
    boards: out?.plan?.resumen?.placas ?? null,
    cota: out?.cota ?? null,
    digest: stableDigest(out?.plan),
    master: out?.metricas?.master ?? null,
    masterGateV2: out?.metricas?.masterGateV2 ?? null,
  };
}
function runPair(row, kind, index) {
  const f = features(row);
  // Alternar orden para reducir sesgo de warmup.
  const candidateFirst = index % 2 === 1;
  let baseline, candidate;
  if (candidateFirst) {
    candidate = run(row, true);
    baseline = run(row, false);
  } else {
    baseline = run(row, false);
    candidate = run(row, true);
  }
  const parity = Boolean(
    baseline.valid && candidate.valid &&
    baseline.boards === candidate.boards &&
    baseline.digest === candidate.digest
  );
  return {
    kind,
    file: f.file,
    features: f,
    candidateFirst,
    baseline,
    candidate,
    parity,
    wallSavedMs: (baseline.wallMs ?? 0) - (candidate.wallMs ?? 0),
  };
}

function main() {
  const raw = JSON.parse(fs.readFileSync(CANONICAL_PATH, "utf8"));
  const rows = (Array.isArray(raw) ? raw : raw.cases || []).filter(validRow);
  const byFile = new Map(rows.map(r => [features(r).file, r]));

  const rejectNames = [
    "4022878__Patricio_Gonzalez Diaz4022878.xml",
    "4107522__fernando javier_cattaneo4107522.xml",
    "4110101__fernando javier_cattaneo4110101.xml",
    "4038711__julio_sosa4038711.xml",
    "4039344__Mega_Maderas4039344.xml",
    "4098554__MARIA EMILIA_GONZALEZ4098554.xml",
    "4007321__Cesar Norberto_Molina4007321.xml",
    "4118674__Juan Cruz_Speziale4118674.xml"
  ];

  const rejectRows = rejectNames.map(n => byFile.get(n)).filter(Boolean);
  if (rejectRows.length < 6) {
    const wantedOrders = [4022878, 4107522, 4110101, 4038711, 4039344, 4098554, 4007321, 4118674];
    for (const order of wantedOrders) {
      if (rejectRows.some(r => String(r.case_id || "").includes(String(order)))) continue;
      const found = rows.find(r => String(r.case_id || r.source_path || "").includes(String(order)));
      if (found) rejectRows.push(found);
    }
  }

  const controlRows = [
    byFile.get("4050594__Mega_Maderas4050594.xml") || rows.find(r => String(r.case_id || "").includes("4050594")),
    byFile.get("4057401__GABRIEL_TUMBACO CRUZ4057401.xml") || rows.find(r => String(r.case_id || "").includes("4057401")),
    synthetic4056900(),
  ].filter(Boolean);

  const records = [];
  rejectRows.forEach((row, i) => {
    const rec = runPair(row, "rejected", i);
    records.push(rec);
    console.log("AB_REJECT", JSON.stringify({
      file: rec.file,
      mult: rec.features.multiplicityMean,
      parity: rec.parity,
      baseMs: rec.baseline.wallMs,
      candMs: rec.candidate.wallMs,
      baseMaster: rec.baseline.master,
      candMaster: rec.candidate.master,
      gate: rec.candidate.masterGateV2,
    }));
  });
  controlRows.forEach((row, i) => {
    const rec = runPair(row, "control", rejectRows.length + i);
    records.push(rec);
    console.log("AB_CONTROL", JSON.stringify({
      file: rec.file,
      mult: rec.features.multiplicityMean,
      parity: rec.parity,
      baseMs: rec.baseline.wallMs,
      candMs: rec.candidate.wallMs,
      gate: rec.candidate.masterGateV2,
    }));
  });

  const rejects = records.filter(r => r.kind === "rejected");
  const controls = records.filter(r => r.kind === "control");
  const sum = (xs, fn) => xs.reduce((s, x) => s + (fn(x) || 0), 0);
  const baselineRejectMs = sum(rejects, r => r.baseline.wallMs);
  const candidateRejectMs = sum(rejects, r => r.candidate.wallMs);
  const rejectMasterSkipped = rejects.filter(r =>
    (r.baseline.master?.activaciones || 0) > 0 &&
    (r.candidate.master?.activaciones || 0) === 0 &&
    (r.candidate.masterGateV2?.skipped || 0) > 0
  );
  const controlsAllowed = controls.filter(r =>
    (r.candidate.masterGateV2?.skipped || 0) === 0 &&
    ((r.candidate.masterGateV2?.allowedGap || 0) > 0 ||
     (r.candidate.masterGateV2?.allowedMultiplicity || 0) > 0)
  );

  const summary = {
    schema: "master-gate-v2-ab",
    generatedAt: new Date().toISOString(),
    config: {
      gate: "gap > 1 || multiplicityMean >= 4.75",
      rounds: 40,
      msMaster: 8000,
      usarCache: false,
    },
    counts: {
      rejects: rejects.length,
      controls: controls.length,
      rejectParity: rejects.filter(r => r.parity).length,
      controlParity: controls.filter(r => r.parity).length,
      rejectMasterSkipped: rejectMasterSkipped.length,
      controlsAllowed: controlsAllowed.length,
    },
    timing: {
      baselineRejectMs,
      candidateRejectMs,
      savedMs: baselineRejectMs - candidateRejectMs,
      savedPct: baselineRejectMs ? (baselineRejectMs - candidateRejectMs) / baselineRejectMs : null,
    },
    pass:
      rejects.length >= 6 &&
      rejects.every(r => r.parity) &&
      controls.length === 3 &&
      controls.every(r => r.parity) &&
      rejectMasterSkipped.length === rejects.length &&
      controlsAllowed.length === controls.length,
    records,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(summary, null, 2) + "\n", "utf8");
  console.log("AB_SUMMARY", JSON.stringify({
    pass: summary.pass,
    counts: summary.counts,
    timing: summary.timing,
  }));
  if (!summary.pass) process.exitCode = 2;
}

main();

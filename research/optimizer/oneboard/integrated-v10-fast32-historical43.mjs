import { createRequire } from "node:module";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

import { optimizarV10ConOneBoardFast32Research } from "./integrated-v10-fast32-research.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(new URL("../../../", import.meta.url).pathname);
const FIXTURE = path.join(
  ROOT,
  "research/optimizer/pattern-generators/guide-row/fixtures/HISTORICAL_43_LEPTON_GAPS.json.gz.b64",
);

process.env.OPTIMIZER_RUST_BEAM_RANK_CACHE_EXPERIMENTAL = "1";
process.env.OPTIMIZER_RUST_LEAN_BEAM_EXPERIMENTAL = "1";
process.env.OPTIMIZER_RUST_GREEDY_PLAN_EXPERIMENTAL = "1";
process.env.OPTIMIZER_RUST_LARGE_ROUND_EXPERIMENTAL = "1";
process.env.OPTIMIZER_RUST_SIMPLE_CHOOSE_EXPERIMENTAL = "1";
process.env.OPTIMIZER_RUST_MASTER_ROUND_REUSE_EXPERIMENTAL = "0";
process.env.OPTIMIZER_MASTER_UNIQUE_MASKS_LE4_EXPERIMENTAL = "1";

const {
  optimizarV10,
  nuevasMetricas,
  validarPlanIndustrial,
} = require(path.join(ROOT, "src/lib/optimizer/legacy/v10.cjs"));
const {
  calidadPlanPlacas,
  compararCalidad,
} = require(path.join(ROOT, "src/lib/optimizer/legacy/motor.cjs"));

function loadCases() {
  return JSON.parse(
    zlib
      .gunzipSync(Buffer.from(fs.readFileSync(FIXTURE, "utf8").trim(), "base64"))
      .toString("utf8"),
  );
}

function lines(c) {
  return c.types.map((t, i) => ({
    base: +t.w,
    altura: +t.h,
    cant: +t.q,
    veta: Boolean(t.locked),
    canRotate: !Boolean(t.locked),
    ref: String(i),
    detalle: String(t.ref ?? i),
    cantos: null,
  }));
}

function config(c) {
  return {
    placaBase: +c.width,
    placaAltura: +c.height,
    refiladoX: 0,
    refiladoY: 0,
    sierra: +c.saw,
    etapas: 4,
    materialConVeta: Boolean(c.directional),
    descontarCanto: false,
    cantoEspesor: 0,
    restoMin: 250,
    restoMax: 400,
    usarOneBoard: true,
    usarMaster: true,
    usarMultiSlice: true,
    usarCompactacion: true,
    usarRustPatternGenerator: true,
    usarCache: false,
    maxPiezasCache: 0,
    rondasPatrones: 40,
    msMaster: 8000,
    maxNodosMaster: 1600000,
    watchdogMasterMs: 12000,
    usarCotaBarataPostCompactacion: true,
    usarDffFs0PostCompactacion: true,
    usarMascarasUnicasMasterLe4: true,
    minPiezasMultiSliceExperimental: 200,
    maxPiezasMultiSliceExperimental: 500,
    masterIndustrialRulesV3Experimental: true,
  };
}

function expectedPieces(ls) {
  return ls.reduce((sum, line) => sum + Number(line.cant || 0), 0);
}

function quality(plan, C) {
  return calidadPlanPlacas(plan?.placas || [], plan?.opts || C);
}

function digest(plan) {
  const payload = (plan?.placas || []).map((board) => ({
    placements: (board.colocadas || [])
      .map((p) => [
        String(p?.pieza?.ref),
        p.x,
        p.y,
        p.base,
        p.altura,
        Boolean(p.rotada),
        p.nivel ?? 0,
      ])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    cuts: (board.cortes || [])
      .map((c) => [c.x1, c.y1, c.x2, c.y2, c.nivel ?? 0, Boolean(c.terminal)])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    remnants: (board.restos || [])
      .map((r) => [r.x, r.y, r.w, r.h])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  }));
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function timed(fn) {
  const t0 = process.hrtime.bigint();
  const value = fn();
  return { value, ms: Number(process.hrtime.bigint() - t0) / 1e6 };
}

const cases = loadCases().filter((c) => Number(c.leptonBoards) === 1);
const rows = [];

let invalid = 0;
let accepted = 0;
let boardRegression = 0;
let fallbackParityMismatch = 0;
let capturedOpen = 0;
let openReference = 0;
let nondirectionalAccepted = 0;

for (const c of cases) {
  const ls = lines(c);
  const C = config(c);
  const expected = expectedPieces(ls);

  const integratedRun = timed(() =>
    optimizarV10ConOneBoardFast32Research(ls, C, nuevasMetricas()),
  );
  const referenceRun = timed(() => optimizarV10(ls, C, nuevasMetricas()));

  const a = integratedRun.value.plan;
  const b = referenceRun.value.plan;
  const validA = Boolean(a && validarPlanIndustrial(a, expected)?.ok);
  const validB = Boolean(b && validarPlanIndustrial(b, expected)?.ok);
  if (!validA || !validB) invalid++;

  const ba = Number(a?.resumen?.placas ?? Infinity);
  const bb = Number(b?.resumen?.placas ?? Infinity);
  const telemetry = integratedRun.value.oneboardFast32Research;
  const won = Boolean(telemetry?.accepted);

  if (bb > 1) openReference++;
  if (telemetry?.capturedAttempts > 0 && telemetry?.diagnosticLeft > 0) {
    capturedOpen++;
  }

  if (ba > bb) boardRegression++;
  if (won) {
    accepted++;
    if (!c.directional) nondirectionalAccepted++;
    if (!(ba < bb)) boardRegression++;
  } else if (validA && validB) {
    const qcmp =
      ba === bb ? compararCalidad(quality(a, C), quality(b, C)) : null;
    const sameDigest = digest(a) === digest(b);
    if (!(ba === bb && qcmp === 0 && sameDigest)) fallbackParityMismatch++;
  }

  rows.push({
    order: c.order,
    structuralFp: c.structuralFp,
    directional: Boolean(c.directional),
    class: won ? "FAST32_ACCEPTED" : "V3_FALLBACK",
    integratedBoards: Number.isFinite(ba) ? ba : null,
    v3Boards: Number.isFinite(bb) ? bb : null,
    validIntegrated: validA,
    validV3: validB,
    digestEqual: validA && validB ? digest(a) === digest(b) : false,
    accepted: won,
    reason: telemetry?.reason ?? null,
    capturedAttempts: telemetry?.capturedAttempts ?? 0,
    diagnosticLeft: telemetry?.diagnosticLeft ?? null,
    rootBandAttempts: telemetry?.rootBandAttempts ?? 0,
    siblingChecks: telemetry?.siblingChecks ?? 0,
    captureBaseWallMs: telemetry?.baseWallMs ?? null,
    repairWallMs: telemetry?.repairWallMs ?? null,
    integratedWallMs: integratedRun.ms,
    referenceWallMs: referenceRun.ms,
  });
}

const repairTimes = rows
  .map((r) => Number(r.repairWallMs))
  .filter((x) => Number.isFinite(x) && x > 0);
const quantile = (a, q) => {
  if (!a.length) return null;
  const x = a.slice().sort((m, n) => m - n);
  const p = (x.length - 1) * q;
  const lo = Math.floor(p);
  const hi = Math.ceil(p);
  return lo === hi ? x[lo] : x[lo] + (x[hi] - x[lo]) * (p - lo);
};

const summary = {
  cases: cases.length,
  openReference,
  capturedOpen,
  accepted,
  nondirectionalAccepted,
  invalid,
  boardRegression,
  fallbackParityMismatch,
  acceptedOrders: rows.filter((r) => r.accepted).map((r) => r.order),
  totalRepairMs: repairTimes.reduce((sum, x) => sum + x, 0),
  repairP50: quantile(repairTimes, 0.5),
  repairP95: quantile(repairTimes, 0.95),
  repairP99: quantile(repairTimes, 0.99),
  integratedTotalMs: rows.reduce((sum, r) => sum + r.integratedWallMs, 0),
  referenceTotalMs: rows.reduce((sum, r) => sum + r.referenceWallMs, 0),
};

const outPath = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "integrated-v10-fast32-historical43-results.json",
);
fs.writeFileSync(outPath, JSON.stringify({ summary, rows }, null, 2) + "\n");

console.log("FAST32_CAPTURED_INTEGRATION " + JSON.stringify(summary));

if (invalid || boardRegression || fallbackParityMismatch) process.exitCode = 2;

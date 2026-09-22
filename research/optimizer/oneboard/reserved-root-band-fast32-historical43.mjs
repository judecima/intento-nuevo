import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

import {
  RESERVED_ROOT_BAND_FAST32_VERSION,
  diagnoseOneBoardMiss,
  tryReservedRootBandFast32,
} from "./reserved-root-band-fast32.mjs";

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

function demandOk(plan, ls) {
  const expected = new Map(
    ls.map((line, index) => [
      String(line.ref ?? index),
      Number(line.cant || 0),
    ]),
  );
  const actual = new Map();
  for (const board of plan?.placas || []) {
    for (const placed of board.colocadas || []) {
      const key = String(placed?.pieza?.ref);
      actual.set(key, (actual.get(key) || 0) + 1);
    }
  }
  if (expected.size !== actual.size) return false;
  for (const [key, count] of expected) {
    if (actual.get(key) !== count) return false;
  }
  return true;
}

function timed(fn) {
  const t0 = process.hrtime.bigint();
  const value = fn();
  return { value, ms: Number(process.hrtime.bigint() - t0) / 1e6 };
}

const all = loadCases();
const oneBoardReference = all.filter((c) => Number(c.leptonBoards) === 1);
const rows = [];

let invalid = 0;
let currentOpen = 0;
let certified = 0;
let strictWins = 0;
let boardRegressions = 0;
let nondirectionalOpen = 0;
let nondirectionalWins = 0;

for (const c of oneBoardReference) {
  const ls = lines(c);
  const C = config(c);
  const expected = ls.reduce((sum, line) => sum + Number(line.cant || 0), 0);

  const v3Run = timed(() => optimizarV10(ls, C, nuevasMetricas()));
  const v3 = v3Run.value.plan;
  const v3Valid =
    Boolean(v3 && validarPlanIndustrial(v3, expected)?.ok) && demandOk(v3, ls);

  if (!v3Valid) {
    invalid++;
    rows.push({
      order: c.order,
      class: "INVALID_V3",
      v3Ms: v3Run.ms,
    });
    continue;
  }

  const v3Boards = Number(v3.resumen.placas);
  if (v3Boards <= 1) {
    rows.push({
      order: c.order,
      directional: Boolean(c.directional),
      class: "ALREADY_CLOSED",
      leptonBoards: c.leptonBoards,
      v3Boards,
      v3Ms: v3Run.ms,
    });
    continue;
  }

  currentOpen++;
  if (!c.directional) nondirectionalOpen++;

  const diagnosticRun = timed(() => diagnoseOneBoardMiss(ls, C));
  const repairRun = timed(() =>
    tryReservedRootBandFast32(ls, C, diagnosticRun.value),
  );
  const repair = repairRun.value;

  let chosen = v3;
  let repairValid = false;
  if (repair.certified && repair.plan) {
    repairValid =
      Boolean(validarPlanIndustrial(repair.plan, expected)?.ok) &&
      demandOk(repair.plan, ls);
    if (!repairValid) invalid++;
    else {
      certified++;
      if (repair.plan.resumen.placas < v3Boards) {
        chosen = repair.plan;
        strictWins++;
        if (!c.directional) nondirectionalWins++;
      }
    }
  }

  const chosenBoards = Number(chosen.resumen.placas);
  if (chosenBoards > v3Boards) boardRegressions++;

  rows.push({
    order: c.order,
    structuralFp: c.structuralFp,
    directional: Boolean(c.directional),
    pieces: c.pieces,
    typeCount: c.typeCount,
    class:
      chosenBoards < v3Boards
        ? "FAST32_WIN"
        : repair.certified
          ? "CERTIFIED_NO_BOARD_WIN"
          : "FAST32_MISS",
    leptonBoards: c.leptonBoards,
    v3Boards,
    repairBoards: repair.plan?.resumen?.placas ?? null,
    chosenBoards,
    repairValid,
    diagnosticLeft: diagnosticRun.value?.left ?? null,
    missing: diagnosticRun.value?.missing ?? [],
    rootBandAttempts: repair.rootBandAttempts ?? 0,
    siblingChecks: repair.siblingChecks ?? 0,
    cheapSiblingRejects: repair.cheapSiblingRejects ?? 0,
    v3Ms: v3Run.ms,
    diagnosticMs: diagnosticRun.ms,
    repairMs: repairRun.ms,
  });
}

const wins = rows.filter((r) => r.class === "FAST32_WIN");
const summary = {
  version: RESERVED_ROOT_BAND_FAST32_VERSION,
  historical43Cases: all.length,
  leptonOneBoardCases: oneBoardReference.length,
  currentOpen,
  certified,
  strictWins,
  invalid,
  boardRegressions,
  nondirectionalOpen,
  nondirectionalWins,
  winOrders: wins.map((r) => r.order),
  uniqueWinStructural: new Set(wins.map((r) => r.structuralFp)).size,
  v3TotalMs: rows.reduce((sum, r) => sum + (Number(r.v3Ms) || 0), 0),
  diagnosticTotalMs: rows.reduce(
    (sum, r) => sum + (Number(r.diagnosticMs) || 0),
    0,
  ),
  repairTotalMs: rows.reduce((sum, r) => sum + (Number(r.repairMs) || 0), 0),
};

const outPath = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "reserved-root-band-fast32-historical43-results.json",
);
fs.writeFileSync(outPath, JSON.stringify({ summary, rows }, null, 2) + "\n");

console.log("RESERVED_ROOT_BAND_FAST32_HIST43 " + JSON.stringify(summary));
console.log(
  "RESERVED_ROOT_BAND_FAST32_WINS " +
    JSON.stringify(
      wins.map((r) => ({
        order: r.order,
        directional: r.directional,
        v3: r.v3Boards,
        repair: r.repairBoards,
        diagnosticLeft: r.diagnosticLeft,
        rootBandAttempts: r.rootBandAttempts,
        siblingChecks: r.siblingChecks,
        repairMs: r.repairMs,
      })),
    ),
);

if (invalid || boardRegressions) process.exitCode = 2;

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { buildGuideRowCandidate } from "./complete-candidate.mjs";

const require = createRequire(import.meta.url);
const {
  optimizarV10,
  nuevasMetricas,
  validarPlanIndustrial,
} = require("../../../../src/lib/optimizer/legacy/v10.cjs");
const {
  calidadPlanPlacas,
  compararCalidad,
} = require("../../../../src/lib/optimizer/legacy/motor.cjs");

process.env.OPTIMIZER_RUST_BEAM_RANK_CACHE_EXPERIMENTAL = "1";
process.env.OPTIMIZER_RUST_LEAN_BEAM_EXPERIMENTAL = "1";
process.env.OPTIMIZER_RUST_GREEDY_PLAN_EXPERIMENTAL = "1";
process.env.OPTIMIZER_RUST_LARGE_ROUND_EXPERIMENTAL = "1";
process.env.OPTIMIZER_RUST_SIMPLE_CHOOSE_EXPERIMENTAL = "1";
process.env.OPTIMIZER_MASTER_UNIQUE_MASKS_LE4_EXPERIMENTAL = "1";

const external = JSON.parse(
  readFileSync(new URL("../guide-slice/fixtures/4961912-normalized.json", import.meta.url), "utf8"),
);
const lines = external.lines.map((line) => ({
  ...line,
  detalle: line.ref,
  veta: false,
  cantos: null,
}));

const config = {
  placaBase: external.board.l,
  placaAltura: external.board.w,
  refiladoX: external.board.trim,
  refiladoY: external.board.trim,
  sierra: external.board.saw,
  etapas: 4,
  materialConVeta: false,
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

const pieces = lines.reduce((sum, line) => sum + line.cant, 0);

function timed(fn) {
  const cpu0 = process.cpuUsage();
  const t0 = process.hrtime.bigint();
  const value = fn();
  const d = process.cpuUsage(cpu0);
  return {
    value,
    wallMs: Number(process.hrtime.bigint() - t0) / 1e6,
    cpuMs: (d.user + d.system) / 1000,
  };
}

const referenceRun = timed(() => optimizarV10(lines, config, nuevasMetricas()));
const reference = referenceRun.value.plan;
assert.ok(reference);
assert.equal(validarPlanIndustrial(reference, pieces).ok, true);

const candidateRun = timed(() =>
  buildGuideRowCandidate(lines, config, {
    maxCandidates: 6,
    passes: 1,
    restartsPerBoard: 1,
  }),
);
const candidate = candidateRun.value.plan;
assert.equal(candidateRun.value.status, "COMPLETE");
assert.ok(candidate);
assert.equal(validarPlanIndustrial(candidate, pieces).ok, true);

const refQuality = calidadPlanPlacas(reference.placas, reference.opts || config);
const candQuality = calidadPlanPlacas(candidate.placas, candidate.opts || config);
const qualityCmp = compararCalidad(candQuality, refQuality);

const summary = {
  case: external.caseId,
  pieces,
  types: lines.length,
  lowerBound: external.areaLowerBound,
  reference: {
    boards: reference.resumen.placas,
    wallMs: referenceRun.wallMs,
    cpuMs: referenceRun.cpuMs,
    quality: refQuality,
    metrics: referenceRun.value.metricas,
  },
  candidate: {
    boards: candidate.resumen.placas,
    wallMs: candidateRun.wallMs,
    cpuMs: candidateRun.cpuMs,
    quality: candQuality,
    qualityCmpVsReference: qualityCmp,
    telemetry: candidateRun.value.telemetry,
  },
};

console.log("H2B_4961912 " + JSON.stringify(summary));

assert.ok(
  candidate.resumen.placas <= reference.resumen.placas,
  "H2b may not use more boards than current V3 reference",
);
if (candidate.resumen.placas === reference.resumen.placas) {
  assert.ok(
    qualityCmp >= 0,
    "H2b may not regress accepted equal-board remnant quality",
  );
}

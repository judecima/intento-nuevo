#!/usr/bin/env node
/**
 * V20 remnant-quality repair evaluator.
 *
 * A = V20 certified baseline (current early return)
 * B = the global dead-strip compactation pass V20 currently skips
 * C = experimental per-board defragmentation
 *
 * We intentionally do NOT run MultiSlice/OneBoard/Master here. The measured
 * regression is the equal-board remnant polish lost by skipping compactation,
 * so B is the exact quality reference this repair must recover.
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const v10 = require("../src/lib/optimizer/legacy/v10.cjs");
const {
  calidadPlanPlacas,
  compararCalidad,
} = require("../src/lib/optimizer/legacy/motor.cjs");
const { validarPlanIndustrial } = require("../src/lib/optimizer/legacy/validador_industrial_v3.cjs");
const {
  defragmentarPlanPorPlaca,
  compactacionGlobalReferencia,
} = require("../src/lib/optimizer/experimental/per-board-remnant-defrag.cjs");

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const corpus = resolve(String(args.corpus ?? "D:/proyectos asistidos/lepton/data/lepton-xml"));
const filesPath = typeof args.files === "string" ? resolve(args.files) : null;
const v20Checkpoint = typeof args.v20 === "string" ? resolve(args.v20) : null;
const outPath = resolve(String(args.out ?? "experiencia/v20-remnant-defrag-eval.json"));
const limit = args.limit === undefined ? null : positiveInt(args.limit, null);

if (!existsSync(corpus)) throw new Error(`no existe corpus: ${corpus}`);
if (!filesPath && !v20Checkpoint) {
  throw new Error("usar --files <lista.txt> o --v20 <checkpoint.jsonl>");
}

const bundlePath = join(REPO, "node_modules", ".cache", "experience-benchmark", "optimizer.mjs");
if (!existsSync(bundlePath)) {
  console.error("falta el bundle; correr: node scripts/experience-benchmark.mjs report --rebuild");
  process.exit(2);
}
const optimizer = await import(pathToFileURL(bundlePath).href + `?v20remnant=${Date.now()}`);

let files = filesPath ? readFileList(filesPath) : certifiedFilesFromCheckpoint(v20Checkpoint);
if (limit !== null) files = files.slice(0, limit);
if (!files.length) throw new Error("no hay archivos para evaluar");

mkdirSync(dirname(outPath), { recursive: true });

const rows = [];
for (let index = 0; index < files.length; index++) {
  const file = files[index];
  const xmlPath = join(corpus, file);
  const started = performance.now();

  let row;
  try {
    if (!existsSync(xmlPath)) throw new Error(`missing-xml: ${xmlPath}`);
    const xml = readFileSync(xmlPath, "utf8");
    const parsed = optimizer.parseCanonicalXml(xml, { fileName: file });
    if (!parsed?.case) throw new Error("canonical case ausente");
    const input = optimizer.benchmarkInputFromCanonicalCase(parsed.case, { strategy: "v10" });
    const lineas = toLegacyLines(input);
    const options = toLegacyOptions(input);
    const piezasEsperadas = lineas.reduce((sum, line) => sum + (+line.cant || 0), 0);

    // A: current V20 early-certified result.
    const metricsA = v10.nuevasMetricas();
    const a = v10.optimizarV10(
      lineas,
      { ...options, usarCotaBarataAntesCompactacion: true },
      metricsA,
    );
    const certified = Number(metricsA?.lowerBound?.certifiedAfterBaseline ?? 0) > 0;
    if (!certified) {
      row = {
        file,
        ok: true,
        certified: false,
        skipped: "not-certified-by-v20",
        totalEvalMs: performance.now() - started,
      };
      rows.push(row);
      console.log(`[${index + 1}/${files.length}] SKIP ${file} no certificado`);
      continue;
    }

    const qA = calidadPlanPlacas(a.plan.placas, a.plan.opts || options);
    const boardsA = a.plan.resumen.placas;

    // B: exact compactation stage reference, but only when legacy V10 would
    // actually activate it. This reproduces the lost objective-#2 opportunity.
    const compactationWouldRun = debeEjecutarCompactacionGlobal(lineas, options);
    let bPlan = a.plan;
    let bMs = 0;
    let bAccepted = false;
    let bValid = true;
    let bError = null;

    if (compactationWouldRun) {
      const b = compactacionGlobalReferencia(lineas, options);
      bMs = b.ms;
      bError = b.error;
      if (b.plan) {
        const validationB = validarPlanIndustrial(b.plan, piezasEsperadas);
        bValid = !!validationB?.ok;
        const sameBoards = b.plan?.resumen?.placas === boardsA;
        const qCandidateB = calidadPlanPlacas(b.plan.placas || [], b.plan.opts || options);
        if (bValid && sameBoards && compararCalidad(qCandidateB, qA) > 0) {
          bPlan = b.plan;
          bAccepted = true;
        }
      }
    }
    const qB = calidadPlanPlacas(bPlan.placas, bPlan.opts || options);

    // C: local one-board-at-a-time repair.
    const c = defragmentarPlanPorPlaca(a.plan, { piezasEsperadas });
    const qC = calidadPlanPlacas(c.plan.placas, c.plan.opts || options);
    const boardsC = c.plan?.resumen?.placas ?? c.plan?.placas?.length ?? null;

    const cVsA = compararCalidad(qC, qA);
    const cVsB = compararCalidad(qC, qB);
    const boardSafe = boardsC === boardsA;
    const qualitySafeAgainstReference = !bAccepted || cVsB >= 0;

    row = {
      file,
      ok: true,
      certified: true,
      boardsA,
      boardsC,
      cota: a.cota,
      compactationWouldRun,
      globalCompactationAccepted: bAccepted,
      globalCompactationValid: bValid,
      globalCompactationError: bError,
      globalCompactationMs: bMs,
      perBoardMs: c.ms,
      perBoardAttemptedBoards: c.attemptedBoards,
      perBoardImprovedBoards: c.improvedBoards,
      perBoardRejectedBoards: c.rejectedBoards,
      perBoardInvalidFinal: c.invalidFinal,
      boardSafe,
      qualitySafeAgainstReference,
      cVsA,
      cVsB,
      qualityA: qA,
      qualityB: qB,
      qualityC: qC,
      totalEvalMs: performance.now() - started,
    };

    console.log(
      `[${index + 1}/${files.length}] ${file} placas=${boardsA}` +
      ` compact=${bAccepted ? "IMPROVE" : compactationWouldRun ? "run" : "off"}` +
      ` perBoard=${c.changed ? `+${c.improvedBoards}` : "same"}` +
      ` CvsB=${cVsB} Bms=${bMs.toFixed(1)} Cms=${c.ms.toFixed(1)}`,
    );
  } catch (error) {
    row = {
      file,
      ok: false,
      error: String(error?.stack ?? error?.message ?? error),
      totalEvalMs: performance.now() - started,
    };
    console.error(`[${index + 1}/${files.length}] ERROR ${file}: ${error?.message ?? error}`);
  }
  rows.push(row);
}

const certifiedRows = rows.filter((x) => x.ok && x.certified);
const refImproved = certifiedRows.filter((x) => x.globalCompactationAccepted);
const misses = refImproved.filter((x) => !x.qualitySafeAgainstReference);
const invalids = certifiedRows.filter((x) => x.perBoardInvalidFinal);
const boardRegressions = certifiedRows.filter((x) => !x.boardSafe);
const globalMs = certifiedRows.reduce((sum, x) => sum + (+x.globalCompactationMs || 0), 0);
const perBoardMs = certifiedRows.reduce((sum, x) => sum + (+x.perBoardMs || 0), 0);

const report = {
  filesRequested: files.length,
  rowsOk: rows.filter((x) => x.ok).length,
  errors: rows.filter((x) => !x.ok).map((x) => ({ file: x.file, error: x.error })),
  certified: certifiedRows.length,
  compactationActivations: certifiedRows.filter((x) => x.compactationWouldRun).length,
  referenceRemnantImprovements: refImproved.length,
  perBoardChangedCases: certifiedRows.filter((x) => x.perBoardImprovedBoards > 0).length,
  referenceImprovementsRecoveredOrBeaten: refImproved.length - misses.length,
  referenceImprovementsMissed: misses.length,
  missedFiles: misses.map((x) => ({ file: x.file, cVsB: x.cVsB, qualityB: x.qualityB, qualityC: x.qualityC })),
  boardRegressions: boardRegressions.length,
  invalidFinalPlans: invalids.length,
  globalCompactationMs: globalMs,
  perBoardMs,
  perBoardVsGlobalRatio: globalMs > 0 ? perBoardMs / globalMs : null,
  gate: {
    boards: boardRegressions.length === 0,
    validation: invalids.length === 0,
    remnant: misses.length === 0,
    pass: boardRegressions.length === 0 && invalids.length === 0 && misses.length === 0,
  },
  rows,
};

writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
console.log("\n" + JSON.stringify({
  certified: report.certified,
  compactationActivations: report.compactationActivations,
  referenceRemnantImprovements: report.referenceRemnantImprovements,
  recovered: report.referenceImprovementsRecoveredOrBeaten,
  missed: report.referenceImprovementsMissed,
  boardRegressions: report.boardRegressions,
  invalidFinalPlans: report.invalidFinalPlans,
  globalCompactationMs: Math.round(report.globalCompactationMs),
  perBoardMs: Math.round(report.perBoardMs),
  ratio: report.perBoardVsGlobalRatio,
  gate: report.gate,
}, null, 2));
console.log(`salida: ${outPath}`);

process.exit(report.gate.pass ? 0 : 1);

function debeEjecutarCompactacionGlobal(lineas, O) {
  const nPiezas = lineas.reduce((s, l) => s + (+l.cant || 0), 0);
  return O.usarCompactacion !== false &&
    nPiezas <= 120 &&
    lineas.length <= 40 &&
    hayRiesgoFranjaMuerta(lineas, O);
}

function hayRiesgoFranjaMuerta(lineas, O) {
  const saw = +O.sierra || 0;
  const restoMin = +O.restoMin || 0;
  if (!(restoMin > Math.max(saw, 10))) return false;

  const ors = [];
  for (const l of lineas) {
    const base = +l.base;
    const altura = +l.altura;
    const area = base * altura;
    ors.push({ a: base, b: altura, area });
    if (!(O.materialConVeta && l.veta) && Math.abs(base - altura) > 1e-9) {
      ors.push({ a: altura, b: base, area });
    }
  }

  for (const u of ors) for (const v of ors) {
    if (v.area <= u.area * 1.05) continue;
    const resid = u.a - v.a - saw;
    if (resid > Math.max(saw, 10) && resid < restoMin) return true;
  }
  return false;
}

function toLegacyLines(input) {
  return input.pieces.map((piece, index) => ({
    ref: piece.reference || String(index + 1),
    detalle: piece.description || piece.reference || `Piece ${index + 1}`,
    cant: piece.quantity,
    base: piece.width,
    altura: piece.height,
    veta: Boolean(piece.grain || piece.canRotate === false),
    cantos: piece.edges
      ? {
          arr: Boolean(piece.edges.top),
          aba: Boolean(piece.edges.bottom),
          izq: Boolean(piece.edges.left),
          der: Boolean(piece.edges.right),
        }
      : null,
  }));
}

function toLegacyOptions(input) {
  const totalPieces = input.pieces.reduce((sum, piece) => sum + piece.quantity, 0);
  const cacheLimit = totalPieces <= 160 ? 160 : 0;
  return {
    placaBase: input.board.width,
    placaAltura: input.board.height,
    refiladoX: input.trim.x,
    refiladoY: input.trim.y,
    sierra: input.kerf,
    etapas: input.constraints.stages ?? 4,
    materialConVeta: input.material.hasGrain || input.pieces.some((piece) => piece.canRotate === false),
    descontarCanto: false,
    cantoEspesor: 0,
    restoMin: input.constraints.minRemnant,
    restoMax: input.constraints.minCommercialRemnantLongSide ?? Math.max(input.constraints.minRemnant, 400),
    usarOneBoard: input.constraints.allowOneBoard !== false,
    usarMaster: input.constraints.allowPatternMaster !== false,
    usarMultiSlice: input.constraints.allowMultiSlice !== false,
    usarCompactacion: input.constraints.allowDeadStripCompaction !== false,
    usarCache: cacheLimit > 0,
    maxPiezasCache: cacheLimit,
    rondasPatrones: 40,
    msMaster: 8000,
  };
}

function certifiedFilesFromCheckpoint(path) {
  if (!path || !existsSync(path)) throw new Error(`no existe checkpoint V20: ${path}`);
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try { return JSON.parse(line); }
      catch (error) { throw new Error(`JSON invalido en ${path}:${index + 1}: ${error.message}`); }
    })
    .filter((row) => row?.ok === true)
    .filter((row) => {
      const cheap = Number(row?.cheap?.certified ?? row?.metricasV10?.lowerBound?.cheapCertified ?? 0);
      const any = Number(row?.metricasV10?.lowerBound?.certifiedAfterBaseline ?? 0);
      return cheap > 0 || any > 0;
    })
    .map((row) => row.file)
    .filter(Boolean);
}

function readFileList(path) {
  return readFileSync(resolve(path), "utf8")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function positiveInt(value, fallback) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else { out[key] = next; i += 1; }
  }
  return out;
}

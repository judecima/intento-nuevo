#!/usr/bin/env node
/**
 * Compara V20-control vs V21 en la misma máquina.
 *
 * El baseline puede ser la corrida V20 ya existente: si no trae el campo
 * env.v21FamilyPatterns se interpreta como OFF porque esa corrida es anterior a V21.
 * El único cache hit conocido queda fuera de la cohorte comparable.
 *
 * PASS sólo si:
 * - mismos archivos comparables
 * - 0 regresiones de placas
 * - 0 planes inválidos / errores
 * - V20 cheap ON, staged OFF en ambos lados
 * - V21 OFF/ausente en baseline y ON en candidate
 * - candidateTotal / baselineTotal <= 0.7280675
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
if (typeof args.baseline !== "string" || typeof args.candidate !== "string") {
  console.error("uso: node scripts/v21-benchmark-compare.mjs --baseline <v20-control.jsonl> --candidate <v21.jsonl> [--maxRatio 0.7280675]");
  process.exit(2);
}

const maxRatio = Number(args.maxRatio ?? 0.7280675);
if (!(maxRatio > 0 && maxRatio <= 1)) {
  console.error("--maxRatio debe estar entre 0 y 1");
  process.exit(2);
}

const baselineAll = readJsonl(args.baseline).filter((row) => row?.file);
const baselineRows = baselineAll.filter((row) => row.cacheHit !== true && row.engineCacheHit !== true);
const candidateRows = readJsonl(args.candidate).filter((row) => row?.file);
const candidateByFile = new Map(candidateRows.map((row) => [row.file, row]));

const mismatches = [];
let baselineTotalMs = 0;
let candidateTotalMs = 0;
let matched = 0;
let betterBoards = 0;
let familyRuns = 0;
let familyCertified = 0;
let familyMs = 0;
let fallbackRuns = 0;
let familyPatterns = 0;
let randomPatterns = 0;
let fastPoolSize = 0;

for (const old of baselineRows) {
  const now = candidateByFile.get(old.file);
  if (!now) {
    mismatches.push({ file: old.file, issue: "missing-candidate" });
    continue;
  }
  matched += 1;

  if (old.ok !== true || now.ok !== true) {
    mismatches.push({ file: old.file, issue: "execution-error", baselineOk: old.ok, candidateOk: now.ok, candidateError: now.error ?? null });
    continue;
  }
  if (old.validationOk !== true || now.validationOk !== true) {
    mismatches.push({ file: old.file, issue: "validation", baseline: old.validationOk, candidate: now.validationOk });
  }
  if (+now.boards > +old.boards) {
    mismatches.push({ file: old.file, issue: "board-regression", baseline: old.boards, candidate: now.boards });
  } else if (+now.boards < +old.boards) {
    betterBoards += 1;
  }

  const baselineV21 = old.env?.v21FamilyPatterns;
  if (
    old.env?.staged !== false ||
    old.env?.cheapPostBaseline !== true ||
    (baselineV21 !== undefined && baselineV21 !== false)
  ) {
    mismatches.push({ file: old.file, issue: "wrong-baseline-env", env: old.env ?? null });
  }
  if (now.env?.staged !== false || now.env?.cheapPostBaseline !== true || now.env?.v21FamilyPatterns !== true) {
    mismatches.push({ file: old.file, issue: "wrong-candidate-env", env: now.env ?? null });
  }
  if (now.cacheHit === true || now.engineCacheHit === true) {
    mismatches.push({ file: old.file, issue: "candidate-cache-hit" });
  }
  if ((+now.cheap?.errors || 0) !== 0 || (+now.cheap?.violation || 0) !== 0) {
    mismatches.push({ file: old.file, issue: "cheap-safety", cheap: now.cheap ?? null });
  }
  if ((+now.v21?.errors || 0) !== 0) {
    mismatches.push({ file: old.file, issue: "v21-error", v21: now.v21 ?? null });
  }

  const oldMs = Number(old.totalMs);
  const nowMs = Number(now.totalMs);
  if (!Number.isFinite(oldMs) || oldMs < 0 || !Number.isFinite(nowMs) || nowMs < 0) {
    mismatches.push({ file: old.file, issue: "invalid-totalMs", baseline: old.totalMs, candidate: now.totalMs });
  } else {
    baselineTotalMs += oldMs;
    candidateTotalMs += nowMs;
  }

  familyRuns += +now.v21?.familyRuns || 0;
  familyCertified += +now.v21?.familyCertified || 0;
  familyMs += +now.v21?.familyMs || 0;
  fallbackRuns += +now.v21?.fallbackRuns || 0;
  familyPatterns += +now.v21?.familyPatterns || 0;
  randomPatterns += +now.v21?.randomPatterns || 0;
  fastPoolSize += +now.v21?.fastPoolSize || 0;
}

if (matched !== baselineRows.length) {
  mismatches.push({
    issue: "row-count",
    baselineComparable: baselineRows.length,
    baselineAll: baselineAll.length,
    candidate: candidateRows.length,
    matched,
  });
}

const ratio = baselineTotalMs > 0 ? candidateTotalMs / baselineTotalMs : null;
const reductionPct = ratio === null ? null : (1 - ratio) * 100;
const historicalEquivalentMs = ratio === null ? null : ratio * 12_361_491;
const correctnessOk = mismatches.length === 0;
const performanceOk = ratio !== null && ratio <= maxRatio;

const summary = {
  baselineRowsAll: baselineAll.length,
  cases: baselineRows.length,
  excludedBaselineCacheHits: baselineAll.length - baselineRows.length,
  candidateRows: candidateRows.length,
  matched,
  betterBoards,
  correctnessOk,
  performanceOk,
  baselineTotalMs,
  candidateTotalMs,
  ratio,
  reductionPct,
  maxRatio,
  requiredReductionPct: (1 - maxRatio) * 100,
  historicalEquivalentMs,
  historicalTargetMs: 9_000_000,
  v21: {
    familyRuns,
    familyCertified,
    certificationRate: familyRuns ? familyCertified / familyRuns : 0,
    familyMs,
    fallbackRuns,
    fallbackRate: familyRuns ? fallbackRuns / familyRuns : 0,
    familyPatterns,
    randomPatterns,
    fastPoolSize,
  },
  mismatches: mismatches.length,
  pass: correctnessOk && performanceOk,
};

console.log(JSON.stringify(summary, null, 2));
if (mismatches.length) console.log(JSON.stringify(mismatches.slice(0, 100), null, 2));

if (!correctnessOk) {
  console.error("V21 FAIL CORRECTNESS");
  process.exit(1);
}
if (!performanceOk) {
  console.error("V21 FAIL PERFORMANCE");
  process.exit(3);
}
console.log("V21 PASS");

function readJsonl(path) {
  return readFileSync(resolve(path), "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try { return JSON.parse(line); }
      catch (error) { throw new Error(`${path}:${index + 1}: ${error.message}`); }
    });
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else { out[key] = next; i += 1; }
  }
  return out;
}

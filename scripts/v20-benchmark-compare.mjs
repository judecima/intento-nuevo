#!/usr/bin/env node
/**
 * Compara el benchmark V20 contra el marcador congelado de los mismos archivos.
 * Gate primario: mismos casos, mismas placas, validación OK, sin errores/violaciones
 * de cheap LB. El umbral de tiempo es configurable.
 *
 * Uso:
 *   node scripts/v20-benchmark-compare.mjs \
 *     --baseline experiencia/v6/hotspot-all.jsonl \
 *     --candidate experiencia/v6/hotspot-v20-cheap.jsonl \
 *     --maxTotalMs 12110000
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
if (typeof args.baseline !== "string" || typeof args.candidate !== "string") {
  console.error("uso: node scripts/v20-benchmark-compare.mjs --baseline <marker.jsonl> --candidate <v20.jsonl> [--maxTotalMs N]");
  process.exit(2);
}

const maxTotalMs = args.maxTotalMs === undefined ? null : Number(args.maxTotalMs);
const baseline = readJsonl(args.baseline).filter((r) => r?.file && r.ok !== false);
const candidateRows = readJsonl(args.candidate).filter((r) => r?.file);
const candidate = new Map(candidateRows.map((r) => [r.file, r]));

const mismatches = [];
const matched = [];
for (const old of baseline) {
  const now = candidate.get(old.file);
  if (!now) {
    mismatches.push({ file: old.file, issue: "missing-candidate" });
    continue;
  }
  matched.push({ old, now });
  if (now.ok !== true) mismatches.push({ file: old.file, issue: "candidate-error", error: now.error ?? null });
  if (now.env?.staged !== false || now.env?.cheapPostBaseline !== true) {
    mismatches.push({ file: old.file, issue: "wrong-env", env: now.env ?? null });
  }
  if (+now.boards !== +old.boards) mismatches.push({ file: old.file, issue: "boards", baseline: old.boards, candidate: now.boards });
  if (now.validationOk !== true) mismatches.push({ file: old.file, issue: "validation", value: now.validationOk });
  if (!Number.isFinite(+now.refiladoX) || !Number.isFinite(+now.refiladoY)) {
    mismatches.push({ file: old.file, issue: "invalid-trim", refiladoX: now.refiladoX, refiladoY: now.refiladoY });
  }
  if ((+now.cheap?.errors || 0) > 0) mismatches.push({ file: old.file, issue: "cheap-errors", value: now.cheap?.errors });
  if ((+now.cheap?.violation || 0) > 0) mismatches.push({ file: old.file, issue: "cheap-violation", value: now.cheap?.violation });
}

const oldTimes = matched.map(({ old }) => +old.totalMs || 0);
const newTimes = matched.map(({ now }) => +now.totalMs || 0);
const oldTotal = sum(oldTimes);
const newTotal = sum(newTimes);
const oldBoards = sum(matched.map(({ old }) => +old.boards || 0));
const newBoards = sum(matched.map(({ now }) => +now.boards || 0));
const cheapRuns = sum(matched.map(({ now }) => +now.cheap?.runs || 0));
const cheapCertified = sum(matched.map(({ now }) => +now.cheap?.certified || 0));
const cheapErrors = sum(matched.map(({ now }) => +now.cheap?.errors || 0));
const cheapViolations = sum(matched.map(({ now }) => +now.cheap?.violation || 0));
const cheapMs = sum(matched.map(({ now }) => +now.cheap?.ms || 0));

const summary = {
  cases: matched.length,
  expectedCases: baseline.length,
  boards: { baseline: oldBoards, candidate: newBoards, delta: newBoards - oldBoards },
  totalMs: {
    baseline: oldTotal,
    candidate: newTotal,
    saved: oldTotal - newTotal,
    savedPct: oldTotal > 0 ? ((oldTotal - newTotal) / oldTotal) * 100 : 0,
    threshold: maxTotalMs,
  },
  latency: {
    baseline: percentiles(oldTimes),
    candidate: percentiles(newTimes),
  },
  cheap: {
    runs: cheapRuns,
    certified: cheapCertified,
    errors: cheapErrors,
    violations: cheapViolations,
    ms: cheapMs,
  },
  trimPairs: countTrimPairs(matched.map(({ now }) => now)),
  mismatches: mismatches.length,
};

console.log(JSON.stringify(summary, null, 2));
if (mismatches.length) console.log(JSON.stringify(mismatches.slice(0, 100), null, 2));

const safetyOk =
  matched.length === baseline.length &&
  mismatches.length === 0 &&
  newBoards === oldBoards &&
  cheapErrors === 0 &&
  cheapViolations === 0;
const performanceOk = maxTotalMs === null || newTotal <= maxTotalMs;

if (!safetyOk) {
  console.error("V20 BENCHMARK FAIL: gate de seguridad no cumplido");
  process.exit(1);
}
if (!performanceOk) {
  console.error("V20 BENCHMARK SAFETY OK, PERFORMANCE GATE NOT MET");
  process.exit(3);
}
console.log("V20 BENCHMARK OK: seguridad y performance gate cumplidos");

function percentiles(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 0.50),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted.at(-1) ?? 0,
  };
}

function percentile(sorted, q) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * q) - 1))];
}

function countTrimPairs(rows) {
  const counts = new Map();
  for (const row of rows) {
    const key = `${row.refiladoX}/${row.refiladoY}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function sum(values) { return values.reduce((a, b) => a + b, 0); }

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

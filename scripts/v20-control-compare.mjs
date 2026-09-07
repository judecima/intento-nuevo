#!/usr/bin/env node
/**
 * Compara una corrida de control V20 contra el marcador congelado.
 *
 * Correctness gate (exit 1): mismos archivos, mismas placas y misma cota. La
 * candidata debe haberse ejecutado con STAGED=0 y CHEAP=0, y persistir trim
 * finito.
 *
 * Timing-comparability gate (exit 3): suma totalMs de los mismos casos y exige
 * que la deriva relativa entre arneses no supere --maxTimeDriftPct (3% por
 * defecto). Esto evita atribuir al V20 una mejora que provenga del arnes.
 *
 * Uso:
 *   node scripts/v20-control-compare.mjs \
 *     --baseline experiencia/v6/hotspot-all.jsonl \
 *     --candidate experiencia/v6/hotspot-v20-control.jsonl \
 *     --limit 20 \
 *     --maxTimeDriftPct 3
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
if (typeof args.baseline !== "string" || typeof args.candidate !== "string") {
  console.error(
    "uso: node scripts/v20-control-compare.mjs --baseline <marker.jsonl> " +
    "--candidate <control.jsonl> [--limit 20] [--maxTimeDriftPct 3]",
  );
  process.exit(2);
}

const limit = Number(args.limit ?? 20);
const maxTimeDriftPct = Number(args.maxTimeDriftPct ?? 3);
if (!(limit > 0) || !(maxTimeDriftPct >= 0)) {
  console.error("--limit debe ser > 0 y --maxTimeDriftPct debe ser >= 0");
  process.exit(2);
}

const baseline = readJsonl(args.baseline).filter((r) => r?.file && r.ok !== false).slice(0, limit);
const candidateRows = readJsonl(args.candidate);
const candidate = new Map(candidateRows.map((r) => [r.file, r]));

const mismatches = [];
const timingIssues = [];
let compared = 0;
let baselineTotalMs = 0;
let controlTotalMs = 0;
let timingPairs = 0;

for (const old of baseline) {
  const now = candidate.get(old.file);
  if (!now) {
    mismatches.push({ file: old.file, issue: "missing-candidate" });
    continue;
  }

  compared += 1;
  if (now.ok !== true) mismatches.push({ file: old.file, issue: "candidate-error", error: now.error ?? null });
  if (now.env?.staged !== false || now.env?.cheapPostBaseline !== false) {
    mismatches.push({ file: old.file, issue: "wrong-env", env: now.env ?? null });
  }
  if (!Number.isFinite(+now.refiladoX) || !Number.isFinite(+now.refiladoY)) {
    mismatches.push({ file: old.file, issue: "invalid-trim", refiladoX: now.refiladoX, refiladoY: now.refiladoY });
  }
  if (+now.boards !== +old.boards) {
    mismatches.push({ file: old.file, issue: "boards", baseline: old.boards, candidate: now.boards });
  }
  if (+now.cota !== +old.cota) {
    mismatches.push({ file: old.file, issue: "cota", baseline: old.cota, candidate: now.cota });
  }

  const oldMs = Number(old.totalMs);
  const nowMs = Number(now.totalMs);
  if (Number.isFinite(oldMs) && oldMs >= 0 && Number.isFinite(nowMs) && nowMs >= 0) {
    baselineTotalMs += oldMs;
    controlTotalMs += nowMs;
    timingPairs += 1;
  } else {
    timingIssues.push({ file: old.file, issue: "invalid-totalMs", baseline: old.totalMs, candidate: now.totalMs });
  }
}

const timeRatio = baselineTotalMs > 0 ? controlTotalMs / baselineTotalMs : null;
const timeDriftPct = timeRatio === null ? null : (timeRatio - 1) * 100;
const absTimeDriftPct = timeDriftPct === null ? null : Math.abs(timeDriftPct);
const correctnessOk = baseline.length === limit && compared === baseline.length && mismatches.length === 0;
const timingOk =
  timingPairs === baseline.length &&
  timingIssues.length === 0 &&
  absTimeDriftPct !== null &&
  absTimeDriftPct <= maxTimeDriftPct;

const summary = {
  expected: baseline.length,
  compared,
  mismatches: mismatches.length,
  correctnessOk,
  timing: {
    pairs: timingPairs,
    baselineTotalMs,
    controlTotalMs,
    ratio: timeRatio,
    driftPct: timeDriftPct,
    absDriftPct: absTimeDriftPct,
    maxAllowedDriftPct: maxTimeDriftPct,
    issues: timingIssues.length,
    comparable: timingOk,
  },
  ok: correctnessOk && timingOk,
};

console.log(JSON.stringify(summary, null, 2));
if (mismatches.length) console.log(JSON.stringify(mismatches.slice(0, 50), null, 2));
if (timingIssues.length) console.log(JSON.stringify(timingIssues.slice(0, 50), null, 2));

if (!correctnessOk) {
  console.error("V20 CONTROL FAIL: no correr los 213 hasta resolver las diferencias de correctitud");
  process.exit(1);
}
if (!timingOk) {
  console.error(
    `V20 CONTROL TIMING FAIL: deriva=${formatPct(timeDriftPct)} ` +
    `(max=${maxTimeDriftPct.toFixed(2)}%). No usar el umbral temporal de los 213 hasta explicar la diferencia de arnes.`,
  );
  process.exit(3);
}

console.log(
  `V20 CONTROL OK: boards/cota reproducibles y arnes comparable ` +
  `(ratio=${timeRatio.toFixed(4)}, deriva=${formatPct(timeDriftPct)})`,
);

function formatPct(value) {
  return Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${value.toFixed(2)}%` : "n/a";
}

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

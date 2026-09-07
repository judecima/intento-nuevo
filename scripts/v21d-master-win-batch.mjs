#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
if (typeof args.corpus !== "string" || (typeof args.source !== "string" && typeof args.files !== "string")) {
  console.error("uso:\n  node scripts/v21d-master-win-batch.mjs --source <v10.jsonl> --corpus <dir> [--limit 10] [--out resultado.json]\n  node scripts/v21d-master-win-batch.mjs --files <casos.txt> --corpus <dir> [--limit 10] [--maxScan 100] [--out resultado.json]");
  process.exit(2);
}

const corpus = resolve(args.corpus);
const limit = positiveInt(args.limit, 10);
const maxScan = positiveInt(args.maxScan, Number.MAX_SAFE_INTEGER);
if (!existsSync(corpus)) throw new Error(`no existe corpus: ${corpus}`);

const mode = typeof args.source === "string" ? "historical-source" : "discover-from-files";
let candidates;
if (mode === "historical-source") {
  const source = resolve(args.source);
  if (!existsSync(source)) throw new Error(`no existe source: ${source}`);
  const rows = readJsonl(source);
  candidates = [...new Map(
    rows
      .filter((row) => masterGains(row) > 0 && row?.file)
      .sort((a, b) => masterMs(b) - masterMs(a))
      .map((row) => [row.file, { file: row.file, historicalMasterMs: masterMs(row) }])
  ).values()];
} else {
  const fileList = resolve(args.files);
  if (!existsSync(fileList)) throw new Error(`no existe files: ${fileList}`);
  candidates = [...new Set(
    readFileSync(fileList, "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  )].map((file) => ({ file, historicalMasterMs: null }));
}

if (!candidates.length) {
  console.error("no hay casos candidatos");
  process.exit(2);
}

const runner = resolve(REPO, "scripts", "v21c-master-provenance.mjs");
const results = [];
const skippedNoWin = [];
const failures = [];
let scanned = 0;

for (const candidate of candidates) {
  if (results.length >= limit || scanned >= maxScan) break;
  scanned += 1;
  const child = spawnSync(process.execPath, [
    runner,
    "--corpus", corpus,
    "--archivo", candidate.file,
    "--generic", "1",
    "--jsonOnly", "1",
  ], {
    cwd: REPO,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env },
  });

  let parsed = null;
  try { parsed = child.stdout?.trim() ? JSON.parse(child.stdout.trim()) : null; }
  catch (_) { /* se registra abajo */ }

  // En discovery, exit 2 con JSON valido e improved=false significa simplemente
  // que este caso no es un Master-win; no es un error del diagnostico.
  if (parsed && parsed.improved !== true) {
    skippedNoWin.push({ file: candidate.file, preMasterBoards: parsed.preMasterBoards, solutionBoards: parsed.solutionBoards });
    console.log(`[scan ${scanned}] no-win ${candidate.file}`);
    continue;
  }

  if (!parsed || child.status !== 0) {
    failures.push({ file: candidate.file, status: child.status, stderr: child.stderr?.trim() || null });
    console.log(`[scan ${scanned}] FAIL ${candidate.file}`);
    continue;
  }

  const late = parsed.selected?.filter((item) => item.late) ?? [];
  const hetero = late.filter((item) => item.heterogeneous === true).length;
  results.push({
    file: candidate.file,
    ok: true,
    historicalMasterMs: candidate.historicalMasterMs,
    preMasterBoards: parsed.preMasterBoards,
    solutionBoards: parsed.solutionBoards,
    boardsSaved: parsed.preMasterBoards - parsed.solutionBoards,
    selectedCount: parsed.selectedCount,
    lateSelectedCount: parsed.lateSelectedCount,
    lateHeterogeneousCount: hetero,
    lateHeterogeneousPct: late.length ? hetero / late.length * 100 : 0,
    heterogeneousMajority: late.length > 0 && hetero / late.length >= 0.5,
    generationMs: parsed.generationMs,
    solveMs: parsed.solveMs,
    nodes: parsed.nodes,
  });
  console.log(`[win ${results.length}/${limit}; scan ${scanned}] ${candidate.file} ${parsed.preMasterBoards}->${parsed.solutionBoards} late=${late.length} hetero=${hetero}`);
}

const totalLate = results.reduce((sum, row) => sum + row.lateSelectedCount, 0);
const totalHetero = results.reduce((sum, row) => sum + row.lateHeterogeneousCount, 0);
const heteroPct = totalLate ? totalHetero / totalLate * 100 : 0;
const majorityCases = results.filter((row) => row.heterogeneousMajority).length;
const majorityCasePct = results.length ? majorityCases / results.length * 100 : 0;
const enoughCases = results.length >= 5;
const supportsMasterGuided = enoughCases && heteroPct >= 70 && majorityCasePct >= 70;

const summary = {
  mode,
  source: typeof args.source === "string" ? resolve(args.source) : null,
  files: typeof args.files === "string" ? resolve(args.files) : null,
  requestedMasterWins: limit,
  maxScan: maxScan === Number.MAX_SAFE_INTEGER ? null : maxScan,
  candidatesAvailable: candidates.length,
  candidatesScanned: scanned,
  masterWinsCompleted: results.length,
  skippedNoMasterWin: skippedNoWin.length,
  failures: failures.length,
  totalLateSelectedColumns: totalLate,
  heterogeneousLateColumns: totalHetero,
  heterogeneousLatePct: heteroPct,
  heterogeneousMajorityCases: majorityCases,
  heterogeneousMajorityCasePct: majorityCasePct,
  gate: {
    minCases: 5,
    minHeterogeneousLatePct: 70,
    minHeterogeneousMajorityCasePct: 70,
  },
  supportsMasterGuidedGeneration: supportsMasterGuided,
  verdict: supportsMasterGuided ? "MASTER_GUIDED_SIGNAL" : (enoughCases ? "MIXED_OR_STRUCTURED" : "INSUFFICIENT_CASES"),
  cases: results,
  failedCases: failures,
};

console.log(JSON.stringify(summary, null, 2));
if (typeof args.out === "string") writeFileSync(resolve(args.out), JSON.stringify(summary, null, 2) + "\n");

// Fallos tecnicos invalidan la corrida. Los no-win son discovery normal.
if (failures.length) process.exit(1);
if (!enoughCases) process.exit(2);
process.exit(0);

function masterGains(row) {
  return +(row?.metricas?.master?.ganancias ?? row?.metricasV10?.master?.ganancias ?? row?.master?.ganancias ?? 0) || 0;
}
function masterMs(row) {
  return +(row?.masterMs ?? row?.metricas?.master?.ms ?? row?.metricasV10?.master?.ms ?? row?.master?.ms ?? 0) || 0;
}
function readJsonl(path) {
  return readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error(`${path}:${index + 1}: ${error.message}`); }
  });
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
    else { out[key] = next; i++; }
  }
  return out;
}

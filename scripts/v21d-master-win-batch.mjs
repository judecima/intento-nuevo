#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
if (typeof args.source !== "string" || typeof args.corpus !== "string") {
  console.error("uso: node scripts/v21d-master-win-batch.mjs --source <v10.jsonl> --corpus <dir> [--limit 10] [--out resultado.json]");
  process.exit(2);
}

const source = resolve(args.source);
const corpus = resolve(args.corpus);
const limit = positiveInt(args.limit, 10);
if (!existsSync(source)) throw new Error(`no existe source: ${source}`);
if (!existsSync(corpus)) throw new Error(`no existe corpus: ${corpus}`);

const rows = readJsonl(source);
const wins = [...new Map(
  rows
    .filter((row) => masterGains(row) > 0 && row?.file)
    .sort((a, b) => masterMs(b) - masterMs(a))
    .map((row) => [row.file, row])
).values()].slice(0, limit);

if (!wins.length) {
  console.error("no se encontraron filas con master.ganancias > 0 en el JSONL indicado");
  process.exit(2);
}

const runner = resolve(REPO, "scripts", "v21c-master-provenance.mjs");
const results = [];
for (let i = 0; i < wins.length; i++) {
  const row = wins[i];
  const child = spawnSync(process.execPath, [
    runner,
    "--corpus", corpus,
    "--archivo", row.file,
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

  if (child.status !== 0 || !parsed) {
    results.push({ file: row.file, ok: false, status: child.status, stderr: child.stderr?.trim() || null });
    console.log(`[${i + 1}/${wins.length}] FAIL ${row.file}`);
    continue;
  }

  const late = parsed.selected?.filter((item) => item.late) ?? [];
  const hetero = late.filter((item) => item.heterogeneous === true).length;
  results.push({
    file: row.file,
    ok: true,
    historicalMasterMs: masterMs(row),
    preMasterBoards: parsed.preMasterBoards,
    solutionBoards: parsed.solutionBoards,
    selectedCount: parsed.selectedCount,
    lateSelectedCount: parsed.lateSelectedCount,
    lateHeterogeneousCount: hetero,
    lateHeterogeneousPct: late.length ? hetero / late.length * 100 : 0,
    heterogeneousMajority: late.length > 0 && hetero / late.length >= 0.5,
    generationMs: parsed.generationMs,
    solveMs: parsed.solveMs,
    nodes: parsed.nodes,
  });
  console.log(`[${i + 1}/${wins.length}] ${row.file} late=${late.length} hetero=${hetero}`);
}

const ok = results.filter((row) => row.ok);
const totalLate = ok.reduce((sum, row) => sum + row.lateSelectedCount, 0);
const totalHetero = ok.reduce((sum, row) => sum + row.lateHeterogeneousCount, 0);
const heteroPct = totalLate ? totalHetero / totalLate * 100 : 0;
const majorityCases = ok.filter((row) => row.heterogeneousMajority).length;
const majorityCasePct = ok.length ? majorityCases / ok.length * 100 : 0;
const enoughCases = ok.length >= 5;
const supportsMasterGuided = enoughCases && heteroPct >= 70 && majorityCasePct >= 70;

const summary = {
  source,
  requestedLimit: limit,
  historicalMasterWinsFound: wins.length,
  casesCompleted: ok.length,
  casesFailed: results.length - ok.length,
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
};

console.log(JSON.stringify(summary, null, 2));
if (typeof args.out === "string") writeFileSync(resolve(args.out), JSON.stringify(summary, null, 2) + "\n");
process.exit(results.some((row) => !row.ok) ? 1 : 0);

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

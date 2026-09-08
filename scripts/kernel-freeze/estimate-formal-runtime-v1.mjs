#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
const input = resolve(args.input ?? "test-results/kernel-v1-formal-runtime-sample/calibration-v4.partial.jsonl");
const preflight = resolve(args.preflight ?? join(dirname(input), "corpus-preflight-v3.json"));
const hotspotPath = resolve(args.hotspots ?? "experiencia/v6/hotspot-all.jsonl");
const policyPath = resolve(args.policy ?? "research/optimizer/freeze/KERNEL_V1_FORMAL_CERTIFICATION_POLICY.json");
const out = resolve(args.out ?? join(dirname(input), "formal-runtime-estimate-v1.json"));
const bootstrapReplicates = args.bootstrap == null ? 5000 : positiveInt(args.bootstrap, "--bootstrap");
const bootstrapSeed = String(args.bootstrapSeed ?? "kernel-v1-formal-runtime-bootstrap-v1");

if (!existsSync(input)) fail(`missing sample checkpoint: ${input}`);
if (!existsSync(preflight)) fail(`missing sample preflight: ${preflight}`);

const rows = uniqueLatest(readJsonl(input).filter((row) => row.pass === true));
if (!rows.length) fail("runtime sample contains no successful rows");
if (rows.some((row) => row.calibrationOrder !== "random")) {
  fail("runtime estimator requires a dedicated --order random checkpoint; do not mix work-first rows");
}
if (rows.some((row) => !Number.isFinite(Number(row.processWallMs)))) {
  fail("sample rows do not contain processWallMs; update kernel-budget-calibration-v4.mjs and rerun the dedicated random sample");
}

const sampleSeeds = [...new Set(rows.map((row) => String(row.calibrationSampleSeed ?? "")))];
if (sampleSeeds.length !== 1 || !sampleSeeds[0]) fail("runtime sample must have exactly one non-empty calibrationSampleSeed");

const physical = readJson(preflight);
const feasiblePopulation = Number(physical.feasibleCases ?? 0);
const acceptedPopulation = Number(physical.parserAccepted ?? 8650);
const infeasiblePopulation = Number(physical.expectedInfeasibleCases ?? 0);
if (!(feasiblePopulation > 0)) fail("preflight feasibleCases missing");

const processMs = rows.map((row) => Number(row.processWallMs));
const engineMs = rows.map((row) => Number(row.wallMs));
const overheadMs = rows.map((row) => Number(row.freshProcessOverheadMs ?? (Number(row.processWallMs) - Number(row.wallMs))));
const cpuMs = rows.map((row) => Number(row.cpuMs)).filter(Number.isFinite);
const processStats = stats(processMs);
const engineStats = stats(engineMs);
const overheadStats = stats(overheadMs);
const cpuStats = stats(cpuMs);

const bootstrap = bootstrapMean(processMs, bootstrapReplicates, bootstrapSeed);
const onePassHours = msToHours(processStats.mean * feasiblePopulation);
const twoPassHours = 2 * onePassHours;
const onePassCi95Hours = bootstrap.ci95.map((mean) => msToHours(mean * feasiblePopulation));
const twoPassCi95Hours = onePassCi95Hours.map((h) => 2 * h);
const overheadOnePassHours = msToHours(overheadStats.mean * feasiblePopulation);
const engineOnePassHours = msToHours(engineStats.mean * feasiblePopulation);

const policy = existsSync(policyPath) ? readJson(policyPath) : {};
const knownTailOrders = (policy?.execution?.knownExtremeTailOrders ?? policy?.deterministicBudgets?.calibrationProtocol?.knownExtremeTailOrders ?? []).map(String);
const hotspotRows = existsSync(hotspotPath) ? readJsonl(hotspotPath).filter((row) => row.ok !== false && !row.engineCacheHit) : [];
const knownTails = knownTailOrders.map((order) => {
  const matches = hotspotRows.filter((row) => String(row.file ?? "").includes(order));
  const historicalEngineMs = matches.reduce((sum, row) => sum + (Number(row.engineMs) || 0), 0);
  const sampled = rows.some((row) => String(row.file ?? "").includes(order));
  return { order, historicalEngineMs, sampled, files: matches.map((row) => row.file) };
});

const sampleFiles = rows.map((row) => row.file).sort(cmp);
const report = {
  schemaVersion: "kernel-v1-formal-runtime-estimate-v1",
  generatedAt: new Date().toISOString(),
  purpose: "Planning estimate only. This does not replace formal correctness or determinism evidence.",
  sample: {
    rows: rows.length,
    feasiblePopulation,
    acceptedPopulation,
    infeasiblePopulation,
    fractionPct: pct(rows.length, feasiblePopulation),
    order: "deterministic-random-without-replacement-by-hash-order",
    seed: sampleSeeds[0],
    identitySetSha256: sha256(sampleFiles.join("\n") + "\n"),
  },
  timingMs: {
    freshProcessEndToEnd: processStats,
    optimizeProjectOnly: engineStats,
    freshProcessOverhead: overheadStats,
    cpu: cpuStats,
    overheadShareOfMeanProcessPct: processStats.mean > 0 ? round(100 * overheadStats.mean / processStats.mean, 4) : 0,
  },
  projection: {
    optimizedCasesPerFormalPass: feasiblePopulation,
    expectedInfeasibleCasesNotOptimized: infeasiblePopulation,
    onePassHours,
    twoPassHours,
    bootstrapMean95Pct: {
      replicates: bootstrapReplicates,
      onePassHours: onePassCi95Hours,
      twoPassHours: twoPassCi95Hours,
      warning: "Heavy-tailed runtimes can make a random sample miss rare extreme cases; interpret this interval together with the explicit known-tail reserve below.",
    },
    decompositionHoursPerPass: {
      optimizeProjectOnly: engineOnePassHours,
      freshProcessOverhead: overheadOnePassHours,
    },
  },
  knownExtremeTailReserve: {
    source: "versioned known tail orders + historical hotspot timing; planning context only",
    cases: knownTails,
    historicalEngineMsTotal: knownTails.reduce((sum, item) => sum + item.historicalEngineMs, 0),
    historicalHoursTotal: msToHours(knownTails.reduce((sum, item) => sum + item.historicalEngineMs, 0)),
    sampledCount: knownTails.filter((item) => item.sampled).length,
    note: "Do not add historical tail time mechanically to the random-sample projection because the population estimate already includes tail probability. Use this reserve to assess whether the sample happened to miss known extremes and to schedule those cases explicitly at the end of each formal pass.",
  },
  isolationDecision: {
    currentFormalIntent: "fresh process per feasible case",
    measuredMeanOverheadMs: overheadStats.mean,
    projectedOverheadHoursPerPass: overheadOnePassHours,
    rule: "Do not weaken fresh-process isolation merely to save startup time. Consider batching only if measured overhead is operationally material, and only with an explicit reset/equivalence design that preserves determinism evidence semantics.",
  },
  interpretationBoundary: {
    budgets: "The dedicated random sample should be rerun after production deterministic budgets/watchdogs are versioned if those values materially change execution cost. Pre-budget sampling estimates Candidate A historical-clock behavior, not necessarily final formal runtime.",
    patternGeneration: "The six current deterministic knobs do not bound generarPatrones cost; random runtime sampling intentionally captures that unbudgeted cost in end-to-end process time.",
  },
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(JSON.stringify({
  sample: rows.length,
  feasiblePopulation,
  meanProcessMs: round(processStats.mean, 3),
  p50ProcessMs: round(processStats.p50, 3),
  p95ProcessMs: round(processStats.p95, 3),
  maxProcessMs: round(processStats.max, 3),
  meanOverheadMs: round(overheadStats.mean, 3),
  overheadSharePct: report.timingMs.overheadShareOfMeanProcessPct,
  onePassHours: round(onePassHours, 2),
  twoPassHours: round(twoPassHours, 2),
  twoPassCi95Hours: twoPassCi95Hours.map((v) => round(v, 2)),
  knownTailSampled: report.knownExtremeTailReserve.sampledCount,
  out,
}));

function stats(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return { count: 0, mean: 0, p50: 0, p90: 0, p95: 0, p99: 0, max: 0, stddev: 0 };
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const variance = sorted.length > 1 ? sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / (sorted.length - 1) : 0;
  return {
    count: sorted.length,
    mean,
    p50: quantileNearestRank(sorted, 0.50),
    p90: quantileNearestRank(sorted, 0.90),
    p95: quantileNearestRank(sorted, 0.95),
    p99: quantileNearestRank(sorted, 0.99),
    max: sorted.at(-1) ?? 0,
    stddev: Math.sqrt(variance),
  };
}

function bootstrapMean(values, reps, seedText) {
  const xs = values.filter(Number.isFinite);
  const rnd = lcg(hash32(seedText));
  const means = [];
  for (let r = 0; r < reps; r++) {
    let sum = 0;
    for (let i = 0; i < xs.length; i++) sum += xs[Math.floor(rnd() * xs.length)];
    means.push(sum / xs.length);
  }
  means.sort((a, b) => a - b);
  return { ci95: [quantileLinear(means, 0.025), quantileLinear(means, 0.975)] };
}
function hash32(text) {
  const hex = createHash("sha256").update(String(text)).digest("hex").slice(0, 8);
  return Number.parseInt(hex, 16) >>> 0;
}
function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
function quantileNearestRank(sorted, p) { return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))] ?? 0; }
function quantileLinear(sorted, p) {
  if (!sorted.length) return 0;
  const x = (sorted.length - 1) * p;
  const lo = Math.floor(x), hi = Math.ceil(x), f = x - lo;
  return sorted[lo] * (1 - f) + sorted[hi] * f;
}
function msToHours(ms) { return ms / 3_600_000; }
function pct(n, d) { return d ? round(100 * n / d, 4) : 0; }
function round(v, n = 6) { const p = 10 ** n; return Math.round(Number(v) * p) / p; }
function sha256(v) { return createHash("sha256").update(v).digest("hex"); }
function cmp(a, b) { return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0; }
function readJson(path) { return JSON.parse(readFileSync(path, "utf8")); }
function readJsonl(path) { return readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse); }
function uniqueLatest(rows) { return [...new Map(rows.map((row) => [row.file, row])).values()]; }
function positiveInt(value, label) { const n = Number(value); if (!Number.isSafeInteger(n) || n <= 0) fail(`${label} must be a positive integer`); return n; }
function parseArgs(values) {
  const out = {};
  for (let i = 0; i < values.length; i++) {
    const token = values[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2), next = values[i + 1];
    if (next != null && !next.startsWith("--")) { out[key] = next; i++; }
    else out[key] = true;
  }
  return out;
}
function fail(message) { throw new Error(message); }

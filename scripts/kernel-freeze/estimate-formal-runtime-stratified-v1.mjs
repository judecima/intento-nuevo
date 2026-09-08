#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
const input = resolve(args.input ?? "test-results/kernel-v1-formal-runtime-sample/calibration-v4.partial.jsonl");
const populationPath = resolve(args.population ?? join(dirname(input), "formal-runtime-population-v1.json"));
const out = resolve(args.out ?? join(dirname(input), "formal-runtime-estimate-stratified-v1.json"));
const bootstrapReplicates = args.bootstrap == null ? 5000 : positiveInt(args.bootstrap, "--bootstrap");
const bootstrapSeed = String(args.bootstrapSeed ?? "kernel-v1-formal-runtime-stratified-bootstrap-v1");
const targets = String(args.targets ?? "150,200")
  .split(",")
  .map((v) => Number(v.trim()))
  .filter((v) => Number.isSafeInteger(v) && v > 0);

if (!existsSync(input)) fail(`missing random sample checkpoint: ${input}`);
if (!existsSync(populationPath)) fail(`missing runtime population inventory: ${populationPath}`);

const rows = uniqueLatest(readJsonl(input).filter((row) => row.pass === true));
if (!rows.length) fail("runtime sample contains no successful rows");
if (rows.some((row) => row.calibrationOrder !== "random")) fail("stratified estimator requires a dedicated --order random checkpoint");
if (rows.some((row) => !Number.isFinite(Number(row.processWallMs)))) fail("sample rows are missing processWallMs");

const populationDoc = readJson(populationPath);
const population = Array.isArray(populationDoc?.cases) ? populationDoc.cases : [];
if (!population.length) fail("runtime population inventory has no cases");
const byFile = new Map(population.map((item) => [item.file, item]));
for (const row of rows) if (!byFile.has(row.file)) fail(`sample file absent from population inventory: ${row.file}`);

const areaBuckets = ["lb1", "lb2", "lb3-4", "lb5+"];
const areaGroups = new Map(areaBuckets.map((key) => [key, []]));
for (const item of population) areaGroups.get(areaBucket(item.staticAreaLowerBound)).push(Number(item.pieces ?? 0));

const pieceCuts = {};
for (const key of areaBuckets) {
  const xs = areaGroups.get(key).filter(Number.isFinite).sort((a, b) => a - b);
  pieceCuts[key] = {
    q33: quantileLinear(xs, 1 / 3),
    q67: quantileLinear(xs, 2 / 3),
  };
}

const stratumKey = (item) => {
  const ab = areaBucket(item.staticAreaLowerBound);
  const cuts = pieceCuts[ab];
  const pieces = Number(item.pieces ?? 0);
  const pb = pieces <= cuts.q33 ? "pieces-low" : pieces <= cuts.q67 ? "pieces-mid" : "pieces-high";
  return `${ab}|${pb}`;
};

const strata = new Map();
for (const item of population) {
  const key = stratumKey(item);
  const entry = strata.get(key) ?? { key, population: [], sample: [] };
  entry.population.push(item);
  strata.set(key, entry);
}
for (const row of rows) {
  const item = byFile.get(row.file);
  const key = stratumKey(item);
  strata.get(key).sample.push({ ...row, _population: item });
}

const overallSd = stats(rows.map((row) => Number(row.processWallMs))).stddev || 1;
const summaries = [...strata.values()]
  .sort((a, b) => cmp(a.key, b.key))
  .map((entry) => {
    const values = entry.sample.map((row) => Number(row.processWallMs));
    const s = stats(values);
    const N = entry.population.length;
    const n = entry.sample.length;
    return {
      key: entry.key,
      populationN: N,
      populationWeight: N / population.length,
      sampleN: n,
      sampleFractionPct: pct(n, N),
      processMs: s,
      estimatedContributionToPopulationMeanMs: n > 0 ? (N / population.length) * s.mean : null,
      neymanSigmaMs: n >= 2 && s.stddev > 0 ? s.stddev : overallSd,
      pieceRange: range(entry.population.map((x) => Number(x.pieces ?? 0))),
      areaLbRange: range(entry.population.map((x) => Number(x.staticAreaLowerBound ?? 0))),
      referencePanelsKnownPct: pct(entry.population.filter((x) => Number.isFinite(Number(x.referencePanels))).length, N),
    };
  });

const missingStrata = summaries.filter((s) => s.sampleN === 0).map((s) => s.key);
const sparseStrata = summaries.filter((s) => s.sampleN < 3).map((s) => s.key);
const weightedMeanMs = missingStrata.length
  ? null
  : summaries.reduce((sum, s) => sum + s.populationWeight * s.processMs.mean, 0);

let bootstrap = null;
if (!missingStrata.length && summaries.every((s) => s.sampleN >= 2)) {
  bootstrap = stratifiedBootstrap(strata, population.length, bootstrapReplicates, bootstrapSeed);
}

const allocations = {};
for (const target of targets) allocations[target] = neymanAllocation(summaries, target, rows.length);

const report = {
  schemaVersion: "kernel-v1-formal-runtime-estimate-stratified-v1",
  generatedAt: new Date().toISOString(),
  purpose: "Planning estimate only. Post-stratifies the reproducible random sample using static features known for every feasible resto case.",
  population: {
    feasibleCases: population.length,
    source: populationPath,
    features: populationDoc.features ?? ["pieces", "staticAreaLowerBound", "referencePanels"],
  },
  sample: {
    rows: rows.length,
    identitySetSha256: sha256(rows.map((r) => r.file).sort(cmp).join("\n") + "\n"),
  },
  stratification: {
    areaBuckets,
    pieceBuckets: "population terciles within each area-LB bucket",
    pieceCuts,
    stratumCount: summaries.length,
    missingStrata,
    sparseStrata,
    rationale: "Keep the design coarse enough for n≈100 while separating areaLB=1 from larger lower bounds and low/mid/high piece-count populations. This is planning-only and does not alter the certification cohort.",
  },
  estimate: {
    weightedMeanProcessMs: weightedMeanMs,
    onePassHours: weightedMeanMs == null ? null : msToHours(weightedMeanMs * population.length),
    twoPassHours: weightedMeanMs == null ? null : 2 * msToHours(weightedMeanMs * population.length),
    bootstrapMean95Pct: bootstrap == null ? null : {
      replicates: bootstrapReplicates,
      meanProcessMs: bootstrap.ci95,
      onePassHours: bootstrap.ci95.map((v) => msToHours(v * population.length)),
      twoPassHours: bootstrap.ci95.map((v) => 2 * msToHours(v * population.length)),
      relativeWidthPct: weightedMeanMs > 0 ? pct(bootstrap.ci95[1] - bootstrap.ci95[0], weightedMeanMs) : null,
    },
  },
  strata: summaries,
  neymanAllocation: allocations,
  interpretation: {
    randomSampleRole: "The uniform random sample remains the unbiased control estimate.",
    postStratificationRole: "Use the stratified estimate to reduce variance when runtime is concentrated in identifiable static strata.",
    nextSamplingRule: "After n=100, inspect stratum variance and use the Neyman allocations to target additional observations rather than extending uniformly to 200 by default.",
    stopRule: "Do not call the runtime plan stable solely because the point mean is stable. Require a planning interval narrow enough for the machine/shard decision and no unsampled stratum.",
  },
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(JSON.stringify({
  sample: rows.length,
  population: population.length,
  weightedMeanProcessMs: weightedMeanMs == null ? null : round(weightedMeanMs, 3),
  onePassHours: report.estimate.onePassHours == null ? null : round(report.estimate.onePassHours, 2),
  twoPassHours: report.estimate.twoPassHours == null ? null : round(report.estimate.twoPassHours, 2),
  bootstrapTwoPassHours: report.estimate.bootstrapMean95Pct?.twoPassHours?.map((v) => round(v, 2)) ?? null,
  missingStrata,
  sparseStrata,
  neymanTargets: Object.fromEntries(Object.entries(allocations).map(([k, v]) => [k, { totalSuggested: v.totalSuggested, additionalSuggested: v.additionalSuggested }])),
  out,
}));

function areaBucket(value) {
  const n = Number(value);
  if (n <= 1) return "lb1";
  if (n === 2) return "lb2";
  if (n <= 4) return "lb3-4";
  return "lb5+";
}
function stats(values) {
  const xs = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!xs.length) return { count: 0, mean: 0, p50: 0, p90: 0, p95: 0, p99: 0, max: 0, stddev: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance = xs.length > 1 ? xs.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (xs.length - 1) : 0;
  return { count: xs.length, mean, p50: qnr(xs, .5), p90: qnr(xs, .9), p95: qnr(xs, .95), p99: qnr(xs, .99), max: xs.at(-1) ?? 0, stddev: Math.sqrt(variance) };
}
function stratifiedBootstrap(strata, populationN, reps, seedText) {
  const rnd = lcg(hash32(seedText));
  const means = [];
  const entries = [...strata.values()];
  for (let r = 0; r < reps; r++) {
    let totalMean = 0;
    for (const entry of entries) {
      const xs = entry.sample.map((row) => Number(row.processWallMs));
      let sum = 0;
      for (let i = 0; i < xs.length; i++) sum += xs[Math.floor(rnd() * xs.length)];
      totalMean += (entry.population.length / populationN) * (sum / xs.length);
    }
    means.push(totalMean);
  }
  means.sort((a, b) => a - b);
  return { ci95: [quantileLinear(means, .025), quantileLinear(means, .975)] };
}
function neymanAllocation(summaries, target, currentTotal) {
  const weights = summaries.map((s) => ({ key: s.key, w: s.populationN * Math.max(1, Number(s.neymanSigmaMs) || 1), current: s.sampleN }));
  const denom = weights.reduce((sum, x) => sum + x.w, 0) || 1;
  const rows = weights.map((x) => {
    const ideal = target * x.w / denom;
    const suggested = Math.max(x.current, Math.ceil(ideal));
    return { key: x.key, current: x.current, idealTarget: ideal, suggestedTarget: suggested, additional: Math.max(0, suggested - x.current) };
  });
  return {
    requestedTarget: target,
    currentTotal,
    totalSuggested: rows.reduce((s, x) => s + x.suggestedTarget, 0),
    additionalSuggested: rows.reduce((s, x) => s + x.additional, 0),
    strata: rows,
    note: "Ceiling and never-discard-current constraints can make totalSuggested exceed requestedTarget. Strata with <2 samples use the overall sample SD as a conservative variance proxy.",
  };
}
function range(values) { const xs = values.filter(Number.isFinite); return xs.length ? [Math.min(...xs), Math.max(...xs)] : [null, null]; }
function qnr(xs, p) { return xs[Math.min(xs.length - 1, Math.max(0, Math.ceil(xs.length * p) - 1))] ?? 0; }
function quantileLinear(xs, p) { if (!xs.length) return 0; const x = (xs.length - 1) * p, lo = Math.floor(x), hi = Math.ceil(x), f = x - lo; return xs[lo] * (1 - f) + xs[hi] * f; }
function hash32(text) { return Number.parseInt(createHash("sha256").update(String(text)).digest("hex").slice(0, 8), 16) >>> 0; }
function lcg(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
function msToHours(ms) { return ms / 3_600_000; }
function pct(n, d) { return d ? round(100 * n / d, 4) : 0; }
function round(v, n = 6) { const p = 10 ** n; return Math.round(Number(v) * p) / p; }
function sha256(v) { return createHash("sha256").update(v).digest("hex"); }
function cmp(a, b) { return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0; }
function readJson(path) { return JSON.parse(readFileSync(path, "utf8")); }
function readJsonl(path) { return readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse); }
function uniqueLatest(rows) { return [...new Map(rows.map((row) => [row.file, row])).values()]; }
function positiveInt(value, label) { const n = Number(value); if (!Number.isSafeInteger(n) || n <= 0) fail(`${label} must be a positive integer`); return n; }
function parseArgs(values) { const out = {}; for (let i = 0; i < values.length; i++) { const token = values[i]; if (!token.startsWith("--")) continue; const key = token.slice(2), next = values[i + 1]; if (next != null && !next.startsWith("--")) { out[key] = next; i++; } else out[key] = true; } return out; }
function fail(message) { throw new Error(message); }

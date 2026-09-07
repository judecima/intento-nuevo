#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
const winsPath = resolve(String(args.wins ?? "experiencia/v22b-master-prefix-profile.json"));
const nonwinsPath = resolve(String(args.nonwins ?? "experiencia/v22b-saturation-nonwins-40-profile.json"));
const outPath = typeof args.out === "string" ? resolve(args.out) : null;
const streaks = parseInts(args.streaks ?? "5,10,15,20");

if (!existsSync(winsPath)) throw new Error(`no existe wins: ${winsPath}`);
if (!existsSync(nonwinsPath)) throw new Error(`no existe nonwins: ${nonwinsPath}`);

const winsDoc = JSON.parse(readFileSync(winsPath, "utf8"));
const nonwinsDoc = JSON.parse(readFileSync(nonwinsPath, "utf8"));
const wins = validRows(winsDoc.results ?? []);
const nonwins = validRows(nonwinsDoc.results ?? []);

const parityFailures = [...wins, ...nonwins].filter((x) => x.parity40 === false).map((x) => x.file);
if (parityFailures.length) {
  console.error(`parity40 FAIL: ${parityFailures.join(", ")}`);
  process.exit(2);
}

const sensitivity = streaks.map((streak) => {
  const winRows = wins.map((row) => {
    const cutRound = earliestZeroStreakRound(row.poolGrowthByRound ?? [], streak);
    const firstImprovementCheckpoint = finite(row.firstImprovementCheckpoint);
    return {
      file: row.file,
      firstImprovementCheckpoint,
      cutRound,
      potentiallyCutsBeforeKnownWin: Number.isFinite(cutRound) && Number.isFinite(firstImprovementCheckpoint)
        ? cutRound <= firstImprovementCheckpoint
        : false,
    };
  });
  const nonwinRows = nonwins.map((row) => {
    const maxRound = row.poolGrowthByRound?.at(-1)?.round ?? 40;
    const cutRound = earliestZeroStreakRound(row.poolGrowthByRound ?? [], streak);
    const roundsSaved = Number.isFinite(cutRound) ? Math.max(0, maxRound - cutRound) : 0;
    return { file: row.file, types: row.types, cutRound, roundsSaved };
  });
  const cuts = nonwinRows.filter((x) => Number.isFinite(x.cutRound));
  return {
    streak,
    sentinelPotentialLosses: winRows.filter((x) => x.potentiallyCutsBeforeKnownWin).length,
    sentinelDetails: winRows.filter((x) => x.potentiallyCutsBeforeKnownWin),
    nonwinsCut: cuts.length,
    nonwinsTotal: nonwinRows.length,
    nonwinsCutPct: pct(cuts.length, nonwinRows.length),
    totalGenerationRoundsSavedProxy: cuts.reduce((sum, x) => sum + x.roundsSaved, 0),
    avgRoundsSavedWhenCut: cuts.length ? cuts.reduce((sum, x) => sum + x.roundsSaved, 0) / cuts.length : 0,
  };
});

const nonwinMetrics = nonwins.map((row) => ({
  file: row.file,
  types: finite(row.types),
  pieces: finite(row.pieces),
  totalVectors: finite(row.saturation?.totalVectors),
  roundsSinceLastNewVector: finite(row.saturation?.roundsSinceLastNewVector),
  maxZeroStreak: finite(row.saturation?.maxConsecutiveZeroGrowthRounds),
  vectorsLast20: finite(row.saturation?.vectorsAddedLast20Rounds),
}));

const correlations = {
  types_vs_totalVectors: spearman(nonwinMetrics, "types", "totalVectors"),
  types_vs_roundsSinceLastNewVector: spearman(nonwinMetrics, "types", "roundsSinceLastNewVector"),
  types_vs_maxZeroStreak: spearman(nonwinMetrics, "types", "maxZeroStreak"),
  pieces_vs_roundsSinceLastNewVector: spearman(nonwinMetrics, "pieces", "roundsSinceLastNewVector"),
};

const report = {
  wins: wins.length,
  nonwins: nonwins.length,
  parity40Failures: parityFailures,
  nonwinSaturationDistribution: {
    roundsSinceLastNewVector: distribution(nonwinMetrics.map((x) => x.roundsSinceLastNewVector)),
    maxZeroStreak: distribution(nonwinMetrics.map((x) => x.maxZeroStreak)),
    vectorsLast20: distribution(nonwinMetrics.map((x) => x.vectorsLast20)),
    types: distribution(nonwinMetrics.map((x) => x.types)),
  },
  correlations,
  sensitivity,
  interpretation: [
    "This report does not choose a stopping threshold.",
    "A zero-growth streak is empirical saturation, not proof that no unseen vector can appear later.",
    "sentinelPotentialLosses is a conservative screen against known late wins, not a proof of safety when it is zero.",
    "Generation rounds saved are only a structural proxy; wall-time savings require a same-machine benchmark after a candidate policy exists.",
    "Strong correlation between type count and saturation metrics means saturation may be mostly a small-order proxy rather than an independent continuation signal."
  ],
};

console.log(JSON.stringify(report, null, 2));
if (outPath) writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");

function validRows(rows) {
  return rows.filter((x) => x?.ok === true && Array.isArray(x.poolGrowthByRound));
}
function earliestZeroStreakRound(growth, needed) {
  let zero = 0;
  for (const row of growth) {
    if (Number(row.newVectors) === 0) zero++;
    else zero = 0;
    if (zero >= needed) return Number(row.round);
  }
  return null;
}
function distribution(values) {
  const xs = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!xs.length) return null;
  return {
    n: xs.length,
    min: xs[0],
    p25: quantile(xs, 0.25),
    median: quantile(xs, 0.5),
    p75: quantile(xs, 0.75),
    p90: quantile(xs, 0.9),
    max: xs.at(-1),
    mean: xs.reduce((a, b) => a + b, 0) / xs.length,
  };
}
function spearman(rows, a, b) {
  const pairs = rows.map((x) => [x[a], x[b]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (pairs.length < 3) return null;
  const rx = ranks(pairs.map((x) => x[0]));
  const ry = ranks(pairs.map((x) => x[1]));
  const mx = rx.reduce((s, x) => s + x, 0) / rx.length;
  const my = ry.reduce((s, x) => s + x, 0) / ry.length;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < rx.length; i++) {
    const x = rx[i] - mx, y = ry[i] - my;
    num += x * y; dx += x * x; dy += y * y;
  }
  return { n: pairs.length, rho: dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : null };
}
function ranks(values) {
  const sorted = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array(values.length);
  for (let i = 0; i < sorted.length;) {
    let j = i + 1;
    while (j < sorted.length && sorted[j].v === sorted[i].v) j++;
    const rank = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) out[sorted[k].i] = rank;
    i = j;
  }
  return out;
}
function quantile(xs, q) {
  if (xs.length === 1) return xs[0];
  const pos = (xs.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  if (lo === hi) return xs[lo];
  return xs[lo] + (xs[hi] - xs[lo]) * (pos - lo);
}
function pct(a, b) { return b ? a / b * 100 : 0; }
function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function parseInts(value) {
  const xs = String(value).split(",").map((x) => Number.parseInt(x.trim(), 10)).filter((x) => Number.isFinite(x) && x > 0);
  return [...new Set(xs)].sort((a, b) => a - b);
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

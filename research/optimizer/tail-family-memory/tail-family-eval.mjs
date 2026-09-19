#!/usr/bin/env node
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const outPath = resolve(here, "tail-family-results.json");

const load = (name) =>
  JSON.parse(readFileSync(resolve(repo, "experiencia/v5", name), "utf8"));

const v10 = load("baseline-v10-5000-2000-r1.json");
const fast1 = load("baseline-baseline-5000-2000-r1.json");
const fast2 = load("baseline-baseline-5000-2000-r2.json");

const fastMap1 = new Map(fast1.records.filter((r) => r.ok).map((r) => [r.file, r]));
const fastMap2 = new Map(fast2.records.filter((r) => r.ok).map((r) => [r.file, r]));

const data = v10.records
  .filter((r) => r.ok && fastMap1.has(r.file) && fastMap2.has(r.file))
  .map((r) => {
    const a = fastMap1.get(r.file);
    const b = fastMap2.get(r.file);
    const fast = a.totalMs <= b.totalMs ? a : b;
    return {
      file: r.file,
      order: r.order,
      pieces: r.pieces,
      fastMs: fast.totalMs,
      fastBoards: fast.boards,
      v10Ms: r.totalMs,
      v10Boards: r.boards
    };
  })
  .sort((a, b) => a.order - b.order);

function quantile(values, p) {
  const xs = values.slice().sort((a, b) => a - b);
  if (!xs.length) return 0;
  const pos = (xs.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? xs[lo] : xs[lo] + (xs[hi] - xs[lo]) * (pos - lo);
}

function pieceBucket(n) {
  if (n <= 20) return "p0_20";
  if (n <= 50) return "p21_50";
  if (n <= 100) return "p51_100";
  if (n <= 200) return "p101_200";
  if (n <= 500) return "p201_500";
  return "p500p";
}

function boardBucket(n) {
  if (n <= 1) return "b1";
  if (n <= 4) return "b2_4";
  if (n <= 9) return "b5_9";
  if (n <= 19) return "b10_19";
  return "b20p";
}

function familyKey(row) {
  return pieceBucket(row.pieces) + "|" + boardBucket(row.fastBoards);
}

function fit(train, targetFraction) {
  const fallback = quantile(train.map((x) => x.v10Ms), 0.95);
  const groups = new Map();

  for (const row of train) {
    const key = familyKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row.v10Ms);
  }

  const familyScores = new Map();
  for (const [key, values] of groups) {
    const shrink = Math.min(1, values.length / 8);
    const local = quantile(values, 0.80);
    familyScores.set(key, shrink * local + (1 - shrink) * fallback);
  }

  const ranked = train
    .map((row) => ({
      ...row,
      score: familyScores.get(familyKey(row)) ?? fallback
    }))
    .sort((a, b) => b.score - a.score || b.fastMs - a.fastMs || a.order - b.order);

  const selected = Math.max(1, Math.ceil(train.length * targetFraction));
  const boundary = ranked[selected - 1];

  return {
    familyScores,
    fallback,
    boundaryScore: boundary.score,
    boundaryFastMs: boundary.fastMs,
    trainSelected: selected
  };
}

function predictsTail(row, model) {
  const score = model.familyScores.get(familyKey(row)) ?? model.fallback;
  if (score > model.boundaryScore) return true;
  if (score < model.boundaryScore) return false;
  return row.fastMs >= model.boundaryFastMs;
}

function evaluate(train, test, targetFraction) {
  const model = fit(train, targetFraction);
  const routed = test.filter((row) => predictsTail(row, model));
  const routedFiles = new Set(routed.map((row) => row.file));
  const nonRouted = test.filter((row) => !routedFiles.has(row.file));

  const p95 = quantile(test.map((x) => x.v10Ms), 0.95);
  const p99 = quantile(test.map((x) => x.v10Ms), 0.99);
  const tail95 = test.filter((x) => x.v10Ms >= p95);
  const tail99 = test.filter((x) => x.v10Ms >= p99);
  const totalCpu = test.reduce((sum, x) => sum + x.v10Ms, 0);
  const routedCpu = routed.reduce((sum, x) => sum + x.v10Ms, 0);

  return {
    targetRoutePct: targetFraction * 100,
    actualRoutePct: Number((100 * routed.length / test.length).toFixed(1)),
    routedN: routed.length,
    recallP95: Number((100 * tail95.filter((x) => routedFiles.has(x.file)).length / tail95.length).toFixed(1)),
    recallP99: Number((100 * tail99.filter((x) => routedFiles.has(x.file)).length / tail99.length).toFixed(1)),
    precisionP95: Number((100 * routed.filter((x) => x.v10Ms >= p95).length / Math.max(1, routed.length)).toFixed(1)),
    precisionP99: Number((100 * routed.filter((x) => x.v10Ms >= p99).length / Math.max(1, routed.length)).toFixed(1)),
    cpuSharePct: Number((100 * routedCpu / totalCpu).toFixed(1)),
    testP95Ms: Number(p95.toFixed(1)),
    testP99Ms: Number(p99.toFixed(1)),
    nonRoutedP95Ms: nonRouted.length ? Number(quantile(nonRouted.map((x) => x.v10Ms), 0.95).toFixed(1)) : 0,
    nonRoutedP99Ms: nonRouted.length ? Number(quantile(nonRouted.map((x) => x.v10Ms), 0.99).toFixed(1)) : 0,
    modelBoundary: {
      familyScore: Number(model.boundaryScore.toFixed(1)),
      fastMs: Number(model.boundaryFastMs.toFixed(1))
    }
  };
}

const windowSpecs = [
  [600, 1000],
  [1000, 1400],
  [1400, 1800],
  [1600, 2000]
];

const windows = windowSpecs.map(([trainEnd, testEnd]) => {
  const train = data.slice(0, trainEnd);
  const test = data.slice(trainEnd, testEnd);
  return {
    train: [0, trainEnd],
    test: [trainEnd, testEnd],
    trainN: train.length,
    testN: test.length,
    route10: evaluate(train, test, 0.10),
    route20: evaluate(train, test, 0.20)
  };
});

function aggregate(field) {
  const xs = windows.map((window) => window[field]);
  const avg = (key) => xs.reduce((sum, x) => sum + x[key], 0) / xs.length;
  return {
    meanActualRoutePct: Number(avg("actualRoutePct").toFixed(1)),
    meanRecallP95: Number(avg("recallP95").toFixed(1)),
    minRecallP95: Math.min(...xs.map((x) => x.recallP95)),
    meanRecallP99: Number(avg("recallP99").toFixed(1)),
    minRecallP99: Math.min(...xs.map((x) => x.recallP99)),
    meanCpuSharePct: Number(avg("cpuSharePct").toFixed(1))
  };
}

const halfTrain = data.slice(0, 1000);
const halfTest = data.slice(1000);
const result = {
  generatedAt: new Date().toISOString(),
  purpose: "Offline tail-family memory evaluation. No optimizer behavior is changed.",
  data: {
    pairedCases: data.length,
    orderRange: [data[0]?.order ?? null, data.at(-1)?.order ?? null],
    source: [
      "experiencia/v5/baseline-v10-5000-2000-r1.json",
      "experiencia/v5/baseline-baseline-5000-2000-r1.json",
      "experiencia/v5/baseline-baseline-5000-2000-r2.json"
    ]
  },
  family: {
    key: "piece-count bucket + Fast board-count bucket",
    tieBreak: "Fast elapsed time",
    pieceBuckets: ["<=20", "21-50", "51-100", "101-200", "201-500", ">500"],
    boardBuckets: ["1", "2-4", "5-9", "10-19", ">=20"],
    safety: "advisory only; never returns a plan and never removes fallback search"
  },
  chronologicalHalfSplit: {
    trainN: halfTrain.length,
    testN: halfTest.length,
    route10: evaluate(halfTrain, halfTest, 0.10),
    route20: evaluate(halfTrain, halfTest, 0.20)
  },
  expandingWindows: windows,
  aggregate: {
    route10: aggregate("route10"),
    route20: aggregate("route20")
  }
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n", "utf8");
console.log(JSON.stringify(result, null, 2));

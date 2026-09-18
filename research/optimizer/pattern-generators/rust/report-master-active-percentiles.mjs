#!/usr/bin/env node
import fs from "node:fs";

const paths = process.argv.slice(2);
if (!paths.length) {
  console.error("Usage: node report-master-active-percentiles.mjs <results.jsonl> [more-results.jsonl ...]");
  process.exit(2);
}

const rows = paths.flatMap((path) =>
  fs.readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line)),
);

const byFile = new Map();
for (const row of rows) {
  const key = row.file;
  if (!key) continue;
  const previous = byFile.get(key);
  if (row.ok || !previous) byFile.set(key, row);
}

const ok = [...byFile.values()].filter((row) => row.ok);

function percentile(values, q) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const k = (sorted.length - 1) * q;
  const lo = Math.floor(k);
  const hi = Math.ceil(k);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (hi - k) + sorted[hi] * (k - lo);
}

function distribution(key) {
  const values = ok.map((row) => row[key]).filter(Number.isFinite);
  return {
    n: values.length,
    p50: percentile(values, 0.50),
    p90: percentile(values, 0.90),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
  };
}

function roundObject(value) {
  if (Array.isArray(value)) return value.map(roundObject);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, roundObject(child)]));
  }
  return typeof value === "number" ? Number(value.toFixed(3)) : value;
}

const legacyCpu = ok.reduce((sum, row) => sum + Number(row.legacyCpuMs || 0), 0);
const rustCpu = ok.reduce((sum, row) => sum + Number(row.rustCpuMs || 0), 0);
const legacyWall = ok.reduce((sum, row) => sum + Number(row.legacyWallMs || 0), 0);
const rustWall = ok.reduce((sum, row) => sum + Number(row.rustWallMs || 0), 0);

const report = {
  percentileMethod: "Type-7 linear interpolation ((n-1)*q), NumPy/R default style",
  uniqueCasesSeen: byFile.size,
  validCases: ok.length,
  unscoredCases: byFile.size - ok.length,
  regressions: ok.filter((row) => row.boardRegression).length,
  invalidRustPatternCases: ok.filter((row) => Number(row.invalidRust || 0) > 0).length,
  invalidRustMaterializations: ok.filter((row) => row.rustMaterializedValid === false).length,
  rustSlowerCases: ok.filter((row) => Number(row.speedup) < 1).length,
  distributions: {
    legacyCpuMs: distribution("legacyCpuMs"),
    rustCpuMs: distribution("rustCpuMs"),
    legacyWallMs: distribution("legacyWallMs"),
    rustWallMs: distribution("rustWallMs"),
    perCaseSpeedup: distribution("speedup"),
  },
  aggregate: {
    cpuSpeedup: rustCpu > 0 ? legacyCpu / rustCpu : null,
    wallSpeedup: rustWall > 0 ? legacyWall / rustWall : null,
  },
};

console.log(JSON.stringify(roundObject(report), null, 2));

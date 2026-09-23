"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../..");
const DIR = path.join(ROOT, "research", "optimizer", "saas-hardening");
const files = fs.readdirSync(DIR).filter((name) => /^isolation-broad-shard-\d+\.json$/.test(name));

if (!files.length) throw new Error("no isolation broad shard artifacts");

const shards = files.map((name) => JSON.parse(fs.readFileSync(path.join(DIR, name), "utf8")));
const rows = shards.flatMap((shard) => shard.rows || []);
const failures = rows.filter((row) => !row.ok);
const syncTimes = rows.map((row) => Number(row.syncMs)).filter(Number.isFinite).sort((a,b)=>a-b);
const isolatedTimes = rows.map((row) => Number(row.isolatedMs)).filter(Number.isFinite).sort((a,b)=>a-b);

function percentile(values, ratio) {
  if (!values.length) return null;
  return values[Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * ratio) - 1))];
}

const syncTotal = syncTimes.reduce((a,b)=>a+b,0);
const isolatedTotal = isolatedTimes.reduce((a,b)=>a+b,0);
const output = {
  schema: "optimizer-isolation-broad-report-v1",
  status: failures.length === 0 ? "PASS" : "FAIL",
  furnitureTotal: shards[0]?.furnitureTotal ?? null,
  sampledTotal: shards[0]?.sampledTotal ?? rows.length,
  cases: rows.length,
  failures: failures.length,
  boardDifferences: rows.filter((row) => row.syncBoards !== row.isolatedBoards).length,
  digestDifferences: rows.filter((row) => row.syncDigest !== row.isolatedDigest).length,
  performance: {
    syncTotalMs: syncTotal,
    isolatedTotalMs: isolatedTotal,
    overheadMs: isolatedTotal - syncTotal,
    overheadPct: syncTotal ? 100 * (isolatedTotal / syncTotal - 1) : null,
    syncP50Ms: percentile(syncTimes, 0.5),
    isolatedP50Ms: percentile(isolatedTimes, 0.5),
    syncP95Ms: percentile(syncTimes, 0.95),
    isolatedP95Ms: percentile(isolatedTimes, 0.95),
    syncP99Ms: percentile(syncTimes, 0.99),
    isolatedP99Ms: percentile(isolatedTimes, 0.99),
  },
  failureRows: failures.slice(0, 20),
};

fs.writeFileSync(
  path.join(DIR, "ISOLATION_BROAD_RESULT.json"),
  JSON.stringify(output, null, 2) + "\n",
);
console.log("ISOLATION_BROAD_RESULT " + JSON.stringify(output));
if (failures.length) process.exitCode = 2;

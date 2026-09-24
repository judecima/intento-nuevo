"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../..");
const DIR = path.join(ROOT, "research", "optimizer", "saas-hardening");
const files = fs.readdirSync(DIR).filter((name) => /^remnant-polish-broad-shard-\d+\.json$/.test(name));
if (!files.length) throw new Error("no remnant polish broad shard artifacts");

const shards = files.map((name) => JSON.parse(fs.readFileSync(path.join(DIR, name), "utf8")));
const rows = shards.flatMap((shard) => shard.rows || []);
const failures = rows.filter((row) => !row.ok);
const improvements = rows.filter((row) => row.improved);
const baselineTimes = rows.map((row) => +row.baselineMs || 0).sort((a,b)=>a-b);
const candidateTimes = rows.map((row) => +row.candidateMs || 0).sort((a,b)=>a-b);

const sum = (values) => values.reduce((a,b)=>a+b,0);
const percentile = (values, q) => values.length
  ? values[Math.min(values.length - 1, Math.max(0, Math.ceil(values.length*q)-1))]
  : null;

const output = {
  schema: "optimizer-remnant-polish-broad-report-v1",
  status: failures.length === 0 ? "PASS" : "FAIL",
  eligibleTotal: shards[0]?.eligibleTotal ?? null,
  sampledTotal: shards[0]?.sampledTotal ?? rows.length,
  cases: rows.length,
  failures: failures.length,
  boardRegressions: rows.filter((row) => row.boardDelta > 0).length,
  invalidCandidates: rows.filter((row) => row.candidateValid !== true).length,
  remnantRegressions: rows.filter((row) => row.boardDelta === 0 && row.remnantCmp < 0).length,
  improvements: improvements.length,
  remnantImprovements: rows.filter((row) => row.boardDelta === 0 && row.remnantCmp > 0).length,
  boardImprovements: rows.filter((row) => row.boardDelta < 0).length,
  performance: {
    baselineTotalMs: sum(baselineTimes),
    candidateTotalMs: sum(candidateTimes),
    deltaPct: sum(baselineTimes) ? 100*(sum(candidateTimes)/sum(baselineTimes)-1) : null,
    baselineP50Ms: percentile(baselineTimes,.5),
    candidateP50Ms: percentile(candidateTimes,.5),
    baselineP95Ms: percentile(baselineTimes,.95),
    candidateP95Ms: percentile(candidateTimes,.95),
    baselineP99Ms: percentile(baselineTimes,.99),
    candidateP99Ms: percentile(candidateTimes,.99),
  },
  topImprovements: improvements
    .slice()
    .sort((a,b) =>
      (b.candidateRemnant?.largest||0)-(b.baselineRemnant?.largest||0) -
      ((a.candidateRemnant?.largest||0)-(a.baselineRemnant?.largest||0))
    )
    .slice(0,20),
  failureRows: failures.slice(0,20),
};

fs.writeFileSync(
  path.join(DIR, "REMNANT_POLISH_BROAD_RESULT.json"),
  JSON.stringify(output, null, 2) + "\n",
);
console.log("REMNANT_POLISH_BROAD_RESULT " + JSON.stringify(output));
if (failures.length) process.exitCode = 2;

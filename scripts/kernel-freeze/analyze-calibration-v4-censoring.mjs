#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { cpus, totalmem, platform, release, arch } from "node:os";

const args = parseArgs(process.argv.slice(2));
const checkpoint = resolve(args.checkpoint ?? "test-results/kernel-v1-formal-certification/calibration-v4.partial.jsonl");
const out = resolve(args.out ?? "test-results/kernel-v1-formal-certification/calibration-v4.censoring.json");

if (!existsSync(checkpoint)) throw new Error(`checkpoint not found: ${checkpoint}`);

const rows = uniqueLatest(
  readFileSync(checkpoint, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((row) => row.pass === true && row.telemetryContractId === "step0-work-telemetry-v2"),
);

const cpuInfo = cpus();
const report = {
  schemaVersion: "kernel-v1-calibration-v4-time-censoring-v1",
  generatedAt: new Date().toISOString(),
  checkpoint,
  completedCases: rows.length,
  analysisEnvironment: {
    node: process.version,
    platform: platform(),
    release: release(),
    arch: arch(),
    cpuModel: cpuInfo[0]?.model ?? null,
    logicalCpuCount: cpuInfo.length,
    totalMemoryBytes: totalmem(),
    note: "This fingerprints the machine/runtime executing the analyzer. Run it on the same machine/runtime family as the physical calibration when using reference-machine budget policy evidence.",
  },
  interpretation: {
    timeoutHit: "A historical wall-clock ceiling terminated at least one invocation. Work observed in that invocation is right-censored and must not be interpreted as work required to complete the search.",
    budgetHit: "A deterministic work budget terminated an invocation. Calibration runs should have deterministic budgets OFF; non-zero budgetHits therefore require investigation.",
    watchdogHit: "A deterministic watchdog terminated an invocation. Calibration runs should have watchdogs OFF; non-zero watchdogHits therefore require investigation.",
    promotionRule: "A per-invocation deterministic budget must not be promoted from censored work maxima as if they represented completed-search requirements. Either use uncensored evidence or explicitly define and document a reference-machine/product work-budget policy, then validate the chosen fixed budget formally.",
  },
  paths: {
    beam: analyzePath(rows, {
      invocations: (row) => row.step0?.beam?.calls,
      timeoutHits: (row) => row.step0?.beam?.timeoutHits,
      budgetHits: (row) => row.step0?.beam?.budgetHits,
      watchdogHits: (row) => row.step0?.beam?.watchdogHits,
      workMax: (row) => row.step0?.beam?.expansionsMax,
      workTotal: (row) => row.step0?.beam?.expansionsTotal,
      wallMsMax: (row) => row.step0?.beam?.wallMsMax,
      workMetric: "beam.expansionsMax",
      budgetParameter: "OPTIMIZER_MAX_BEAM_EXPANSIONS",
    }),
    master: analyzePath(rows, {
      invocations: (row) => row.step0?.master?.runs,
      timeoutHits: (row) => row.step0?.master?.timeoutHits,
      budgetHits: (row) => row.step0?.master?.budgetHits,
      watchdogHits: (row) => row.step0?.master?.watchdogHits,
      workMax: (row) => row.step0?.master?.nodesMax,
      workTotal: (row) => row.step0?.master?.nodesTotal,
      wallMsMax: (row) => row.step0?.master?.wallMsMax,
      workMetric: "master.nodesMax",
      budgetParameter: "OPTIMIZER_MAX_MASTER_NODES",
    }),
    oneboard: analyzePath(rows, {
      invocations: (row) => row.step0?.oneboard?.runs,
      timeoutHits: (row) => row.step0?.oneboard?.timeoutHits,
      budgetHits: (row) => row.step0?.oneboard?.budgetHits,
      watchdogHits: (row) => row.step0?.oneboard?.watchdogHits,
      workMax: (row) => row.step0?.oneboard?.attemptsMax,
      workTotal: (row) => row.step0?.oneboard?.attemptsTotal,
      wallMsMax: (row) => row.step0?.oneboard?.wallMsMax,
      workMetric: "oneboard.attemptsMax",
      budgetParameter: "OPTIMIZER_MAX_RESCUE_ATTEMPTS",
    }),
  },
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(JSON.stringify(report, null, 2));

function analyzePath(rows, spec) {
  const activated = rows.filter((row) => num(spec.invocations(row)) > 0);
  const invocations = sum(rows, spec.invocations);
  const timeoutHits = sum(rows, spec.timeoutHits);
  const budgetHits = sum(rows, spec.budgetHits);
  const watchdogHits = sum(rows, spec.watchdogHits);
  const casesWithTimeout = activated.filter((row) => num(spec.timeoutHits(row)) > 0);
  const conservativelyUncensoredCases = activated.filter((row) => num(spec.timeoutHits(row)) === 0);
  const allWorkMax = distribution(activated.map((row) => num(spec.workMax(row))));
  const uncensoredWorkMax = distribution(conservativelyUncensoredCases.map((row) => num(spec.workMax(row))));
  const allWallMsMax = distribution(activated.map((row) => num(spec.wallMsMax(row))));

  return {
    budgetParameter: spec.budgetParameter,
    primaryWorkMetric: spec.workMetric,
    activatedCases: activated.length,
    invocations,
    timeoutHits,
    budgetHits,
    watchdogHits,
    timeCensoredInvocationPct: pct(timeoutHits, invocations),
    casesWithAnyTimeout: casesWithTimeout.length,
    casesWithAnyTimeoutPct: pct(casesWithTimeout.length, activated.length),
    conservativelyUncensoredCases: conservativelyUncensoredCases.length,
    aggregateWorkTotal: sum(rows, spec.workTotal),
    workMaxAllActivatedCases: allWorkMax,
    workMaxConservativelyUncensoredCases: uncensoredWorkMax,
    wallMsMaxAllActivatedCases: allWallMsMax,
    censoringStatus: timeoutHits > 0 ? "TIME_CENSORED" : "NO_TIMEOUT_CENSORING_OBSERVED",
    observedMaxSafeToInterpretAsCompletedSearchRequirement: timeoutHits === 0,
    note: timeoutHits > 0
      ? "At least one invocation was stopped by the historical wall-clock ceiling. Treat work maxima from affected cases as right-censored throughput observations, not completed-search requirements."
      : "No historical timeout was observed in the current completed calibration rows for this path; this does not by itself prove the tail is uncensored until sufficient tail coverage is reached.",
  };
}

function uniqueLatest(rows) {
  return [...new Map(rows.map((row) => [row.file, row])).values()];
}

function sum(rows, fn) {
  return rows.reduce((total, row) => total + num(fn(row)), 0);
}

function num(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function pct(n, d) {
  return d ? Number((100 * n / d).toFixed(4)) : 0;
}

function distribution(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))] ?? 0;
  return {
    count: sorted.length,
    p50: q(0.5),
    p90: q(0.9),
    p95: q(0.95),
    p99: q(0.99),
    max: sorted.at(-1) ?? 0,
  };
}

function parseArgs(values) {
  const out = {};
  for (let i = 0; i < values.length; i++) {
    const token = values[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = values[i + 1];
    if (next != null && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

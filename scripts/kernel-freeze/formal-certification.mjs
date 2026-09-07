#!/usr/bin/env node
import { createHash } from "node:crypto";
import { fork, spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT = fileURLToPath(import.meta.url);
const REPO = resolve(dirname(SCRIPT), "../..");
const KERNEL_CANDIDATE = "4063963260abb10c8d68d0e553942899c925cc2f";
const EXPECTED_CASES = 8650;
const EXPECTED_IDENTITY_HASH = "36d005421ae79b01867e0bba377c1bf526801bcd4dcfa2b0180e12cf354458f3";
const POLICY_PATH = join(REPO, "research/optimizer/freeze/KERNEL_V1_FORMAL_CERTIFICATION_POLICY.json");
const TRACEABILITY_PATH = join(REPO, "research/optimizer/freeze/KERNEL_V1_FREEZE_TRACEABILITY.json");
const RECONCILIATION_PATH = join(REPO, "research/optimizer/freeze/KERNEL_V1_RESTO_RECONCILIATION.json");
const AUDIT_PATH = join(REPO, "research/optimizer/freeze/KERNEL_V1_RESTO_ARCHIVE_AUDIT_2026-09-07.json");
const CANONICAL_PATH = join(REPO, "experiencia/canonical_cases.json");
const HOTSPOT_PATH = join(REPO, "experiencia/v6/hotspot-all.jsonl");

const args = parseArgs(process.argv.slice(2));

if (args.child) {
  await childRun(args);
} else {
  const mode = args._[0] ?? "preflight";
  if (!new Set(["preflight", "calibrate", "correctness", "determinism"]).has(mode)) {
    fail("mode must be preflight | calibrate | correctness | determinism");
  }
  await main(mode, args);
}

async function main(mode, args) {
  const state = buildPreflightState();
  const reportPath = resolve(args.report ?? join(REPO, "research/optimizer/freeze/KERNEL_V1_FORMAL_CERTIFICATION_PREFLIGHT.json"));
  writeJson(reportPath, state.preflightReport);

  if (mode === "preflight") {
    console.log(JSON.stringify({
      status: state.preflightReport.status,
      traceabilityComplete: state.traceabilityComplete,
      cohort: `${state.cohort.records.length}/${state.cohort.identities.length}`,
      cohortSha256: state.cohort.identitySetSha256,
      runtimeMatchesCandidate: state.runtimeMatchesCandidate,
      deterministicBudgetsReady: state.budgetsReady,
      correctnessPredicateReady: state.predicateReady,
      formalCertificationReady: state.formalReady,
      blockingReasons: state.blockingReasons,
      report: relative(reportPath),
    }));
    if (!state.traceabilityComplete || !state.runtimeMatchesCandidate) process.exitCode = 1;
    if (args["require-ready"] && !state.formalReady) process.exitCode = 2;
    return;
  }

  if (!state.traceabilityComplete) fail("traceability is incomplete");
  if (!state.runtimeMatchesCandidate) fail("src/lib/optimizer differs from the frozen Kernel V1 candidate");
  if (mode !== "calibrate" && !state.formalReady) {
    fail(`formal certification policy is blocked: ${state.blockingReasons.join("; ")}`);
  }

  const outDir = resolve(args.out ?? join(REPO, "test-results/kernel-v1-formal-certification"));
  mkdirSync(outDir, { recursive: true });
  const maxNew = args.maxNew == null ? null : positiveInt(args.maxNew, "--maxNew");
  const timeoutMs = args.timeout == null ? 7_200_000 : positiveInt(args.timeout, "--timeout");
  const bundle = await buildOptimizerBundle(outDir);

  if (mode === "calibrate") {
    await runCalibration({ state, outDir, bundle, maxNew, timeoutMs });
  } else if (mode === "correctness") {
    await runCorrectness({ state, outDir, bundle, maxNew, timeoutMs });
  } else {
    await runDeterminism({ state, outDir, bundle, maxNew, timeoutMs });
  }
}

function buildPreflightState() {
  const policy = readJson(POLICY_PATH);
  const traceability = readJson(TRACEABILITY_PATH);
  const reconciliation = readJson(RECONCILIATION_PATH);
  const audit = readJson(AUDIT_PATH);
  const canonical = readJson(CANONICAL_PATH);
  if (!Array.isArray(canonical)) fail("canonical_cases.json must be an array");

  const cohort = deriveExactCohort(canonical, audit);
  const runtimeDiff = spawnSync("git", ["diff", "--quiet", KERNEL_CANDIDATE, "--", "src/lib/optimizer"], {
    cwd: REPO,
    encoding: "utf8",
  });
  const runtimeMatchesCandidate = runtimeDiff.status === 0;

  const traceabilityChecks = {
    candidateMatches: policy?.kernelCandidate === KERNEL_CANDIDATE && traceability?.kernelCandidate === KERNEL_CANDIDATE,
    archive8669: reconciliation?.auditSummary?.archiveXml === 8669 && reconciliation?.auditSummary?.uniqueNames === 8669,
    reconciliationRecovered: reconciliation?.status === "RECOVERED",
    cohortCount: cohort.records.length === EXPECTED_CASES && cohort.identities.length === EXPECTED_CASES,
    cohortHash: cohort.identitySetSha256 === EXPECTED_IDENTITY_HASH,
    aggregateCohortHash: traceability?.currentCorrectnessCohort?.identitySetSha256 === EXPECTED_IDENTITY_HASH,
  };
  const traceabilityComplete = Object.values(traceabilityChecks).every(Boolean);

  const budgetValues = policy?.deterministicBudgets?.values ?? {};
  const requiredBudgetKeys = [
    "OPTIMIZER_MAX_BEAM_EXPANSIONS",
    "OPTIMIZER_BEAM_WATCHDOG_MS",
    "OPTIMIZER_MAX_MASTER_NODES",
    "OPTIMIZER_MASTER_WATCHDOG_MS",
    "OPTIMIZER_MAX_RESCUE_ATTEMPTS",
    "OPTIMIZER_RESCUE_WATCHDOG_MS",
  ];
  const budgetsReady = policy?.deterministicBudgets?.status === "RESOLVED" &&
    requiredBudgetKeys.every((key) => Number.isSafeInteger(budgetValues[key]) && budgetValues[key] > 0);

  const supportedPredicates = new Set(policy?.correctnessPredicate?.supportedRunnerPredicates ?? []);
  const predicateId = policy?.correctnessPredicate?.id ?? null;
  const predicateReady = policy?.correctnessPredicate?.status === "RESOLVED" && supportedPredicates.has(predicateId);
  const formalReady = traceabilityComplete && runtimeMatchesCandidate && budgetsReady && predicateReady && policy?.formalCertificationReady === true;

  const blockingReasons = [];
  if (!traceabilityComplete) blockingReasons.push("traceability preflight failed");
  if (!runtimeMatchesCandidate) blockingReasons.push("runtime differs from Kernel V1 candidate");
  if (!budgetsReady) blockingReasons.push("production deterministic budgets/watchdogs are not calibrated and versioned");
  if (!predicateReady) blockingReasons.push("formal correctness predicate is not resolved and versioned");
  if (budgetsReady && predicateReady && policy?.formalCertificationReady !== true) {
    blockingReasons.push("policy formalCertificationReady is not true");
  }

  const preflightReport = {
    schemaVersion: "kernel-v1-formal-certification-preflight-v1",
    generatedAt: new Date().toISOString(),
    kernelCandidate: KERNEL_CANDIDATE,
    status: formalReady ? "READY_FOR_FORMAL_CERTIFICATION" : traceabilityComplete && runtimeMatchesCandidate
      ? "TRACEABILITY_COMPLETE_FORMAL_POLICY_BLOCKED"
      : "BLOCKED",
    traceabilityComplete,
    runtimeMatchesCandidate,
    traceabilityChecks,
    cohort: {
      records: cohort.records.length,
      distinctXml: cohort.identities.length,
      identitySetSha256: cohort.identitySetSha256,
      mixedBoardExcluded: cohort.mixedFiles.length,
    },
    policy: {
      deterministicBudgetsReady: budgetsReady,
      correctnessPredicateReady: predicateReady,
      correctnessPredicateId: predicateId,
      formalCertificationReady: formalReady,
      blockingReasons,
    },
    executionContract: {
      strategy: "v10",
      freshProcessPerCase: true,
      checkpointPerCase: true,
      calibrationBudgets: "OFF",
      experimentalFlags: "OFF",
      determinismComparison: "same exact input + same deterministic budgets => same recovered fullPlanHash",
      watchdogRule: "zero watchdog hits in formal correctness and determinism-repeat passes",
    },
  };

  return {
    policy, traceability, reconciliation, audit, canonical, cohort,
    traceabilityComplete, runtimeMatchesCandidate, budgetsReady, predicateReady, formalReady,
    blockingReasons, preflightReport,
  };
}

function deriveExactCohort(canonical, audit) {
  const restoRecords = canonical.filter((record) => partitionKey(normalizePath(record?.source_path)) === "resto");
  const restoIdentities = [...new Set(restoRecords.map(recordIdentity).filter(Boolean))].sort(cmp);
  const mixedEntries = audit?.currentParser?.rejections?.filter((entry) => entry.code === "mixed-board-formats") ?? [];
  if (mixedEntries.length !== 13) fail(`expected 13 mixed-board audit entries, got ${mixedEntries.length}`);

  const mixedFiles = mixedEntries.map((entry) => {
    const matches = restoIdentities.filter((file) => auditStemMatches(xmlStem(file), String(entry.stem)));
    if (matches.length !== 1) fail(`mixed-board stem ${entry.stem} resolved to ${matches.length} embedded identities`);
    return matches[0];
  }).sort(cmp);
  const mixedSet = new Set(mixedFiles);
  const records = restoRecords.filter((record) => !mixedSet.has(recordIdentity(record)));
  const identities = [...new Set(records.map(recordIdentity).filter(Boolean))].sort(cmp);
  const identitySetSha256 = hashList(identities);
  return { records, identities, identitySetSha256, mixedFiles };
}

async function buildOptimizerBundle(outDir) {
  const { build } = await import("esbuild");
  const bundle = join(outDir, "kernel-v1-candidate.mjs");
  const anchor = pathToFileURL(join(REPO, "src/lib/optimizer/engine/legacy-engine.ts")).href;
  await build({
    entryPoints: [join(REPO, "src/lib/optimizer/index.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    outfile: bundle,
    define: { "import.meta.url": JSON.stringify(anchor) },
    logLevel: "warning",
  });
  return bundle;
}

async function runCalibration({ state, outDir, bundle, maxNew, timeoutMs }) {
  const checkpoint = join(outDir, "calibration.partial.jsonl");
  const summaryPath = join(outDir, "calibration.summary.json");
  const previous = readJsonl(checkpoint);
  const done = new Set(previous.filter((row) => row.ok).map((row) => row.file));
  const timingHints = readHistoricalTimingHints();
  const ordered = orderCalibration(state.cohort.records, timingHints, state.policy?.execution?.knownExtremeTailOrders ?? []);
  const remaining = ordered.filter((record) => !done.has(recordIdentity(record)));
  const pending = maxNew == null ? remaining : remaining.slice(0, maxNew);
  const env = cleanOptimizerEnv();
  env.OPTIMIZER_V10_STAGED_EXPERIMENTAL = "0";
  env.OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL = "0";
  env.OPTIMIZER_STEP0_TELEMETRY = "1";

  for (const canonical of pending) {
    const file = recordIdentity(canonical);
    const payload = await runCase({ bundle, canonical, env, timeoutMs, outDir, label: "calibration" });
    const row = {
      phase: "calibration",
      file,
      referencePanels: finiteOrNull(canonical?.reference_panels),
      pieceQuantity: pieceQuantity(canonical),
      historicalEngineMs: timingHints.get(file) ?? null,
      ...payload,
    };
    appendFileSync(checkpoint, JSON.stringify(row) + "\n", "utf8");
    if (!row.ok || !row.validationOk || row.cacheHit || row.pieces !== row.expectedPieces) {
      writeCalibrationSummary(summaryPath, checkpoint, ordered.length, timingHints);
      fail(`calibration stopped on ${file}: invalid/non-complete/non-fresh result`);
    }
    writeCalibrationSummary(summaryPath, checkpoint, ordered.length, timingHints);
    console.log(JSON.stringify({ phase: "calibration", file, wallMs: row.wallMs, completed: readJsonl(checkpoint).filter((r) => r.ok).length, total: ordered.length }));
  }
  writeCalibrationSummary(summaryPath, checkpoint, ordered.length, timingHints);
}

async function runCorrectness({ state, outDir, bundle, maxNew, timeoutMs }) {
  const checkpoint = join(outDir, "correctness.partial.jsonl");
  const summaryPath = join(outDir, "correctness.summary.json");
  const previous = readJsonl(checkpoint);
  const done = new Set(previous.filter((row) => row.ok).map((row) => row.file));
  const calibration = readJsonl(join(outDir, "calibration.partial.jsonl"));
  const calibrationMs = new Map(calibration.filter((row) => row.ok).map((row) => [row.file, row.wallMs]));
  const ordered = [...state.cohort.records].sort((a, b) => {
    const am = calibrationMs.get(recordIdentity(a));
    const bm = calibrationMs.get(recordIdentity(b));
    if (Number.isFinite(am) && Number.isFinite(bm)) return am - bm || cmp(recordIdentity(a), recordIdentity(b));
    if (Number.isFinite(am)) return -1;
    if (Number.isFinite(bm)) return 1;
    return pieceQuantity(a) - pieceQuantity(b) || cmp(recordIdentity(a), recordIdentity(b));
  });
  const remaining = ordered.filter((record) => !done.has(recordIdentity(record)));
  const pending = maxNew == null ? remaining : remaining.slice(0, maxNew);
  const env = formalEnv(state.policy);
  const predicateId = state.policy.correctnessPredicate.id;

  for (const canonical of pending) {
    const file = recordIdentity(canonical);
    const payload = await runCase({ bundle, canonical, env, timeoutMs, outDir, label: "correctness" });
    const referencePanels = finiteOrNull(canonical?.reference_panels);
    const failures = mechanicalFailures(payload);
    failures.push(...predicateFailures(predicateId, payload, referencePanels));
    const row = {
      phase: "correctness",
      file,
      referencePanels,
      predicateId,
      ...payload,
      failures,
      pass: failures.length === 0,
    };
    appendFileSync(checkpoint, JSON.stringify(row) + "\n", "utf8");
    writePassSummary(summaryPath, checkpoint, EXPECTED_CASES, "correctness");
    if (!row.pass) fail(`formal correctness stopped on ${file}: ${failures.join(", ")}`);
    console.log(JSON.stringify({ phase: "correctness", file, boards: row.boards, wallMs: row.wallMs, completed: readJsonl(checkpoint).filter((r) => r.pass).length, total: EXPECTED_CASES }));
  }
  writePassSummary(summaryPath, checkpoint, EXPECTED_CASES, "correctness");
}

async function runDeterminism({ state, outDir, bundle, maxNew, timeoutMs }) {
  const correctnessPath = join(outDir, "correctness.partial.jsonl");
  const correctness = readJsonl(correctnessPath);
  const good = correctness.filter((row) => row.pass);
  const uniqueGood = new Map(good.map((row) => [row.file, row]));
  if (uniqueGood.size !== EXPECTED_CASES) {
    fail(`determinism requires a complete green correctness pass (${uniqueGood.size}/${EXPECTED_CASES})`);
  }

  const checkpoint = join(outDir, "determinism.partial.jsonl");
  const summaryPath = join(outDir, "determinism.summary.json");
  const previous = readJsonl(checkpoint);
  const done = new Set(previous.filter((row) => row.pass).map((row) => row.file));
  const byFile = new Map(state.cohort.records.map((record) => [recordIdentity(record), record]));
  const orderedBaseline = [...uniqueGood.values()].sort((a, b) => a.wallMs - b.wallMs || cmp(a.file, b.file));
  const remaining = orderedBaseline.filter((row) => !done.has(row.file));
  const pending = maxNew == null ? remaining : remaining.slice(0, maxNew);
  const env = formalEnv(state.policy);

  for (const baseline of pending) {
    const canonical = byFile.get(baseline.file);
    if (!canonical) fail(`cohort record not found for ${baseline.file}`);
    const payload = await runCase({ bundle, canonical, env, timeoutMs, outDir, label: "determinism" });
    const failures = mechanicalFailures(payload);
    if (payload.fullPlanHash !== baseline.fullPlanHash) failures.push("fullPlanHash");
    const row = {
      phase: "determinism-repeat",
      file: baseline.file,
      baselineFullPlanHash: baseline.fullPlanHash,
      baselineWallMs: baseline.wallMs,
      ...payload,
      failures,
      pass: failures.length === 0,
    };
    appendFileSync(checkpoint, JSON.stringify(row) + "\n", "utf8");
    writeDeterminismSummary(summaryPath, checkpoint, orderedBaseline);
    if (!row.pass) fail(`determinism stopped on ${baseline.file}: ${failures.join(", ")}`);
    console.log(JSON.stringify({ phase: "determinism-repeat", file: row.file, wallMs: row.wallMs, fullPlanHash: row.fullPlanHash, completed: readJsonl(checkpoint).filter((r) => r.pass).length, total: EXPECTED_CASES }));
  }
  writeDeterminismSummary(summaryPath, checkpoint, orderedBaseline);
}

async function runCase({ bundle, canonical, env, timeoutMs, outDir, label }) {
  const tmpDir = join(outDir, ".cases");
  mkdirSync(tmpDir, { recursive: true });
  const id = createHash("sha256").update(`${label}\0${recordIdentity(canonical)}`).digest("hex").slice(0, 16);
  const inputPath = join(tmpDir, `${id}.json`);
  const resultPath = join(tmpDir, `${id}.result.json`);
  writeFileSync(inputPath, JSON.stringify(canonical) + "\n");
  return new Promise((resolvePromise, reject) => {
    const child = fork(SCRIPT, ["--child", bundle, "--case-json", inputPath, "--result", resultPath], {
      env,
      stdio: ["ignore", "ignore", "inherit", "ipc"],
    });
    let record = null;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.on("message", (message) => { record = message; });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (timedOut) reject(new Error(`external operational watchdog after ${timeoutMs}ms; case remains incomplete`));
      else if (code !== 0 || !record) reject(new Error(`fresh worker failed with code ${code}`));
      else resolvePromise(record);
    });
  });
}

async function childRun(args) {
  const bundle = resolve(args.child);
  const casePath = resolve(args["case-json"]);
  const resultPath = resolve(args.result);
  const optimizer = await import(pathToFileURL(bundle).href);
  const canonical = readJson(casePath);
  const input = optimizer.benchmarkInputFromCanonicalCase(canonical, { strategy: "v10" });
  const cpuStart = process.cpuUsage();
  const started = performance.now();
  const result = optimizer.optimizeProject(input);
  const wallMs = performance.now() - started;
  const cpu = process.cpuUsage(cpuStart);
  const { engineMs, cacheHit, ...quality } = result.metrics;
  const geometry = geometryOnly({
    boards: result.boards,
    placements: result.placements,
    cuts: result.cuts,
    remnants: result.remnants,
    trees: result.raw.placas.map((board) => board.arbol),
  });
  const traces = result.placements.map((placement) => placement.trace);
  const fullPlan = { geometry, traces, quality };
  const step0 = result.raw?.metricasV10?.step0 ?? null;
  const watchdogHits = Number(step0?.beam?.watchdogHits ?? 0) + Number(step0?.master?.watchdogHits ?? 0) + Number(step0?.oneboard?.watchdogHits ?? 0);
  const record = {
    ok: true,
    wallMs,
    cpuMs: (cpu.user + cpu.system) / 1000,
    engineMs,
    cacheHit: Boolean(cacheHit),
    boards: quality.boardCount,
    pieces: result.placements.length,
    expectedPieces: quality.expectedPieceCount,
    validationOk: Boolean(result.validation?.ok),
    missingTraces: traces.filter((trace) => !Array.isArray(trace) || trace.length === 0).length,
    traceSteps: traces.reduce((sum, trace) => sum + (Array.isArray(trace) ? trace.length : 0), 0),
    fullPlanHash: hash(fullPlan),
    geometryHash: hash(geometry),
    traceHash: hash(traces),
    watchdogHits,
    step0,
  };
  writeJson(resultPath, record);
  if (process.send) process.send(record);
}

function mechanicalFailures(row) {
  const failures = [];
  if (!row.ok) failures.push("worker");
  if (!row.validationOk) failures.push("validation");
  if (row.cacheHit) failures.push("cache-hit");
  if (row.pieces !== row.expectedPieces) failures.push("piece-count");
  if (row.watchdogHits !== 0) failures.push("watchdog-hit");
  return failures;
}

function predicateFailures(id, row, referencePanels) {
  if (id === "VALID_AND_COMPLETE_ONLY") return [];
  if (id === "VALID_COMPLETE_AND_BOARDS_LE_REFERENCE") {
    if (!Number.isFinite(referencePanels)) return ["reference-panels-missing"];
    return row.boards <= referencePanels ? [] : ["boards-worse-than-reference"];
  }
  if (id === "EXACT_REFERENCE_BOARDS") {
    if (!Number.isFinite(referencePanels)) return ["reference-panels-missing"];
    return row.boards === referencePanels ? [] : ["boards-not-exact-reference"];
  }
  return ["unsupported-correctness-predicate"];
}

function formalEnv(policy) {
  const env = cleanOptimizerEnv();
  env.OPTIMIZER_V10_STAGED_EXPERIMENTAL = "0";
  env.OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL = "0";
  env.OPTIMIZER_STEP0_TELEMETRY = "1";
  for (const [key, value] of Object.entries(policy.deterministicBudgets.values)) {
    if (!Number.isSafeInteger(value) || value <= 0) fail(`invalid formal budget ${key}`);
    env[key] = String(value);
  }
  return env;
}

function cleanOptimizerEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("OPTIMIZER_")) delete env[key];
  return env;
}

function orderCalibration(records, timingHints, tailOrders) {
  const tails = new Set(tailOrders.map(String));
  return [...records].sort((a, b) => {
    const af = recordIdentity(a), bf = recordIdentity(b);
    const at = [...tails].some((order) => af.includes(order));
    const bt = [...tails].some((order) => bf.includes(order));
    if (at !== bt) return at ? 1 : -1;
    const ap = pieceQuantity(a), bp = pieceQuantity(b);
    if (ap !== bp) return ap - bp;
    const ah = timingHints.get(af), bh = timingHints.get(bf);
    if (Number.isFinite(ah) && Number.isFinite(bh) && ah !== bh) return ah - bh;
    if (Number.isFinite(ah) !== Number.isFinite(bh)) return Number.isFinite(ah) ? -1 : 1;
    return cmp(af, bf);
  });
}

function readHistoricalTimingHints() {
  const map = new Map();
  if (!existsSync(HOTSPOT_PATH)) return map;
  for (const line of readFileSync(HOTSPOT_PATH, "utf8").split(/\r?\n/).filter(Boolean)) {
    const row = JSON.parse(line);
    if (row.ok === false || row.engineCacheHit) continue;
    if (typeof row.file === "string" && Number.isFinite(row.engineMs)) map.set(row.file, Number(row.engineMs));
  }
  return map;
}

function writeCalibrationSummary(path, checkpoint, totalCases, timingHints) {
  const rows = readJsonl(checkpoint).filter((row) => row.ok);
  const historicalTotal = [...timingHints.values()].reduce((sum, value) => sum + value, 0);
  const historicalCompleted = rows.reduce((sum, row) => sum + (timingHints.get(row.file) ?? 0), 0);
  writeJson(path, {
    schemaVersion: "kernel-v1-calibration-summary-v1",
    updatedAt: new Date().toISOString(),
    completedCases: new Set(rows.map((row) => row.file)).size,
    totalCases,
    caseCoveragePct: pct(new Set(rows.map((row) => row.file)).size, totalCases),
    completedMeasuredWallMs: rows.reduce((sum, row) => sum + Number(row.wallMs || 0), 0),
    historicalHotspotTimingMass: {
      scopeCases: timingHints.size,
      completedMs: historicalCompleted,
      totalMs: historicalTotal,
      coveragePct: pct(historicalCompleted, historicalTotal),
      note: "This percentage is scoped only to the historical hotspot timing hints, not to all 8,650 cases."
    },
    status: new Set(rows.map((row) => row.file)).size === totalCases ? "COMPLETE" : "PARTIAL",
  });
}

function writePassSummary(path, checkpoint, totalCases, phase) {
  const rows = readJsonl(checkpoint);
  const passed = rows.filter((row) => row.pass);
  const unique = new Set(passed.map((row) => row.file));
  writeJson(path, {
    schemaVersion: `kernel-v1-${phase}-summary-v1`,
    updatedAt: new Date().toISOString(),
    phase,
    completedCases: unique.size,
    totalCases,
    caseCoveragePct: pct(unique.size, totalCases),
    completedWallMs: passed.reduce((sum, row) => sum + Number(row.wallMs || 0), 0),
    status: unique.size === totalCases ? "PASS" : "PARTIAL",
  });
}

function writeDeterminismSummary(path, checkpoint, baselineRows) {
  const rows = readJsonl(checkpoint).filter((row) => row.pass);
  const done = new Set(rows.map((row) => row.file));
  const totalTimeMass = baselineRows.reduce((sum, row) => sum + Number(row.wallMs || 0), 0);
  const completedTimeMass = baselineRows.reduce((sum, row) => sum + (done.has(row.file) ? Number(row.wallMs || 0) : 0), 0);
  writeJson(path, {
    schemaVersion: "kernel-v1-determinism-summary-v1",
    updatedAt: new Date().toISOString(),
    completedCases: done.size,
    totalCases: baselineRows.length,
    caseCoveragePct: pct(done.size, baselineRows.length),
    correctnessTimeMassCoveredMs: completedTimeMass,
    correctnessTimeMassTotalMs: totalTimeMass,
    timeMassCoveragePct: pct(completedTimeMass, totalTimeMass),
    status: done.size === baselineRows.length ? "PASS" : "PARTIAL",
  });
}

function partitionKey(source) {
  if (!source) return "";
  const marker = "/xml_experience/";
  const lower = source.toLowerCase();
  const idx = lower.indexOf(marker);
  const parent = dirname(source).replace(/\\/g, "/");
  if (idx < 0) return parent;
  const relativePath = source.slice(idx + marker.length);
  const segments = relativePath.split("/").filter(Boolean);
  segments.pop();
  return segments.length ? segments.join("/") : ".";
}

function auditStemMatches(fileStem, auditStem) {
  if (fileStem === auditStem) return true;
  if (!/^\d+$/.test(auditStem)) return false;
  return fileStem.startsWith(`${auditStem}__`) || fileStem.startsWith(`${auditStem}_`);
}

function recordIdentity(record) {
  const source = normalizePath(record?.source_path);
  const name = basename(source);
  return /\.xml$/i.test(name) ? name : "";
}

function pieceQuantity(record) {
  return Array.isArray(record?.pieces) ? record.pieces.reduce((sum, piece) => sum + Number(piece?.quantity ?? 0), 0) : 0;
}

function normalizePath(value) { return typeof value === "string" ? value.trim().replace(/\\/g, "/") : ""; }
function xmlStem(file) { return file.replace(/\.xml$/i, ""); }
function finiteOrNull(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function pct(value, total) { return total > 0 ? Number((100 * value / total).toFixed(4)) : 0; }

function geometryOnly(value) {
  if (Array.isArray(value)) return value.map(geometryOnly);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !["trace", "_diagLink", "_diagPath"].includes(key))
    .map(([key, child]) => [key, geometryOnly(child)]));
  return value;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

function hash(value) { return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex"); }
function hashList(values) {
  const sorted = [...new Set(values)].sort(cmp);
  return createHash("sha256").update(sorted.join("\n") + (sorted.length ? "\n" : "")).digest("hex");
}

function readJson(path) { return JSON.parse(readFileSync(path, "utf8")); }
function writeJson(path, value) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(value, null, 2) + "\n"); }
function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}
function relative(path) { return path.startsWith(REPO) ? path.slice(REPO.length + 1).replace(/\\/g, "/") : path.replace(/\\/g, "/"); }
function positiveInt(value, label) { const n = Number(value); if (!Number.isSafeInteger(n) || n <= 0) fail(`${label} must be a positive integer`); return n; }
function fail(message) { throw new Error(message); }

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) { out._.push(token); continue; }
    const key = token.slice(2);
    if (key === "require-ready") { out[key] = true; continue; }
    const value = argv[++i];
    if (value == null) fail(`missing value for --${key}`);
    out[key] = value;
  }
  return out;
}

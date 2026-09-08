#!/usr/bin/env node
import { createHash } from "node:crypto";
import { fork, spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT = fileURLToPath(import.meta.url);
const REPO = resolve(dirname(SCRIPT), "../..");
const KERNEL_CANDIDATE = "4063963260abb10c8d68d0e553942899c925cc2f";
const EXECUTION_BINDING_ID = "physical-xml-historical-validity-v1";
const CORRECTNESS_PREDICATE = "HISTORICAL_VALIDITY_V1";
const EXPECTED_ACCEPTED_HASH = "36d005421ae79b01867e0bba377c1bf526801bcd4dcfa2b0180e12cf354458f3";
const FREEZE_DIR = join(REPO, "research/optimizer/freeze");
const POLICY_PATH = join(FREEZE_DIR, "KERNEL_V1_FORMAL_CERTIFICATION_POLICY.json");
const AUDIT_PATH = join(FREEZE_DIR, "KERNEL_V1_RESTO_ARCHIVE_AUDIT_2026-09-07.json");
const SEMANTICS_PATH = join(FREEZE_DIR, "KERNEL_V1_CORRECTNESS_EXECUTION_SEMANTICS.json");
const EMBEDDED_PATH = join(REPO, "experiencia/canonical_cases.json");
const HISTORICAL_CSV_PATH = join(REPO, "benchmark_project_v10.csv");
const BUDGET_KEYS = [
  "OPTIMIZER_MAX_BEAM_EXPANSIONS",
  "OPTIMIZER_BEAM_WATCHDOG_MS",
  "OPTIMIZER_MAX_MASTER_NODES",
  "OPTIMIZER_MASTER_WATCHDOG_MS",
  "OPTIMIZER_MAX_RESCUE_ATTEMPTS",
  "OPTIMIZER_RESCUE_WATCHDOG_MS",
];

const args = parseArgs(process.argv.slice(2));
if (args.child) await childRun(args);
else await main(args);

async function main(args) {
  const corpus = resolve(String(args.corpus ?? ""));
  const historicalCorpus = resolve(String(args.historicalCorpus ?? ""));
  if (!args.corpus || !existsSync(corpus)) fail("--corpus <extracted-resto> required");
  if (!args.historicalCorpus || !existsSync(historicalCorpus)) fail("--historicalCorpus <extracted-parte1> required");

  const out = resolve(args.out ?? join(REPO, "test-results/kernel-v1-formal-certification"));
  mkdirSync(out, { recursive: true });
  const maxNew = args.maxNew == null ? Infinity : nonNegativeInt(args.maxNew, "--maxNew");
  const timeoutMs = args.timeout == null ? 7_200_000 : positiveInt(args.timeout, "--timeout");

  const policy = readJson(POLICY_PATH);
  const values = policy?.deterministicBudgets?.values ?? {};
  if (policy?.kernelCandidate !== KERNEL_CANDIDATE) fail("policy kernel candidate drift");
  if (policy?.correctnessPredicate?.id !== CORRECTNESS_PREDICATE) fail("historical correctness predicate not resolved");
  if (policy?.deterministicBudgets?.status !== "RESOLVED") fail("production deterministic budgets are not RESOLVED");
  if (BUDGET_KEYS.some((key) => !Number.isSafeInteger(Number(values[key])) || Number(values[key]) <= 0)) {
    fail("six positive integer deterministicBudgets.values are required");
  }
  if (policy?.formalCertificationReady !== true) fail("formalCertificationReady must be true before formal correctness");

  const runtimeMatchesCandidate = spawnSync("git", ["diff", "--quiet", KERNEL_CANDIDATE, "--", "src/lib/optimizer"], { cwd: REPO }).status === 0;
  if (!runtimeMatchesCandidate) fail("runtime differs from frozen Kernel V1 candidate");

  const preflight = spawnSync(process.execPath, [
    join(REPO, "scripts/kernel-freeze/formal-certification-v3.mjs"),
    "preflight",
    "--report", join(out, "formal-certification-preflight-runtime.json"),
  ], { cwd: REPO, encoding: "utf8" });
  if (preflight.status !== 0) fail(`formal static preflight failed: ${preflight.stderr || preflight.stdout}`);
  const formalPreflight = readJson(join(out, "formal-certification-preflight-runtime.json"));
  if (formalPreflight?.status !== "READY_FOR_FORMAL_CERTIFICATION") {
    fail(`formal preflight not ready: ${formalPreflight?.status ?? "missing"}`);
  }

  const cachePath = resolve(args.preflightCache ?? join(out, "preflight-state-cache-v4.json"));
  if (!existsSync(cachePath)) {
    fail(`missing ${cachePath}; create it once with kernel-budget-calibration-v4.mjs --validateCandidateBudgets --maxNew 0`);
  }
  const cache = readJson(cachePath);
  const cacheKey = computePreflightCacheKey({ corpus, historicalCorpus });
  if (
    cache?.schemaVersion !== "kernel-v1-preflight-state-cache-v4" ||
    cache?.cacheKey !== cacheKey ||
    cache?.kernelCandidate !== KERNEL_CANDIDATE ||
    cache?.executionBindingId !== EXECUTION_BINDING_ID
  ) fail("preflight cache does not match current corpora/candidate/execution binding");

  const state = cache.state;
  if (!state || !Array.isArray(state.feasible) || !Array.isArray(state.infeasible)) fail("preflight cache state missing");
  if (state.feasible.length !== 8168 || state.infeasible.length !== 482) {
    fail(`physical feasibility split drift ${state.feasible.length}/${state.infeasible.length}, expected 8168/482`);
  }
  const acceptedIds = [...state.feasible, ...state.infeasible].map((item) => item.file).sort(cmp);
  if (acceptedIds.length !== 8650 || hashList(acceptedIds) !== EXPECTED_ACCEPTED_HASH) fail("accepted formal cohort identity drift");

  writeJson(join(out, "formal-correctness-v1.expected-infeasible.json"), {
    schemaVersion: "kernel-v1-formal-correctness-expected-infeasible-v1",
    generatedAt: new Date().toISOString(),
    predicate: CORRECTNESS_PREDICATE,
    executionBindingId: EXECUTION_BINDING_ID,
    count: state.infeasible.length,
    cases: state.infeasible.map((item) => ({
      file: item.file,
      format: item.format,
      referencePanels: item.referencePanels ?? null,
      impossible: item.impossible ?? [],
    })),
  });

  const bundle = await buildBundle(out);
  const env = formalEnv(values);
  const calibrationHints = readCalibrationHints(join(out, "calibration-v4.partial.jsonl"));
  const tails = new Set((policy?.execution?.knownExtremeTailOrders ?? []).map(String));
  const isTail = (file) => [...tails].some((order) => String(file).includes(order));
  const ordered = [...state.feasible].sort((a, b) => {
    const at = isTail(a.file), bt = isTail(b.file);
    if (at !== bt) return at ? 1 : -1;
    const ah = calibrationHints.get(a.file), bh = calibrationHints.get(b.file);
    if (Number.isFinite(ah) && Number.isFinite(bh) && ah !== bh) return ah - bh;
    if (Number.isFinite(ah) !== Number.isFinite(bh)) return Number.isFinite(ah) ? -1 : 1;
    const aq = quantity(a.case), bq = quantity(b.case);
    return aq - bq || cmp(a.file, b.file);
  });

  const checkpoint = join(out, "formal-correctness-v1.partial.jsonl");
  const prior = uniqueLatest(readJsonl(checkpoint));
  const priorFailure = prior.find((row) => row.pass !== true);
  if (priorFailure) fail(`existing formal correctness failure must be resolved before continuing: ${priorFailure.file}`);
  const done = new Set(prior.filter((row) => row.pass === true).map((row) => row.file));

  let added = 0;
  for (const item of ordered) {
    if (done.has(item.file) || added >= maxNew) continue;
    const result = await runCase({ bundle, item, env, timeoutMs, out });
    const beamAccounting = beamAccountingStatus(result.step0);
    const beamFallback = classifyBeamFallback(result.stderrTail);
    const beamFallbackAccepted = !beamFallback.present || (beamFallback.controlled && beamAccounting.ok);
    const watchdogHits = {
      beam: Number(result.step0?.beam?.watchdogHits ?? 0),
      master: Number(result.step0?.master?.watchdogHits ?? 0),
      oneboard: Number(result.step0?.oneboard?.watchdogHits ?? 0),
    };
    const budgetHits = {
      beam: Number(result.step0?.beam?.budgetHits ?? 0),
      master: Number(result.step0?.master?.budgetHits ?? 0),
      oneboard: Number(result.step0?.oneboard?.budgetHits ?? 0),
    };
    const zeroWatchdogHits = Object.values(watchdogHits).every((value) => value === 0);
    const pass = Boolean(
      result.ok &&
      result.validationOk &&
      !result.cacheHit &&
      result.pieces === result.expectedPieces &&
      result.demandMultisetOk &&
      beamAccounting.ok &&
      beamFallbackAccepted &&
      zeroWatchdogHits &&
      typeof result.fullPlanHash === "string" && result.fullPlanHash.length === 64
    );
    const row = {
      phase: "formal-correctness",
      executionBindingId: EXECUTION_BINDING_ID,
      correctnessPredicate: CORRECTNESS_PREDICATE,
      file: item.file,
      format: item.format,
      referencePanels: item.referencePanels ?? null,
      productionBudgets: values,
      ...result,
      beamAccounting,
      beamFallback,
      beamFallbackAccepted,
      watchdogHits,
      budgetHits,
      zeroWatchdogHits,
      pass,
    };
    appendFileSync(checkpoint, JSON.stringify(row) + "\n", "utf8");
    added++;
    writeSummary(checkpoint, state, values, out, runtimeMatchesCandidate);
    console.log(JSON.stringify({
      phase: "formal-correctness",
      file: item.file,
      pass,
      boards: result.boards,
      wallMs: Math.round(result.wallMs),
      fullPlanHash: result.fullPlanHash,
      budgetHits,
      watchdogHits,
    }));
    if (!pass) fail(`formal correctness failed: ${item.file}`);
  }

  writeSummary(checkpoint, state, values, out, runtimeMatchesCandidate);
}

async function childRun(args) {
  const optimizer = await import(pathToFileURL(resolve(args.child)).href);
  const canonical = readJson(resolve(args["case-json"]));
  const input = optimizer.benchmarkInputFromCanonicalCase(canonical, { strategy: "v10" });
  const cpuStart = process.cpuUsage();
  const started = performance.now();
  const result = optimizer.optimizeProject(input);
  const wallMs = performance.now() - started;
  const cpu = process.cpuUsage(cpuStart);
  const demand = compareDemand(canonical, result.placements);
  const { engineMs, cacheHit, ...quality } = result.metrics;
  const geometry = geometryOnly({
    boards: result.boards,
    placements: result.placements,
    cuts: result.cuts,
    remnants: result.remnants,
    trees: result.raw?.placas?.map((board) => board.arbol) ?? [],
  });
  const traces = result.placements.map((placement) => placement.trace ?? []);
  const fullPlan = { geometry, traces, quality };
  const record = {
    ok: true,
    wallMs,
    cpuMs: (cpu.user + cpu.system) / 1000,
    engineMs,
    profile: result.profile,
    cacheHit: Boolean(cacheHit),
    boards: quality.boardCount,
    pieces: result.placements.length,
    expectedPieces: quality.expectedPieceCount,
    validationOk: Boolean(result.validation?.ok),
    demandMultisetOk: demand.ok,
    demandMultiset: demand,
    step0: result.raw?.metricasV10?.step0 ?? null,
    geometryHash: hash(geometry),
    traceHash: hash(traces),
    traceSteps: traces.reduce((sum, trace) => sum + trace.length, 0),
    missingTraces: traces.filter((trace) => trace.length === 0).length,
    fullPlanHash: hash(fullPlan),
  };
  process.send?.(record);
}

async function buildBundle(out) {
  const { build } = await import("esbuild");
  const file = join(out, "kernel-v1-formal-candidate.mjs");
  const anchor = pathToFileURL(join(REPO, "src/lib/optimizer/engine/legacy-engine.ts")).href;
  await build({
    entryPoints: [join(REPO, "src/lib/optimizer/index.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    outfile: file,
    define: { "import.meta.url": JSON.stringify(anchor) },
    logLevel: "warning",
  });
  return file;
}

async function runCase({ bundle, item, env, timeoutMs, out }) {
  const processStarted = performance.now();
  const dir = join(out, ".formal-cases-v1");
  mkdirSync(dir, { recursive: true });
  const id = sha256(`${EXECUTION_BINDING_ID}\0formal-correctness\0${item.file}`).slice(0, 16);
  const inputPath = join(dir, `${id}.json`);
  writeJson(inputPath, item.case);
  return new Promise((resolvePromise, rejectPromise) => {
    const child = fork(SCRIPT, ["--child", bundle, "--case-json", inputPath], {
      env,
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    let record = null;
    let timedOut = false;
    let stderrTail = "";
    child.stderr?.on("data", (chunk) => { stderrTail = (stderrTail + String(chunk)).slice(-16000); });
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    child.on("message", (message) => { record = message; });
    child.on("error", (error) => { clearTimeout(timer); rejectPromise(error); });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (timedOut) rejectPromise(new Error(`operational watchdog ${timeoutMs}ms`));
      else if (code !== 0 || !record) rejectPromise(new Error(`formal worker failed: ${code}`));
      else {
        const processWallMs = performance.now() - processStarted;
        resolvePromise({
          ...record,
          processWallMs,
          freshProcessOverheadMs: Math.max(0, processWallMs - Number(record.wallMs ?? 0)),
          stderrTail: stderrTail.trim() || null,
        });
      }
    });
  });
}

function writeSummary(checkpoint, state, values, out, runtimeMatchesCandidate) {
  const rows = uniqueLatest(readJsonl(checkpoint));
  const failures = rows.filter((row) => row.pass !== true);
  const passes = rows.filter((row) => row.pass === true);
  const feasibleTotal = state.feasible.length;
  const expectedInfeasible = state.infeasible.length;
  const classifiedAccepted = expectedInfeasible + passes.length;
  const watchdogHits = sumControls(rows, "watchdogHits");
  const budgetHits = sumControls(rows, "budgetHits");
  const status = failures.length ? "FAIL" : passes.length === feasibleTotal ? "PASS" : "RUNNING";
  const report = {
    schemaVersion: "kernel-v1-formal-correctness-v1",
    updatedAt: new Date().toISOString(),
    status,
    kernelCandidate: KERNEL_CANDIDATE,
    runtimeMatchesCandidate,
    correctnessPredicate: CORRECTNESS_PREDICATE,
    executionBindingId: EXECUTION_BINDING_ID,
    productionBudgets: values,
    acceptedCases: feasibleTotal + expectedInfeasible,
    expectedInfeasibleCases: expectedInfeasible,
    feasibleCases: feasibleTotal,
    feasibleCompletedPass: passes.length,
    failures: failures.map((row) => ({ file: row.file, watchdogHits: row.watchdogHits, budgetHits: row.budgetHits })),
    classifiedAcceptedCases: classifiedAccepted,
    coveragePct: Number((100 * classifiedAccepted / (feasibleTotal + expectedInfeasible)).toFixed(4)),
    fullPlanHashesRecorded: passes.filter((row) => typeof row.fullPlanHash === "string" && row.fullPlanHash.length === 64).length,
    watchdogHits,
    budgetHits,
    zeroWatchdogHits: Object.values(watchdogHits).every((value) => value === 0),
    nextGate: status === "PASS" ? "FORMAL_DETERMINISM_REPEAT" : "FORMAL_CORRECTNESS",
  };
  writeJson(join(out, "formal-correctness-v1.summary.json"), report);
}

function formalEnv(values) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("OPTIMIZER_")) delete env[key];
  env.OPTIMIZER_V10_STAGED_EXPERIMENTAL = "0";
  env.OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL = "0";
  env.OPTIMIZER_STEP0_TELEMETRY = "1";
  for (const key of BUDGET_KEYS) env[key] = String(values[key]);
  return env;
}

function computePreflightCacheKey({ corpus, historicalCorpus }) {
  const payload = {
    schema: "kernel-v1-preflight-cache-key-v1",
    kernelCandidate: KERNEL_CANDIDATE,
    executionBindingId: EXECUTION_BINDING_ID,
    restoCorpusSha256: hashXmlDirectory(corpus),
    parte1CorpusSha256: hashXmlDirectory(historicalCorpus),
    auditSha256: sha256(readFileSync(AUDIT_PATH)),
    semanticsSha256: sha256(readFileSync(SEMANTICS_PATH)),
    embeddedSha256: sha256(readFileSync(EMBEDDED_PATH)),
    historicalCsvSha256: sha256(readFileSync(HISTORICAL_CSV_PATH)),
  };
  return sha256(JSON.stringify(payload));
}

function hashXmlDirectory(dir) {
  const h = createHash("sha256");
  const names = readdirSync(dir).filter((name) => name.toLowerCase().endsWith(".xml")).sort(cmp);
  for (const name of names) {
    h.update(name); h.update("\0"); h.update(readFileSync(join(dir, name))); h.update("\0");
  }
  return h.digest("hex");
}

function compareDemand(canonical, placements) {
  const expected = new Map(), actual = new Map();
  for (const piece of canonical.pieces ?? []) {
    const key = terminalDimensionKey(piece.width, piece.height);
    expected.set(key, (expected.get(key) ?? 0) + Number(piece.quantity ?? 0));
  }
  for (const placement of placements ?? []) {
    const key = terminalDimensionKey(placement.width, placement.height);
    actual.set(key, (actual.get(key) ?? 0) + 1);
  }
  const keys = [...new Set([...expected.keys(), ...actual.keys()])].sort(cmp);
  const differences = keys.map((key) => ({ key, expected: expected.get(key) ?? 0, actual: actual.get(key) ?? 0 }))
    .filter((entry) => entry.expected !== entry.actual);
  return { semantics: "historical-terminal-dimensions-min-max-v1", ok: differences.length === 0, differences };
}

function beamAccountingStatus(step0) {
  const calls = Number(step0?.beam?.calls ?? 0);
  const expansions = Number(step0?.beam?.expansionsTotal ?? 0);
  const timeoutHits = Number(step0?.beam?.timeoutHits ?? 0);
  const budgetHits = Number(step0?.beam?.budgetHits ?? 0);
  const watchdogHits = Number(step0?.beam?.watchdogHits ?? 0);
  const terminalEvidence = expansions > 0 || timeoutHits > 0 || budgetHits > 0 || watchdogHits > 0;
  return {
    ok: calls === 0 || terminalEvidence,
    calls, expansions, timeoutHits, budgetHits, watchdogHits,
    reason: calls === 0 ? "beam-not-called" : terminalEvidence ? "beam-work-or-terminal-control-recorded" : "beam-called-without-work-or-terminal-control",
  };
}

function classifyBeamFallback(stderrTail) {
  const text = String(stderrTail ?? "");
  const present = /Beam Search falló, se usa greedy:/i.test(text);
  if (!present) return { present: false, controlled: false, classification: "NONE" };
  const controlled = /Beam Search falló, se usa greedy:[\s\S]*No se pudo completar el plan con Beam Search/i.test(text);
  return { present: true, controlled, classification: controlled ? "CONTROLLED_NO_COMPLETE_BEAM_PLAN" : "UNEXPECTED_BEAM_EXCEPTION" };
}

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

function hash(value) { return sha256(JSON.stringify(stable(value))); }
function terminalDimensionKey(a, b) { const x = Number(a), y = Number(b); return `${num(Math.min(x, y))}x${num(Math.max(x, y))}`; }
function num(value) { const n = Number(value); return Number.isFinite(n) ? String(Math.round(n * 1e6) / 1e6) : String(value); }
function quantity(canonical) { return (canonical?.pieces ?? []).reduce((sum, piece) => sum + Number(piece.quantity ?? 0), 0); }
function readCalibrationHints(path) {
  const hints = new Map();
  for (const row of readJsonl(path)) if (row?.pass === true && typeof row.file === "string" && Number.isFinite(Number(row.wallMs))) hints.set(row.file, Number(row.wallMs));
  return hints;
}
function sumControls(rows, field) {
  return {
    beam: rows.reduce((sum, row) => sum + Number(row?.[field]?.beam ?? 0), 0),
    master: rows.reduce((sum, row) => sum + Number(row?.[field]?.master ?? 0), 0),
    oneboard: rows.reduce((sum, row) => sum + Number(row?.[field]?.oneboard ?? 0), 0),
  };
}
function hashList(values) { return sha256([...new Set(values)].sort(cmp).join("\n") + "\n"); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function readJson(path) { return JSON.parse(readFileSync(path, "utf8")); }
function writeJson(path, value) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8"); }
function readJsonl(path) { if (!existsSync(path)) return []; return readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse); }
function uniqueLatest(rows) { return [...new Map(rows.map((row) => [row.file, row])).values()]; }
function cmp(a, b) { return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0; }
function positiveInt(value, label) { const n = Number(value); if (!Number.isSafeInteger(n) || n <= 0) fail(`${label} must be a positive integer`); return n; }
function nonNegativeInt(value, label) { const n = Number(value); if (!Number.isSafeInteger(n) || n < 0) fail(`${label} must be a non-negative integer`); return n; }
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

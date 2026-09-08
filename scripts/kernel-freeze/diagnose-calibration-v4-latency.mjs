#!/usr/bin/env node
import { createHash } from "node:crypto";
import { fork } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT = fileURLToPath(import.meta.url);
const REPO = resolve(dirname(SCRIPT), "../..");
const EXECUTION_BINDING_ID = "physical-xml-historical-validity-v1";
const TELEMETRY_CONTRACT_ID = "step0-work-telemetry-v2";

const args = parseArgs(process.argv.slice(2));
if (args.child) await childRun(args);
else await main(args);

async function main(args) {
  const out = resolve(args.out ?? join(REPO, "test-results/kernel-v1-formal-certification"));
  const checkpoint = resolve(args.checkpoint ?? join(out, "calibration-v4.partial.jsonl"));
  if (!existsSync(checkpoint)) fail(`missing checkpoint: ${checkpoint}`);

  const top = args.top == null ? 8 : positiveInt(args.top, "--top");
  const minWallMs = args.minWallMs == null ? 5_000 : nonNegativeNumber(args.minWallMs, "--minWallMs");
  const rows = uniqueLatest(readJsonl(checkpoint))
    .filter((row) => row.pass === true)
    .filter((row) => row.executionBindingId === EXECUTION_BINDING_ID && row.telemetryContractId === TELEMETRY_CONTRACT_ID)
    .filter((row) => Number(row.staticAreaLowerBound ?? 0) === 1)
    .filter((row) => Number(row.wallMs ?? 0) >= minWallMs)
    .sort((a, b) => Number(b.wallMs ?? 0) - Number(a.wallMs ?? 0))
    .slice(0, top);

  if (!rows.length) fail(`no completed areaLB=1 rows at or above ${minWallMs}ms`);

  mkdirSync(out, { recursive: true });
  const bundle = await buildBundle(out);
  const env = calibrationEnv();
  const casesDir = join(out, ".cases-v4");
  const diagnostics = [];

  for (const row of rows) {
    const id = sha256(`${EXECUTION_BINDING_ID}\0calibration-v4\0${row.file}`).slice(0, 16);
    const casePath = join(casesDir, `${id}.json`);
    if (!existsSync(casePath)) fail(`missing cached canonical case for ${row.file}: ${casePath}`);
    const resultPath = join(casesDir, `${id}.latency-v4.result.json`);
    const result = await runChild({ bundle, casePath, resultPath, env });
    diagnostics.push({
      file: row.file,
      originalCalibrationWallMs: Number(row.wallMs ?? 0),
      staticAreaLowerBound: Number(row.staticAreaLowerBound ?? 0),
      referencePanels: row.referencePanels ?? null,
      rerun: result,
    });
    console.log(JSON.stringify({
      file: row.file,
      originalWallMs: row.wallMs,
      rerunWallMs: result.wallMs,
      dominantStage: result.v10Timings?.dominantMeasuredStage,
      v10Timings: result.v10Timings,
      beamWallMsTotal: result.nestedWork?.beamWallMsTotal,
    }));
  }

  const report = {
    schemaVersion: "kernel-v1-calibration-v4-latency-diagnostic-v1",
    generatedAt: new Date().toISOString(),
    executionBindingId: EXECUTION_BINDING_ID,
    telemetryContractId: TELEMETRY_CONTRACT_ID,
    selection: {
      source: checkpoint,
      rule: "successful calibration-v4 rows with staticAreaLowerBound==1, ordered by observed wallMs descending",
      top,
      minWallMs,
      selected: diagnostics.length,
    },
    interpretation: {
      additiveStages: "v10Timings module ms fields are mutually additive at the V10 orchestration level; residualV10Ms is total.ms minus those explicitly timed modules.",
      residualWarning: "residualV10Ms is not synonymous with baseline only; it also includes untimed orchestration/validation and nested composition work. nestedWork Beam/composition counters help explain it without double-counting.",
      purpose: "Locate user-visible latency in small areaLB=1 orders without changing Kernel V1 search semantics or calibration ordering.",
    },
    cases: diagnostics,
  };
  writeJson(join(out, "latency-diagnostics-v4.json"), report);
}

async function buildBundle(out) {
  const { build } = await import("esbuild");
  const file = join(out, "kernel-v1-latency-diagnostic-v4.mjs");
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

function runChild({ bundle, casePath, resultPath, env }) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = fork(SCRIPT, ["--child", bundle, "--case-json", casePath, "--result", resultPath], {
      env,
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    let record = null;
    let stderrTail = "";
    child.stderr?.on("data", (chunk) => { stderrTail = (stderrTail + String(chunk)).slice(-16000); });
    child.on("message", (message) => { record = message; });
    child.on("error", rejectPromise);
    child.on("exit", (code) => {
      if (code !== 0 || !record) rejectPromise(new Error(`latency diagnostic worker exited ${code}; stderr=${stderrTail}`));
      else resolvePromise({ ...record, stderrTail: stderrTail.trim() || null });
    });
  });
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
  const metrics = result.raw?.metricasV10 ?? {};
  const step0 = metrics?.step0 ?? {};
  const record = {
    ok: Boolean(result.validation?.ok),
    wallMs,
    cpuMs: (cpu.user + cpu.system) / 1000,
    engineMs: result.metrics.engineMs,
    profile: result.profile,
    boards: result.metrics.boardCount,
    pieces: result.placements.length,
    v10Timings: extractV10Timings(metrics),
    nestedWork: {
      optimizarCalls: Number(step0?.composition?.optimizarCalls ?? 0),
      armarPlacasCalls: Number(step0?.composition?.armarPlacasCalls ?? 0),
      stageCalls: Number(step0?.composition?.stageCalls ?? 0),
      beamCalls: Number(step0?.beam?.calls ?? 0),
      beamExpansionsTotal: Number(step0?.beam?.expansionsTotal ?? 0),
      beamWallMsTotal: Number(step0?.beam?.wallMsTotal ?? 0),
      beamWallMsMax: Number(step0?.beam?.wallMsMax ?? 0),
      oneboardAttemptsTotal: Number(step0?.oneboard?.attemptsTotal ?? 0),
      oneboardWallMsTotal: Number(step0?.oneboard?.wallMsTotal ?? 0),
      masterNodesTotal: Number(step0?.master?.nodesTotal ?? 0),
      masterWallMsTotal: Number(step0?.master?.wallMsTotal ?? 0),
    },
  };
  writeJson(resolve(args.result), record);
  process.send?.(record);
}

function extractV10Timings(metrics) {
  const totalMs = n(metrics?.total?.ms);
  const stages = {
    oneboardMs: n(metrics?.oneboard?.ms),
    masterMs: n(metrics?.master?.ms),
    multisliceMs: n(metrics?.multislice?.ms),
    compactacionMs: n(metrics?.compactacion?.ms),
    lowerBoundCheapMs: n(metrics?.lowerBound?.cheapMs),
    remnantPolishMs: n(metrics?.remnantPolish?.ms),
  };
  const explicitlyTimedMs = Object.values(stages).reduce((sum, value) => sum + value, 0);
  const residualV10Ms = Math.max(0, totalMs - explicitlyTimedMs);
  const candidates = { ...stages, residualV10Ms };
  const dominantMeasuredStage = Object.entries(candidates).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "none";
  return {
    totalMs,
    ...stages,
    explicitlyTimedMs,
    residualV10Ms,
    dominantMeasuredStage,
    activations: {
      oneboard: n(metrics?.oneboard?.activaciones),
      master: n(metrics?.master?.activaciones),
      multislice: n(metrics?.multislice?.activaciones),
      compactacion: n(metrics?.compactacion?.activaciones),
    },
    gains: {
      oneboard: n(metrics?.oneboard?.ganancias),
      master: n(metrics?.master?.ganancias),
      multislice: n(metrics?.multislice?.ganancias),
      compactacion: n(metrics?.compactacion?.ganancias),
    },
  };
}

function calibrationEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("OPTIMIZER_")) delete env[key];
  env.OPTIMIZER_V10_STAGED_EXPERIMENTAL = "0";
  env.OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL = "0";
  env.OPTIMIZER_STEP0_TELEMETRY = "1";
  return env;
}

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
function readJson(path) { return JSON.parse(readFileSync(path, "utf8")); }
function readJsonl(path) { return readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse); }
function uniqueLatest(rows) { return [...new Map(rows.map((row) => [row.file, row])).values()]; }
function writeJson(path, value) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8"); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function n(value) { const x = Number(value); return Number.isFinite(x) ? x : 0; }
function positiveInt(value, label) { const x = Number(value); if (!Number.isSafeInteger(x) || x <= 0) fail(`${label} must be a positive integer`); return x; }
function nonNegativeNumber(value, label) { const x = Number(value); if (!Number.isFinite(x) || x < 0) fail(`${label} must be a non-negative number`); return x; }
function fail(message) { throw new Error(message); }

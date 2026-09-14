import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { digest } from "../canonical.mjs";
import { ROOT, verifyH2, fileHash } from "./identity.mjs";
import { serialize, poolEvidence, finalEvidence } from "./evidence.mjs";
import { installAdapter } from "./adapter.mjs";
import { createCpuMeter } from "./cpu-meter.mjs";
const request = JSON.parse(readFileSync(process.argv[2], "utf8"));
const { job, bundle, resultPath, eventsPath, expectedIdentity, budgets } = request;
const failures = [], pools = [], phaseCPU = {};
const started = process.hrtime.bigint(), initialCPU = process.cpuUsage();
const pilot = request.experimentMode === "h4-pilot";
const meter = createCpuMeter(), pendingPools = [];
let measuredCost = null;
let bridge, adapter;
function failure(code, detail) {
  const entry = { code, detail }; failures.push(entry);
  appendFileSync(eventsPath, JSON.stringify(entry) + "\n"); // survives V10 catch or a later crash
}
function measure(phase, fn) {
  if (pilot) return meter.measure(phase, fn);
  const cpu = process.cpuUsage();
  try { return fn(); } finally {
    const elapsed = process.cpuUsage(cpu);
    phaseCPU[phase] = (phaseCPU[phase] ?? 0) + elapsed.user + elapsed.system;
  }
}
try {
  for (const name of Object.keys(process.env)) if (name.startsWith("OPTIMIZER_")) delete process.env[name];
  for (const [name, value] of Object.entries(budgets)) process.env[name] = String(value);
  const identity = verifyH2();
  if (digest(identity) !== digest(expectedIdentity)) throw new Error("source identity drift before child run");
  if (fileHash(bundle) !== request.bundleHash) throw new Error("bundle identity mismatch");
  if (fileHash(request.xmlReader) !== request.xmlReaderHash) throw new Error("XML reader identity mismatch");
  if (job.fault === "crash") process.exit(7);
  if (job.fault === "hang") await new Promise(() => setInterval(() => {}, 1000));
  if (job.fault === "late-load") createRequire(import.meta.url)(join(ROOT, "src/lib/optimizer/legacy/v10.cjs"));
  const observer = { measure, failure, pool(pool, lines, config, stage) {
    if (pilot) { pendingPools.push({ pool, lines, config, stage }); return; }
    const evidence = measure("validation", () => poolEvidence(pool, lines, config, bridge));
    pools.push({ stage, ...evidence });
    if (evidence.invalid.length) failure("INVALID_POOL", { stage, invalid: evidence.invalid });
  } };
  adapter = installAdapter(job, observer);
  bridge = { ...await import(pathToFileURL(bundle).href), ...await import(pathToFileURL(request.xmlReader).href) };
  if (pilot && job.arm === "B" && !job.nativeB0) {
    if (fileHash(request.observedB0) !== request.observedB0Hash) throw new Error("observed B0 bundle mismatch");
    observer.b0 = await import(pathToFileURL(request.observedB0).href);
    observer.b0.setObserver(measure);
  }
  let result = null, generatedPool = null;
  const pipelineStarted = process.hrtime.bigint();
  try { result = pilot ? measure("pipelineOther", () => bridge.optimizeProject(job.input)) : bridge.optimizeProject(job.input); }
  catch (error) { if (error !== adapter.captureOnly) throw error; }
  if (pilot) {
    const snapshot = meter.snapshot(), e = snapshot.exclusive, i = snapshot.inclusive;
    measuredCost = { units: "process CPU microseconds", patternGenCPU: (e.generation ?? 0) + (e.monotype ?? 0),
      materializationCPU: e.materialization ?? 0, masterCPU: e.master ?? 0,
      totalCPU: i.pipelineOther, otherCPU: e.pipelineOther,
      poolProductionCPU: (i.generation ?? 0) + (i.monotype ?? 0),
      b0MaterializationCPU: (i.generation ?? 0) - (e.generation ?? 0),
      monotypeCPU: e.monotype ?? 0, phaseCPUus: snapshot,
      wallMs: Number(process.hrtime.bigint() - pipelineStarted) / 1e6,
      peakMemory: { value: process.resourceUsage().maxRSS, unit: "KiB",
        scope: "process RSS high-water from process start through optimizer return, before harness validation" },
      heapAtOptimizerReturn: process.memoryUsage(),
      totalScope: "optimizeProject including its validation, fallback and coarse observers; excludes module load and deferred harness validation",
      generationScope: "A includes fused geometry construction and monotype; B excludes separately observed materializePattern",
      masterMaterializationScope: "materializar after coverage selection; included in materializationCPU",
      coldProcess: true, detailedKernelTelemetry: false };
    for (const { pool, lines, config, stage } of pendingPools) {
      const evidence = measure("validation", () => poolEvidence(pool, lines, config, bridge));
      pools.push({ stage, ...evidence });
      if (evidence.invalid.length) failure("INVALID_POOL", { stage, invalid: evidence.invalid });
    }
  }
  if (!adapter.probe.captured) throw new Error("facade did not bind V10 inputs");
  if (job.mode === "generation-only") {
    const pool = adapter.generateOnly();
    const { lines, config } = adapter.probe.captured;
    generatedPool = measure("validation", () => poolEvidence(pool, lines, config, bridge));
    if (generatedPool.invalid.length) failure("INVALID_POOL", { stage: "combined", invalid: generatedPool.invalid });
  } else generatedPool = pools.findLast((p) => p.stage === "master") ?? null;
  const final = result ? measure("validation", () => finalEvidence(result, bridge, adapter.probe.captured.lines)) : null;
  if (final && !final.ok) failure("INVALID_FINAL", { validation: final.validation, xmlDemandOk: final.xmlDemandOk,
    tracesOk: final.tracesOk, xmlPhysical: final.xmlPhysical, exportUnchanged: final.exportUnchanged });
  const candidates = adapter.probe.candidates.filter(Boolean).map((plan) => measure("validation", () => bridge.validateIndependentSlices(plan)));
  candidates.forEach((validation, index) => { if (!validation.ok) failure("INVALID_MATERIALIZED_CANDIDATE", { index, validation }); });
  if (adapter.probe.legacyPackingDuringB) failure("HIDDEN_LEGACY_PACKING", adapter.probe.legacyPackingDuringB);
  if (digest(verifyH2()) !== digest(identity)) throw new Error("source identity drift during child run");
  const cpu = process.cpuUsage(initialCPU);
  const evidence = { schemaVersion: 1, jobId: job.id, arm: job.arm, mode: job.mode, inputHash: digest(job.input), identity,
    executionStatus: "COMPLETE", q1: failures.length ? "FAIL" : "PASS", failures,
    generatorExercised: generatedPool !== null, masterActivated: adapter.probe.masterCalls > 0,
    probe: serialize(adapter.probe), pools, generatedPool, final,
    ...(pilot ? { measurement: measuredCost } : {}),
    cost: { diagnosticOnly: true, totalCPUus: cpu.user + cpu.system, phaseCPUus: phaseCPU,
      generationIncludesB0Materialization: job.arm === "B", masterMaterializationCPUus: phaseCPU.materialization ?? 0,
      wallMs: Number(process.hrtime.bigint() - started) / 1e6, maxRSSKiB: process.resourceUsage().maxRSS } };
  writeFileSync(resultPath, JSON.stringify(evidence), { flag: "wx" });
} catch (error) {
  failure("OPERATIONAL_ABORT", String(error.stack ?? error));
  writeFileSync(resultPath, JSON.stringify({ schemaVersion: 1, jobId: job.id, inputHash: digest(job.input),
    executionStatus: "OPERATIONAL_ABORT", q1: "FAIL", failures, probe: serialize(adapter?.probe ?? null), pools }), { flag: "wx" });
}

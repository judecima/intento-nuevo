import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { platform, release, arch, cpus, totalmem } from "node:os";
import { digest } from "../canonical.mjs";
import { ROOT, EXPERIMENT, verifyH2, fileHash, kernelBudgets } from "./identity.mjs";
import { integrationReport } from "./report.mjs";
import { pilotReport } from "./pilot-report.mjs";
import { buildObservedB0 } from "./b0-observer.mjs";
const SCRIPT = fileURLToPath(import.meta.url);
const json = (path, data) => writeFileSync(path, JSON.stringify(data, null, 2) + "\n", { flag: "wx" });
export function validateManifest(manifest) {
  if (manifest.schemaVersion !== 1 || !["h3", "h4-pilot"].includes(manifest.mode) || !Array.isArray(manifest.jobs) || !manifest.jobs.length) throw new Error("H3 manifest or bounded H4 pilot required; scored not enabled");
  if (manifest.mode === "h4-pilot") {
    const policy = JSON.parse(readFileSync(join(EXPERIMENT, "H4_4057401_POLICY.json"), "utf8"));
    if (digest(manifest.policy) !== digest(policy) || manifest.jobs.length !== 8 || manifest.source?.file !== policy.file ||
      fileHash(manifest.source.path) !== manifest.source.sha256 || new Set(manifest.jobs.map((j) => digest(j.input))).size !== 1 ||
      digest(manifest.jobs[0].input) !== manifest.source.inputHash) throw new Error("H4 policy/source/input drift");
    const expected = ["A-direct", "B", "A-adapter", "B", "B", "A-adapter", "A-adapter", "B"];
    manifest.jobs.forEach((job, i) => {
      if (job.arm !== expected[i] || job.mode !== "end-to-end" || job.fault || Boolean(job.control) !== (i < 2) ||
        Boolean(job.nativeB0) !== (i === 1) || job.watchdogMs !== policy.watchdogMs ||
        (job.arm === "B" && (digest(job.generatorBudget) !== digest(policy.generatorBudget) ||
          job.maxVariantsPerUsageVector !== policy.maxVariantsPerUsageVector))) throw new Error("H4 execution policy drift");
    });
  }
  const ids = new Set();
  for (const job of manifest.jobs) {
    if (!/^[a-z0-9_-]+$/.test(job.id) || ids.has(job.id)) throw new Error("invalid/duplicate job id");
    ids.add(job.id);
    if (!["A-direct", "A-adapter", "B"].includes(job.arm) || !["end-to-end", "generation-only"].includes(job.mode)) throw new Error("invalid arm/mode");
    if (job.input?.strategy !== "v10" || job.input?.constraints?.profile !== "balanced") throw new Error("H3 requires balanced V10 input");
    if (job.fault && !["throw-generator", "invalid-pattern", "late-load", "crash", "hang"].includes(job.fault)) throw new Error("unknown control fault");
    if (job.fault && !job.control) throw new Error("fault injection requires an explicit control label");
    if (!Number.isSafeInteger(job.watchdogMs) || job.watchdogMs < 1) throw new Error("operational watchdog required");
    if (job.arm === "B" && (!Number.isSafeInteger(job.maxVariantsPerUsageVector) || job.maxVariantsPerUsageVector < 1 ||
      !job.generatorBudget || ["maxExpansions", "maxAndCombinations", "maxFrontierEntries", "maxMaterializations"].some((key) => !Number.isSafeInteger(job.generatorBudget[key]) || job.generatorBudget[key] <= 0))) throw new Error("invalid B work budget");
  }
  return manifest;
}
export async function runH3(manifest, out) {
  validateManifest(manifest);
  out = resolve(out);
  if (existsSync(out)) throw new Error("output already exists; H3 never overwrites or skips previous failures");
  const identity = verifyH2(), budgets = kernelBudgets();
  mkdirSync(out, { recursive: true });
  json(join(out, "manifest.json"), { ...manifest, identity, kernelBudgets: budgets, profile: "balanced", strategy: "v10",
    legacySeed: 7, rounds: 40, experimentalFlags: "OFF", concurrency: 1, manifestHash: digest(manifest) });
  json(join(out, "environment.json"), { node: process.version, platform: platform(), release: release(), arch: arch(),
    cpus: cpus().map(({ model, speed }) => ({ model, speed })), totalMemoryBytes: totalmem() });
  const bundle = join(out, "optimizer.mjs");
  const xmlReader = join(out, "xml-reader.mjs");
  const observedB0 = join(out, "b0-observed.mjs");
  try {
    const { build } = await import("esbuild");
    await build({ entryPoints: [join(ROOT, "src/lib/optimizer/index.ts")], bundle: true, platform: "node", format: "esm", target: "node22",
      outfile: bundle, define: { "import.meta.url": JSON.stringify(pathToFileURL(join(ROOT, "src/lib/optimizer/engine/legacy-engine.ts")).href) }, logLevel: "silent" });
    const readerSource = join(ROOT, "tests/optimizer/helpers/b0-xml-roundtrip.ts");
    await build({ entryPoints: [readerSource], bundle: true, platform: "node", format: "esm", target: "node22",
      outfile: xmlReader, define: { "import.meta.url": JSON.stringify(pathToFileURL(readerSource).href) }, logLevel: "silent" });
    if (manifest.mode === "h4-pilot") {
      const built = await buildObservedB0(observedB0);
      json(join(out, "b0-observed-metafile.json"), built.metafile);
    }
  } catch (error) { json(join(out, "setup-abort.json"), { executionStatus: "OPERATIONAL_ABORT", error: String(error.stack ?? error) }); throw error; }
  const results = [];
  for (const job of manifest.jobs) {
    const dir = join(out, job.id); mkdirSync(dir);
    const requestPath = join(dir, "request.json"), resultPath = join(dir, "result.json"), eventsPath = join(dir, "events.jsonl");
    json(requestPath, { job, experimentMode: manifest.mode, bundle, bundleHash: fileHash(bundle), xmlReader, xmlReaderHash: fileHash(xmlReader),
      ...(manifest.mode === "h4-pilot" ? { observedB0, observedB0Hash: fileHash(observedB0) } : {}),
      resultPath, eventsPath, expectedIdentity: identity, budgets });
    const operational = await new Promise((done) => {
      const flags = manifest.mode === "h4-pilot" ? [`--max-old-space-size=${manifest.policy.maxOldSpaceSizeMiB}`] : [];
      const child = spawn(process.execPath, [...flags, join(EXPERIMENT, "harness/child.mjs"), requestPath], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "", expired = false, spawnError = null;
      child.stderr?.on("data", (data) => { stderr = (stderr + data).slice(-16000); });
      const timer = setTimeout(() => { expired = true; child.kill(); }, job.watchdogMs);
      child.on("error", (error) => { spawnError = String(error); });
      child.on("close", (code, signal) => { clearTimeout(timer); done({ code, signal, expired, spawnError, stderr }); });
    });
    let record;
    try {
      if (operational.expired || operational.spawnError || operational.code !== 0) throw new Error(operational.expired ? "operational watchdog expired" : "child failed");
      record = JSON.parse(readFileSync(resultPath, "utf8"));
      if (record.jobId !== job.id || record.inputHash !== digest(job.input)) throw new Error("child result identity mismatch");
    } catch (error) {
      const events = existsSync(eventsPath) ? readFileSync(eventsPath, "utf8").trim().split("\n").filter(Boolean).map((line) => {
        try { return JSON.parse(line); } catch { return { code: "UNREADABLE_EVENT", detail: line }; }
      }) : [];
      record = { jobId: job.id, arm: job.arm, mode: job.mode, inputHash: digest(job.input), executionStatus: "OPERATIONAL_ABORT",
        q1: "FAIL", failures: [...events, { code: "CHILD_ABORT", detail: String(error) }] };
      // Preserve any child artifact, including a partial write; parent evidence is separate.
      json(join(dir, "parent-abort.json"), { ...record, operational });
    }
    record.operational = operational;
    const summary = { jobId: job.id, arm: job.arm, mode: job.mode, control: job.control ?? false,
      executionStatus: record.executionStatus, q1: record.q1, failures: record.failures, operational,
      generatorExercised: record.generatorExercised ?? false, masterActivated: record.masterActivated ?? false,
      fullPlanHash: record.final?.fullPlanHash ?? null, patternPoolHash: record.generatedPool?.patternPoolHash ?? null,
      orderedPoolHash: record.generatedPool?.orderedPoolHash ?? null,
      artifact: job.id + (existsSync(join(dir, "parent-abort.json")) ? "/parent-abort.json" : "/result.json") };
    json(join(dir, "completion.json"), summary);
    appendFileSync(join(out, "cases.jsonl"), JSON.stringify(summary) + "\n");
    results.push(record);
    if (manifest.mode === "h4-pilot") console.log(JSON.stringify({ jobId: job.id, status: record.executionStatus,
      q1: record.q1, boards: record.final?.boardCount, generator: record.probe?.generatorResults?.map((g) => g.status) }));
  }
  if (digest(verifyH2()) !== digest(identity)) throw new Error("source changed during H3 run");
  const report = manifest.mode === "h4-pilot" ? pilotReport(manifest, results) : integrationReport(manifest, results);
  json(join(out, manifest.mode === "h4-pilot" ? "pilot-report.json" : "integration-report.json"), report);
  json(join(out, "summary.json"), { jobs: results.length, completed: results.filter((r) => r.executionStatus === "COMPLETE").length,
    q1FailuresIncludingControls: results.filter((r) => r.q1 !== "PASS").length, h2Unchanged: true, kernelUnchanged: true,
    q1FailuresExcludingControls: results.filter((r, i) => !manifest.jobs[i].control && r.q1 !== "PASS").length,
    q2: manifest.mode === "h4-pilot" ? report.q2 : "NOT_EVALUATED", q3: manifest.mode === "h4-pilot" ? report.q3.status : "DIAGNOSTIC_ONLY",
    scored: false, note: "Bounded experiment only; all failed attempts remain in the evidence." });
  return { out, results, report };
}
if (process.argv[1] && resolve(process.argv[1]) === SCRIPT) {
  const [manifestPath, out] = process.argv.slice(2);
  if (!manifestPath || !out) throw new Error("usage: node harness/run.mjs <h3-manifest.json> <new-output-directory>");
  const result = await runH3(JSON.parse(readFileSync(resolve(manifestPath), "utf8")), out);
  console.log(JSON.stringify({ out: result.out, jobs: result.results.length }));
  if (result.report.status !== "PASS") process.exitCode = 1;
}

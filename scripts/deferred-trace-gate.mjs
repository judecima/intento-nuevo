import { build } from "esbuild";
import { createHash } from "node:crypto";
import { execFileSync, fork } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { cpus } from "node:os";
import { parseArgs } from "node:util";

// Fresh processes prevent facade/module caches from contaminating the A/B.
// Usage: node scripts/deferred-trace-gate.mjs --candidate node_modules/.cache/deferred-trace-review
// Optional: --case 4050594 --out test-results/deferred-trace-check
const script = fileURLToPath(import.meta.url);
const repo = resolve(dirname(script), "..");
const { values: args } = parseArgs({ options: {
  candidate: { type: "string" }, case: { type: "string" },
  sentinels: { type: "boolean", default: false },
  "candidate-first": { type: "boolean", default: false },
  corpus: { type: "string", default: "D:/proyectos asistidos/lepton/data/lepton-xml" },
  out: { type: "string", default: "test-results/deferred-trace-gate" },
  child: { type: "string" }, input: { type: "string" }, result: { type: "string" },
  timeout: { type: "string", default: "1800000" },
} });

if (args.child) {
  const optimizer = await import(pathToFileURL(args.child).href);
  const input = JSON.parse(readFileSync(args.input, "utf8"));
  const cpuStart = process.cpuUsage();
  const started = performance.now();
  const result = optimizer.optimizeProject(input);
  const wallMs = performance.now() - started;
  const cpu = process.cpuUsage(cpuStart);
  const { engineMs, cacheHit, ...quality } = result.metrics;
  const geometry = geometryOnly({
    boards: result.boards, placements: result.placements,
    cuts: result.cuts, remnants: result.remnants,
    trees: result.raw.placas.map((board) => board.arbol),
  });
  const traces = result.placements.map((placement) => placement.trace);
  const fullPlan = { geometry, traces, quality };
  const record = {
    wallMs, cpuMs: (cpu.user + cpu.system) / 1000,
    engineMs, cacheHit, boards: quality.boardCount,
    pieces: result.placements.length, expectedPieces: quality.expectedPieceCount,
    validationOk: result.validation.ok, validation: result.validation,
    missingTraces: traces.filter((trace) => trace.length === 0).length,
    traceSteps: traces.reduce((sum, trace) => sum + trace.length, 0),
    geometryHash: hash(geometry), traceHash: hash(traces), fullPlanHash: hash(fullPlan),
    master: result.raw.metricasV10?.master ?? null,
    quality,
    areaLowerBound: Math.ceil(input.pieces.reduce((sum, piece) => sum + piece.quantity * piece.width * piece.height, 0)
      / ((input.board.width - input.trim.x) * (input.board.height - input.trim.y)) - 1e-9),
    engineLowerBound: result.raw.cotaV10 ?? null,
  };
  writeFileSync(args.result, JSON.stringify({ record, fullPlan }, null, 2) + "\n");
  process.send(record);
} else {
  if (!args.candidate) throw new Error("--candidate is required");
  const timeout = Number(args.timeout);
  if (!Number.isSafeInteger(timeout) || timeout <= 0) throw new Error("invalid timeout");
  const candidate = resolve(args.candidate);
  const out = resolve(args.out);
  if (existsSync(out)) throw new Error("Output already exists; use a new --out directory");
  const rows = readFileSync(join(repo, "experiencia/v6/hotspot-all.jsonl"), "utf8")
    .split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
    .filter((row) => row.ok !== false && !row.engineCacheHit);
  if (rows.length !== 213 || new Set(rows.map((row) => row.file)).size !== 213) {
    throw new Error("Frozen cohort must contain 213 unique non-cache cases");
  }
  // Exercise the known Master winner before spending hours on non-winning cases.
  rows.sort((a, b) => Number(b.metricas?.master?.ganancias > 0) - Number(a.metricas?.master?.ganancias > 0));
  if (args.case && args.sentinels) throw new Error("Choose --case or --sentinels");
  const sentinelBoards = { "4050594": 7, "4056900": 6, "4057401": 4, "4058501": 8, "4059200": 17 };
  const corpusNames = readdirSync(args.corpus).filter((name) => name.endsWith(".xml"));
  const sentinelRows = () => Object.entries(sentinelBoards).map(([order, boards]) => {
    const names = corpusNames.filter((name) => name.startsWith(`${order}__`));
    if (names.length !== 1) throw new Error(`Expected one XML for sentinel ${order}, got ${names.length}`);
    return { file: names[0], boards: rows.find((row) => row.file === names[0])?.boards ?? null, expectedBoards: boards };
  });
  const selected = args.sentinels ? sentinelRows() : args.case
    ? rows.filter((row) => row.file.includes(args.case)) : rows;
  if (!selected.length) throw new Error("No matching case");
  mkdirSync(out, { recursive: true });
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("OPTIMIZER_")) delete env[key];
  env.OPTIMIZER_V10_STAGED_EXPERIMENTAL = "0";
  env.OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL = "0";
  const bundles = {};
  const sources = {};
  for (const [mode, root] of [["baseline", repo], ["candidate", candidate]]) {
    bundles[mode] = join(out, `${mode}.mjs`);
    await build({
      entryPoints: [join(root, "src/lib/optimizer/index.ts")],
      bundle: true, platform: "node", format: "esm", target: "node22",
      outfile: bundles[mode], logLevel: "warning",
      define: { "import.meta.url": JSON.stringify(pathToFileURL(join(root, "src/lib/optimizer/engine/legacy-engine.ts")).href) },
    });
    sources[mode] = {
      root, commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
      workingTreeChanges: execFileSync("git", ["status", "--short", "--", "src/lib/optimizer"], { cwd: root, encoding: "utf8" }).trim(),
      bundleHash: hash(readFileSync(bundles[mode], "utf8")),
      runtimeFiles: Object.fromEntries([
        "motor", "patrones", "cobertura", "materializar", "v10", "oneboard", "validador_industrial_v3",
      ].map((name) => [name, hash(readFileSync(join(root, `src/lib/optimizer/legacy/${name}.cjs`), "utf8"))])),
    };
  }
  const baseline = await import(pathToFileURL(bundles.baseline).href);
  const report = {
    createdAt: new Date().toISOString(), node: process.version, cpu: cpus()[0]?.model,
    command: process.argv, sources, corpus: resolve(args.corpus), env: {
      staged: false, cheapPostBaseline: false,
    }, cohortSize: rows.length, selected: selected.length,
    scope: args.sentinels ? "master-sentinels" : args.case ? "hotspot-subset" : "hotspot-213",
    executionOrder: args["candidate-first"] ? ["candidate", "baseline"] : ["baseline", "candidate"],
    status: "RUNNING", completed: 0, records: [],
    protocol: "Serial fresh-process A/B; no cache; exact full-plan/geometry/trace equality; fail fast. Timings are descriptive single runs.",
  };
  const save = () => writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
  save();
  for (const row of selected) {
    const canonical = baseline.parseCanonicalXml(readFileSync(join(args.corpus, row.file), "utf8"), { fileName: row.file });
    const input = baseline.benchmarkInputFromCanonicalCase(canonical.case, { strategy: "v10" });
    const id = String(report.records.length + 1).padStart(3, "0");
    const inputFile = join(out, `${id}-input.json`);
    writeFileSync(inputFile, JSON.stringify(input, null, 2) + "\n");
    const order = row.file.split("__")[0];
    const entry = { file: row.file, inputHash: hash(input), historicalBoards: row.boards, expectedBoards: row.expectedBoards ?? null };
    report.records.push(entry);
    try {
      for (const mode of report.executionOrder) {
        console.log(`${id} ${mode} ${row.file}`);
        entry[mode] = await runChild(bundles[mode], inputFile, join(out, `${id}-${mode}-plan.json`), env, timeout);
        save();
        console.log(JSON.stringify({ mode, ...entry[mode], validation: undefined, quality: undefined }));
      }
      const a = entry.baseline, b = entry.candidate;
      entry.failures = [];
      for (const field of ["boards", "geometryHash", "traceHash", "traceSteps", "fullPlanHash"]) {
        if (a[field] !== b[field]) entry.failures.push(field);
      }
      for (const [mode, record] of [["baseline", a], ["candidate", b]]) {
        if (!record.validationOk) entry.failures.push(`${mode}:invalid`);
        if (record.cacheHit) entry.failures.push(`${mode}:cache-hit`);
        if (record.pieces !== record.expectedPieces) entry.failures.push(`${mode}:piece-count`);
        if (record.missingTraces) entry.failures.push(`${mode}:missing-traces`);
        if (row.expectedBoards !== undefined && record.boards !== row.expectedBoards) entry.failures.push(`${mode}:sentinel-boards`);
        if (order === "4050594") {
          if (record.boards !== 7 || record.pieces !== 103 || record.traceSteps !== 247) entry.failures.push(`${mode}:4050594-contract`);
          if (record.areaLowerBound !== 7) entry.failures.push(`${mode}:4050594-area-bound`);
          if (record.fullPlanHash !== "e858a3bfd89f69b7165954039f3f809752250712736316239f349d8fafbdcd42") entry.failures.push(`${mode}:4050594-reference-hash`);
        }
      }
      report.completed++;
      if (entry.failures.length) { report.status = "FAIL"; save(); break; }
    } catch (error) {
      entry.error = String(error);
      report.status = "INCOMPLETE";
      save();
      break;
    }
    save();
  }
  if (report.status === "RUNNING") report.status = args.sentinels ? "SENTINELS_PASS" : report.completed === 213 ? "PASS" : "SUBSET_PASS";
  save();
  console.log(`${report.status}: ${report.completed}/${report.selected} (${report.scope}); ${join(out, "report.json")}`);
  if (["FAIL", "INCOMPLETE"].includes(report.status)) process.exitCode = 1;
}

function runChild(bundle, input, result, env, timeout) {
  return new Promise((resolve, reject) => {
    const child = fork(script, ["--child", bundle, "--input", input, "--result", result], {
      env, stdio: ["ignore", "ignore", "inherit", "ipc"],
    });
    let record;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeout);
    child.on("message", (message) => { record = message; });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (timedOut) reject(new Error("External watchdog; case remains incomplete"));
      else if (code !== 0 || !record) reject(new Error(`Child failed: ${code}`));
      else resolve(record);
    });
  });
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

function hash(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

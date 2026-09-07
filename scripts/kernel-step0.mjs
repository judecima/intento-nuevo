#!/usr/bin/env node
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const script = fileURLToPath(import.meta.url);
const repo = resolve(dirname(script), "..");
const { values: args } = parseArgs({ options: {
  corpus: { type: "string", default: "D:/proyectos asistidos/lepton/data/lepton-xml" },
  out: { type: "string", default: "test-results/kernel-step0.json" },
  cases: { type: "string" },
  limit: { type: "string" },
  maxNew: { type: "string" },
  v20: { type: "boolean", default: false },
} });

function optionalNonNegativeInt(raw, name) {
  if (raw === undefined) return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
}
const limit = optionalNonNegativeInt(args.limit, "--limit");
// Important: null means unlimited. We never create Infinity and then reject it.
const maxNew = optionalNonNegativeInt(args.maxNew, "--maxNew");
const wanted = args.cases ? new Set(args.cases.split(",").map((x) => x.trim()).filter(Boolean)) : null;

const frozen = readFileSync(join(repo, "experiencia/v6/hotspot-all.jsonl"), "utf8")
  .split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
  .filter((row) => row.ok !== false && !row.engineCacheHit);
if (frozen.length !== 213 || new Set(frozen.map((row) => row.file)).size !== 213)
  throw new Error("Frozen Step0 cohort must contain 213 unique non-cache cases");

let selected = wanted
  ? frozen.filter((row) => [...wanted].some((id) => row.file.includes(id)))
  : frozen.slice();
if (limit !== null) selected = selected.slice(0, limit);
if (maxNew !== null) selected = selected.slice(0, maxNew);
if (!selected.length) throw new Error("No Step0 cases selected");

const corpusNames = new Set(readdirSync(args.corpus).filter((name) => name.toLowerCase().endsWith(".xml")));
for (const row of selected) if (!corpusNames.has(row.file)) throw new Error(`Missing corpus XML: ${row.file}`);

const bundle = join(repo, "node_modules/.cache/kernel-step0/optimizer.mjs");
mkdirSync(dirname(bundle), { recursive: true });
await build({
  entryPoints: [join(repo, "src/lib/optimizer/index.ts")],
  bundle: true, platform: "node", format: "esm", target: "node22",
  outfile: bundle, logLevel: "warning",
  define: { "import.meta.url": JSON.stringify(pathToFileURL(join(repo, "src/lib/optimizer/engine/legacy-engine.ts")).href) },
});

for (const key of Object.keys(process.env)) if (key.startsWith("OPTIMIZER_")) delete process.env[key];
process.env.OPTIMIZER_STEP0_TELEMETRY = "1";
process.env.OPTIMIZER_V10_STAGED_EXPERIMENTAL = "0";
process.env.OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL = args.v20 ? "1" : "0";

const optimizer = await import(pathToFileURL(bundle).href);
const records = [];
for (const [index, row] of selected.entries()) {
  const xml = readFileSync(join(args.corpus, row.file), "utf8");
  const canonical = optimizer.parseCanonicalXml(xml, { fileName: row.file });
  if (!canonical?.case) throw new Error(`Canonical adapter excluded ${row.file}`);
  const input = optimizer.benchmarkInputFromCanonicalCase(canonical.case, { strategy: "v10" });
  const started = performance.now();
  const result = optimizer.optimizeProject(input);
  const wallMs = performance.now() - started;
  const { engineMs, cacheHit, ...quality } = result.metrics;
  const geometry = geometryOnly({
    boards: result.boards, placements: result.placements,
    cuts: result.cuts, remnants: result.remnants,
    trees: result.raw.placas.map((board) => board.arbol),
  });
  const traces = result.placements.map((placement) => placement.trace);
  const telemetry = result.raw.metricasV10?.step0 ?? null;
  const record = {
    file: row.file,
    historicalBoards: row.boards,
    boards: quality.boardCount,
    validationOk: Boolean(result.validation?.ok),
    cacheHit: Boolean(cacheHit),
    wallMs,
    engineMs,
    fullPlanHash: hash({ geometry, traces, quality }),
    geometryHash: hash(geometry),
    traceHash: hash(traces),
    telemetry,
  };
  records.push(record);
  console.log(`${String(index + 1).padStart(3, "0")} ${row.file} boards=${record.boards} beam=${telemetry?.beam?.expansionsTotal ?? 0} master=${telemetry?.master?.nodesTotal ?? 0} one=${telemetry?.oneboard?.attemptsTotal ?? 0}`);
}

const report = {
  createdAt: new Date().toISOString(),
  scope: wanted ? "directed" : selected.length === 213 ? "hotspot-213" : "subset",
  selected: selected.length,
  v20: Boolean(args.v20),
  invalid: records.filter((r) => !r.validationOk).map((r) => r.file),
  cacheHits: records.filter((r) => r.cacheHit).map((r) => r.file),
  clockSensitive: records.filter((r) => totalTimeouts(r.telemetry) > 0).map((r) => ({ file: r.file, timeouts: totalTimeouts(r.telemetry) })),
  distributions: {
    beamExpansions: distribution(records.map((r) => r.telemetry?.beam?.expansionsTotal ?? 0)),
    beamWallMs: distribution(records.map((r) => r.telemetry?.beam?.wallMsTotal ?? 0)),
    masterNodes: distribution(records.map((r) => r.telemetry?.master?.nodesTotal ?? 0)),
    masterWallMs: distribution(records.map((r) => r.telemetry?.master?.wallMsTotal ?? 0)),
    oneBoardAttempts: distribution(records.map((r) => r.telemetry?.oneboard?.attemptsTotal ?? 0)),
    oneBoardWallMs: distribution(records.map((r) => r.telemetry?.oneboard?.wallMsTotal ?? 0)),
    optimizarCalls: distribution(records.map((r) => r.telemetry?.composition?.optimizarCalls ?? 0)),
    armarPlacasCalls: distribution(records.map((r) => r.telemetry?.composition?.armarPlacasCalls ?? 0)),
    stageCalls: distribution(records.map((r) => r.telemetry?.composition?.stageCalls ?? 0)),
    engineMs: distribution(records.map((r) => r.engineMs ?? 0)),
    wallMs: distribution(records.map((r) => r.wallMs ?? 0)),
  },
  records,
};

mkdirSync(dirname(resolve(args.out)), { recursive: true });
writeFileSync(resolve(args.out), JSON.stringify(report, null, 2) + "\n");
console.log(`STEP0 ${report.invalid.length ? "INVALID" : "OK"}: ${records.length} cases; clock-sensitive=${report.clockSensitive.length}; ${resolve(args.out)}`);
if (report.invalid.length || report.cacheHits.length) process.exitCode = 1;

function totalTimeouts(t) {
  return (t?.beam?.timeoutHits ?? 0) + (t?.master?.timeoutHits ?? 0) + (t?.oneboard?.timeoutHits ?? 0);
}
function distribution(values) {
  const sorted = values.slice().sort((a,b) => a-b);
  const q = (p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] : 0;
  return { p50:q(.50), p90:q(.90), p95:q(.95), max:sorted.at(-1) ?? 0 };
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

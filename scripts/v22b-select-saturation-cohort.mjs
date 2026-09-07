#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
const sourcePath = resolve(String(args.source ?? "experiencia/v7/all20.jsonl"));
const manifestPath = resolve(String(args.sentinels ?? "experiencia/master-quality-sentinels.json"));
const outPath = resolve(String(args.out ?? "experiencia/v22b-saturation-nonwins-40.txt"));
const metaPath = resolve(String(args.meta ?? "experiencia/v22b-saturation-nonwins-40.json"));
const count = positiveInt(args.count, 40);
const quartiles = 4;

if (!existsSync(sourcePath)) throw new Error(`no existe source: ${sourcePath}`);
if (!existsSync(manifestPath)) throw new Error(`no existe sentinels: ${manifestPath}`);

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const excluded = new Set((manifest.sentinels ?? []).map((x) => x.file));
const rows = readFileSync(sourcePath, "utf8")
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error(`JSON invalido en linea ${index + 1}: ${error.message}`); }
  });

const candidates = rows
  .filter((row) => row?.ok === true)
  .filter((row) => row?.engineCacheHit !== true)
  .filter((row) => row?.validationOk !== false)
  .filter((row) => Number(row?.metricas?.master?.activaciones ?? 0) > 0)
  .filter((row) => Number(row?.metricas?.master?.ganancias ?? 0) === 0)
  .filter((row) => Number(row?.metricas?.master?.placasAhorradas ?? 0) === 0)
  .filter((row) => typeof row.file === "string" && !excluded.has(row.file))
  .map((row) => ({
    file: row.file,
    pieces: finite(row.pieces),
    boards: finite(row.boards),
    cota: finite(row.cota),
    masterMs: finite(row?.metricas?.master?.ms),
    randomPool: finite(row?.pool?.generarPatrones),
    typesProxy: finite(row?.pool?.patronesMonotipo ?? row?.optimizarCalls?.monotipo),
  }))
  .filter((row) => Number.isFinite(row.typesProxy) && row.typesProxy > 0)
  .filter((row) => Number.isFinite(row.masterMs) && row.masterMs >= 0);

if (candidates.length < count) {
  throw new Error(`solo hay ${candidates.length} non-wins elegibles; se pidieron ${count}`);
}

const byTypes = [...candidates].sort((a, b) =>
  a.typesProxy - b.typesProxy || a.masterMs - b.masterMs || a.file.localeCompare(b.file));
const buckets = splitIntoBuckets(byTypes, quartiles);
const allocations = allocate(count, buckets.length);
const selected = [];
const bucketSummary = [];

for (let i = 0; i < buckets.length; i++) {
  const bucket = [...buckets[i]].sort((a, b) => a.masterMs - b.masterMs || a.file.localeCompare(b.file));
  const chosen = evenlySpaced(bucket, allocations[i]);
  selected.push(...chosen.map((row) => ({ ...row, typeQuartile: i + 1 })));
  bucketSummary.push({
    quartile: i + 1,
    candidates: bucket.length,
    selected: chosen.length,
    minTypesProxy: Math.min(...bucket.map((x) => x.typesProxy)),
    maxTypesProxy: Math.max(...bucket.map((x) => x.typesProxy)),
    minMasterMs: Math.min(...bucket.map((x) => x.masterMs)),
    maxMasterMs: Math.max(...bucket.map((x) => x.masterMs)),
  });
}

const unique = dedupeByFile(selected);
if (unique.length !== count) {
  throw new Error(`seleccion estratificada produjo ${unique.length} casos unicos; esperaba ${count}`);
}

writeFileSync(outPath, unique.map((x) => x.file).join("\n") + "\n");
const meta = {
  source: sourcePath,
  sentinels: manifestPath,
  candidateCount: candidates.length,
  selectedCount: unique.length,
  selection: "four equal-count type-complexity quartiles; within each quartile choose evenly across historical Master ms",
  rationale: [
    "This cohort is diagnostic only and contains Master activations with zero recorded board gain.",
    "Type complexity uses pool.patronesMonotipo (fallback optimizarCalls.monotipo) as a historical proxy; the profiler records actual canonical type count later.",
    "Sampling across both type-complexity and Master-time ranges avoids making pool saturation indistinguishable from small-order size or only studying the expensive tail."
  ],
  buckets: bucketSummary,
  selected: unique,
};
writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");

console.log(`V22b saturation cohort: ${unique.length}/${candidates.length} Master non-wins`);
for (const bucket of bucketSummary) {
  console.log(`Q${bucket.quartile}: selected=${bucket.selected} typesProxy=${bucket.minTypesProxy}-${bucket.maxTypesProxy} masterMs=${bucket.minMasterMs}-${bucket.maxMasterMs}`);
}
console.log(`files: ${outPath}`);
console.log(`meta:  ${metaPath}`);

function splitIntoBuckets(xs, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const start = Math.floor(i * xs.length / n);
    const end = Math.floor((i + 1) * xs.length / n);
    out.push(xs.slice(start, end));
  }
  return out.filter((x) => x.length);
}
function allocate(total, buckets) {
  const base = Math.floor(total / buckets);
  const remainder = total % buckets;
  return Array.from({ length: buckets }, (_, i) => base + (i < remainder ? 1 : 0));
}
function evenlySpaced(xs, n) {
  if (n <= 0) return [];
  if (n >= xs.length) return xs.slice();
  if (n === 1) return [xs[Math.floor(xs.length / 2)]];
  const out = [];
  const used = new Set();
  for (let i = 0; i < n; i++) {
    let idx = Math.round(i * (xs.length - 1) / (n - 1));
    while (used.has(idx) && idx + 1 < xs.length) idx++;
    while (used.has(idx) && idx - 1 >= 0) idx--;
    used.add(idx);
    out.push(xs[idx]);
  }
  return out;
}
function dedupeByFile(xs) {
  const seen = new Set();
  return xs.filter((x) => !seen.has(x.file) && seen.add(x.file));
}
function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function positiveInt(value, fallback) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

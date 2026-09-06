#!/usr/bin/env node
/**
 * V21 benchmark runner.
 *
 * Required measurement mode:
 *   V20 ON, staged OFF, V21 ON/OFF depending on side of the A/B.
 * Persists board count, validation, cheap-LB counters and V21 family metrics.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CORPUS = "D:/proyectos asistidos/lepton/data/lepton-xml";
const args = parseArgs(process.argv.slice(2));

if (typeof args.files !== "string" || typeof args.out !== "string") {
  console.error("uso: node scripts/v21-benchmark-run.mjs --files <lista.txt> --out <salida.jsonl> [--corpus <dir>] [--limit N] [--maxNew N]");
  process.exit(2);
}

const corpus = resolve(args.corpus ?? DEFAULT_CORPUS);
const outPath = resolve(args.out);
const limit = args.limit === undefined ? null : Number(args.limit);
const maxNew = args.maxNew === undefined ? null : Number(args.maxNew);
const files = readFileList(args.files);
const selected = limit === null ? files : files.slice(0, limit);
const done = new Set(readDone(outPath));
const remaining = selected.filter((name) => !done.has(name));
const pending = maxNew === null ? remaining : remaining.slice(0, maxNew);

const bundlePath = join(REPO, "node_modules", ".cache", "experience-benchmark", "optimizer.mjs");
if (!existsSync(bundlePath)) {
  console.error("falta el bundle; correr antes: node scripts/experience-benchmark.mjs report --rebuild");
  process.exit(2);
}
const optimizer = await import(pathToFileURL(bundlePath).href);

mkdirSync(dirname(outPath), { recursive: true });

const envSnapshot = {
  staged: envFlag("OPTIMIZER_V10_STAGED_EXPERIMENTAL"),
  cheapPostBaseline: envFlag("OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL"),
  v21FamilyPatterns: envFlag("OPTIMIZER_V21_FAMILY_PATTERNS_EXPERIMENTAL"),
};

if (envSnapshot.staged || !envSnapshot.cheapPostBaseline) {
  console.error("V21 benchmark requiere STAGED=0 y V20 cheap post-baseline=1");
  process.exit(2);
}

console.log(JSON.stringify({ corpus, selected: selected.length, done: done.size, pending: pending.length, env: envSnapshot }));

let index = 0;
for (const name of pending) {
  index += 1;
  const started = Date.now();
  let record;
  try {
    const xml = readFileSync(join(corpus, name), "utf8");
    const canonical = optimizer.parseCanonicalXml(xml, { fileName: name });
    if (!canonical?.case) throw new Error("canonical case ausente");
    const input = optimizer.benchmarkInputFromCanonicalCase(canonical.case, { strategy: "v10" });
    const trimX = input?.trim?.x;
    const trimY = input?.trim?.y;
    if (!finiteInputTrim(trimX) || !finiteInputTrim(trimY)) {
      throw new Error(`invalid-trim-input x=${String(trimX)} y=${String(trimY)}`);
    }

    const result = optimizer.optimizeProject(input);
    const raw = result.raw ?? {};
    const metrics = raw.metricasV10 ?? {};
    record = {
      file: name,
      ok: true,
      totalMs: Date.now() - started,
      engineMs: result.metrics?.engineMs ?? null,
      boards: result.metrics?.boardCount ?? null,
      pieces: result.metrics?.pieceCount ?? null,
      cota: raw.cotaV10 ?? null,
      validationOk: result.validation?.ok ?? null,
      cacheHit: result.metrics?.cacheHit ?? null,
      algorithmVersion: result.algorithmVersion ?? null,
      refiladoX: +trimX,
      refiladoY: +trimY,
      env: envSnapshot,
      cheap: normalizeCheapMetrics(metrics),
      v21: normalizeV21Metrics(metrics),
    };
  } catch (error) {
    record = {
      file: name,
      ok: false,
      totalMs: Date.now() - started,
      error: String(error?.message ?? error),
      env: envSnapshot,
    };
  }

  appendFileSync(outPath, JSON.stringify(record) + "\n");
  console.log(
    `[${index}/${pending.length}] ${name} ${record.totalMs} ms` +
    (record.boards == null ? "" : ` placas=${record.boards} cota=${record.cota}`) +
    (record.v21 == null ? "" : ` family=${record.v21.familyCertified}/${record.v21.familyRuns}`),
  );
}

console.log("listo. salida: " + outPath);

function normalizeCheapMetrics(metrics) {
  const lb = metrics?.lowerBound ?? {};
  return {
    runs: +lb.cheapRuns || 0,
    ms: +lb.cheapMs || 0,
    value: +lb.cheapValue || 0,
    reason: lb.cheapReason ?? null,
    certified: +lb.cheapCertified || 0,
    violation: +lb.cheapViolation || 0,
    errors: +lb.cheapErrors || 0,
    certifiedAfterBaseline: +lb.certifiedAfterBaseline || 0,
  };
}

function normalizeV21Metrics(metrics) {
  const v21 = metrics?.v21 ?? {};
  return {
    familyRuns: +v21.familyRuns || 0,
    familyCertified: +v21.familyCertified || 0,
    familyMs: +v21.familyMs || 0,
    familySeeds: +v21.familySeeds || 0,
    familyPatterns: +v21.familyPatterns || 0,
    randomPatterns: +v21.randomPatterns || 0,
    fastPoolSize: +v21.fastPoolSize || 0,
    fallbackRuns: +v21.fallbackRuns || 0,
    errors: +v21.errors || 0,
  };
}

function finiteInputTrim(value) {
  return value !== null && value !== "" && value !== undefined && Number.isFinite(+value);
}

function envFlag(name) {
  return /^(1|true|yes|on)$/i.test(String(process.env[name] || ""));
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else { out[key] = next; i += 1; }
  }
  return out;
}

function readFileList(path) {
  return readFileSync(resolve(path), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function readDone(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line).file; } catch { return null; }
    })
    .filter(Boolean);
}

#!/usr/bin/env node
/**
 * V20 post-baseline cheap-LB benchmark runner.
 *
 * Intentionally does not instrument the optimizer internals: it measures wall time
 * through the same public optimizeProject facade and persists the fields required to
 * prove that the A/B is comparable: boards, cota, trim and cheap-LB counters.
 *
 * Usage:
 *   node scripts/v20-benchmark-run.mjs --files <lista.txt> --out <salida.jsonl>
 *
 * Optional: --corpus <dir> --limit N --maxNew N
 */
import { existsSync, mkdirSync, readFileSync, appendFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CORPUS = "D:/proyectos asistidos/lepton/data/lepton-xml";
const args = parseArgs(process.argv.slice(2));

if (typeof args.files !== "string" || typeof args.out !== "string") {
  console.error("uso: node scripts/v20-benchmark-run.mjs --files <lista.txt> --out <salida.jsonl> [--corpus <dir>] [--limit N] [--maxNew N]");
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
};

console.log(JSON.stringify({ corpus, selected: selected.length, done: done.size, pending: pending.length, env: envSnapshot }));

let i = 0;
for (const name of pending) {
  i += 1;
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
      metricasV10: metrics,
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
  console.log(`[${i}/${pending.length}] ${name} ${record.totalMs} ms${record.boards == null ? "" : ` placas=${record.boards} cota=${record.cota} cheap=${record.cheap?.certified ?? 0}`}`);
}

console.log("listo. salida: " + outPath);

function normalizeCheapMetrics(metrics) {
  if (metrics?.lowerBound) {
    const lb = metrics.lowerBound;
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
  return {
    runs: +metrics?.postBaselineCheapRuns || 0,
    ms: +metrics?.postBaselineCheapMs || 0,
    value: +metrics?.postBaselineCheapValue || 0,
    reason: metrics?.postBaselineCheapReason ?? null,
    certified: metrics?.postBaselineCheapCertified ? 1 : 0,
    violation: metrics?.postBaselineCheapViolation ? 1 : 0,
    errors: 0,
    certifiedAfterBaseline: metrics?.postBaselineCheapCertified ? 1 : 0,
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

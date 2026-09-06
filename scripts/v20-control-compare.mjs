#!/usr/bin/env node
/**
 * Compara una corrida de control V20 contra el marcador congelado.
 * Gate: mismos archivos, mismas placas y misma cota. La candidata debe haberse
 * ejecutado con STAGED=0 y CHEAP=0, y debe persistir trim finito.
 *
 * Uso:
 *   node scripts/v20-control-compare.mjs \
 *     --baseline experiencia/v6/hotspot-all.jsonl \
 *     --candidate experiencia/v6/hotspot-v20-control.jsonl \
 *     --limit 20
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
if (typeof args.baseline !== "string" || typeof args.candidate !== "string") {
  console.error("uso: node scripts/v20-control-compare.mjs --baseline <marker.jsonl> --candidate <control.jsonl> [--limit 20]");
  process.exit(2);
}

const limit = Number(args.limit ?? 20);
const baseline = readJsonl(args.baseline).filter((r) => r?.file && r.ok !== false).slice(0, limit);
const candidateRows = readJsonl(args.candidate);
const candidate = new Map(candidateRows.map((r) => [r.file, r]));

const mismatches = [];
let compared = 0;
for (const old of baseline) {
  const now = candidate.get(old.file);
  if (!now) {
    mismatches.push({ file: old.file, issue: "missing-candidate" });
    continue;
  }
  compared += 1;
  if (now.ok !== true) mismatches.push({ file: old.file, issue: "candidate-error", error: now.error ?? null });
  if (now.env?.staged !== false || now.env?.cheapPostBaseline !== false) {
    mismatches.push({ file: old.file, issue: "wrong-env", env: now.env ?? null });
  }
  if (!Number.isFinite(+now.refiladoX) || !Number.isFinite(+now.refiladoY)) {
    mismatches.push({ file: old.file, issue: "invalid-trim", refiladoX: now.refiladoX, refiladoY: now.refiladoY });
  }
  if (+now.boards !== +old.boards) {
    mismatches.push({ file: old.file, issue: "boards", baseline: old.boards, candidate: now.boards });
  }
  if (+now.cota !== +old.cota) {
    mismatches.push({ file: old.file, issue: "cota", baseline: old.cota, candidate: now.cota });
  }
}

const summary = {
  expected: baseline.length,
  compared,
  mismatches: mismatches.length,
  ok: baseline.length === limit && compared === baseline.length && mismatches.length === 0,
};
console.log(JSON.stringify(summary, null, 2));
if (mismatches.length) console.log(JSON.stringify(mismatches.slice(0, 50), null, 2));

if (!summary.ok) {
  console.error("V20 CONTROL FAIL: no correr los 213 hasta resolver las diferencias");
  process.exit(1);
}
console.log("V20 CONTROL OK: boards/cota reproducibles con STAGED=0 y CHEAP=0");

function readJsonl(path) {
  return readFileSync(resolve(path), "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try { return JSON.parse(line); }
      catch (error) { throw new Error(`${path}:${index + 1}: ${error.message}`); }
    });
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

#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
const manifestPath = resolve(String(args.manifest ?? "experiencia/master-quality-sentinels.json"));
const resultsPath = resolve(String(args.results ?? "experiencia/master-sentinels-result.jsonl"));

if (!existsSync(manifestPath)) throw new Error(`no existe manifest: ${manifestPath}`);
if (!existsSync(resultsPath)) throw new Error(`no existe results: ${resultsPath}`);

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const rows = readFileSync(resultsPath, "utf8")
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error(`${resultsPath}:${index + 1}: ${error.message}`); }
  });
const byFile = new Map(rows.map((row) => [row.file, row]));

let failed = false;
for (const sentinel of manifest.sentinels ?? []) {
  const row = byFile.get(sentinel.file);
  if (!row) {
    console.error(`FAIL missing ${sentinel.file}`);
    failed = true;
    continue;
  }
  const boardsOk = +row.boards === +sentinel.expectedBoards;
  const validOk = row.ok !== false && row.validationOk !== false;
  const ok = boardsOk && validOk;
  const master = row?.metricasV10?.master ?? row?.metricas?.master ?? null;
  console.log(`${ok ? "PASS" : "FAIL"} ${sentinel.file} boards=${row.boards} expected=${sentinel.expectedBoards} gap_ref=${sentinel.gap} master=${JSON.stringify(master)}`);
  if (!ok) failed = true;
}

if (failed) process.exit(1);
console.log(`MASTER SENTINEL GATE OK (${(manifest.sentinels ?? []).length} cases)`);

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

#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const path = resolve(process.argv[2] ?? "experiencia/v22a-sentinels-result.jsonl");
if (!existsSync(path)) {
  console.error(`no existe: ${path}`);
  process.exit(2);
}

const expected = new Map([
  ["4050594__Mega_Maderas4050594.xml", 7],
  ["4058501__Marcos _Cumini Londero4058501.xml", 8],
]);
const rows = readFileSync(path, "utf8")
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error(`${path}:${index + 1}: ${error.message}`); }
  });

let failed = false;
for (const [file, boards] of expected) {
  const row = rows.find((r) => r?.file === file);
  if (!row) {
    console.error(`FAIL missing ${file}`);
    failed = true;
    continue;
  }
  const ok = row.ok !== false && row.validationOk !== false && +row.boards === boards;
  const policy = row?.metricasV10?.masterPolicy ?? row?.metricas?.masterPolicy ?? null;
  console.log(`${ok ? "PASS" : "FAIL"} ${file} boards=${row.boards} expected=${boards} masterPolicy=${JSON.stringify(policy)}`);
  if (!ok) failed = true;
}

if (failed) process.exit(1);
console.log("V22a sentinel gate OK");

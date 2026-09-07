#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const corpus = String(args.corpus ?? "D:/proyectos asistidos/lepton/data/lepton-xml");
const source = String(args.source ?? "experiencia/v7/all20.jsonl");
const count = positiveInt(args.count, 40);
const prefix = String(args.prefix ?? "experiencia/v22b-saturation");
const rebuild = boolArg(args.rebuild);

const files = `${prefix}-nonwins-${count}.txt`;
const meta = `${prefix}-nonwins-${count}.json`;
const profile = `${prefix}-nonwins-${count}-profile.json`;
const winsProfile = String(args.wins ?? "experiencia/v22b-master-prefix-profile.json");
const analysis = `${prefix}-analysis.json`;

for (const path of [files, meta, profile, analysis]) {
  mkdirSync(dirname(resolve(path)), { recursive: true });
}

if (rebuild) {
  run("scripts/experience-benchmark.mjs", ["report", "--rebuild"]);
}

run("scripts/v22b-select-saturation-cohort.mjs", [
  "--source", source,
  "--count", String(count),
  "--out", files,
  "--meta", meta,
]);

run("scripts/v22b-master-prefix-profile.mjs", [
  "--corpus", corpus,
  "--files", files,
  "--out", profile,
]);

run("scripts/v22b-saturation-analyze.mjs", [
  "--wins", winsProfile,
  "--nonwins", profile,
  "--out", analysis,
]);

console.log("\nV22b saturation workflow complete");
console.log(`cohort:   ${files}`);
console.log(`metadata: ${meta}`);
console.log(`profile:  ${profile}`);
console.log(`analysis: ${analysis}`);

function run(script, scriptArgs) {
  console.log(`\n> node ${script} ${scriptArgs.map(quote).join(" ")}`);
  const result = spawnSync(process.execPath, [resolve(REPO, script), ...scriptArgs], {
    cwd: REPO,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function quote(value) {
  const s = String(value);
  return /\s/.test(s) ? JSON.stringify(s) : s;
}
function boolArg(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? ""));
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

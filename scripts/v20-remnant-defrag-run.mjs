#!/usr/bin/env node
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const args = parseArgs(process.argv.slice(2));
const result = resolve(String(args.out ?? "experiencia/v20-remnant-defrag-eval.json"));
const node = process.execPath;

const evalArgs = [
  "scripts/v20-remnant-defrag-eval.mjs",
  ...(args.v20 ? ["--v20", String(args.v20)] : []),
  ...(args.files ? ["--files", String(args.files)] : []),
  ...(args.corpus ? ["--corpus", String(args.corpus)] : []),
  ...(args.limit ? ["--limit", String(args.limit)] : []),
  "--out", result,
];

const evalRun = spawnSync(node, evalArgs, { stdio: "inherit" });

// The evaluator predates the safety/parity split and may exit 1 whenever
// legacy-remnant parity is incomplete. If it produced a report, the checker is
// the authoritative decision layer and must still run.
if (!existsSync(result)) {
  console.error(`V20 REMNANT REPAIR: evaluator no produjo ${result}; exit=${evalRun.status}`);
  process.exit(evalRun.status ?? 1);
}

const checkArgs = [
  "scripts/v20-remnant-defrag-check.mjs",
  "--result", result,
  ...(args.expectCertified ? ["--expectCertified", String(args.expectCertified)] : []),
  ...(args.expectActivations ? ["--expectActivations", String(args.expectActivations)] : []),
  ...(args.expectRef ? ["--expectRef", String(args.expectRef)] : []),
  ...(args.minRecovered ? ["--minRecovered", String(args.minRecovered)] : []),
  ...(flag(args.requireLegacyParity) ? ["--requireLegacyParity", "1"] : []),
];

const checkRun = spawnSync(node, checkArgs, { stdio: "inherit" });
process.exit(checkRun.status ?? 1);

function flag(value) {
  if (value === undefined || value === null || value === "") return false;
  return /^(1|true|yes|on)$/i.test(String(value));
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

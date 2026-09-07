#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
const resultPath = resolve(String(args.result ?? "experiencia/v20-remnant-defrag-eval.json"));
if (!existsSync(resultPath)) throw new Error(`no existe: ${resultPath}`);

const report = JSON.parse(readFileSync(resultPath, "utf8"));
const expected = {
  certified: optionalInt(args.expectCertified),
  activations: optionalInt(args.expectActivations),
  referenceImprovements: optionalInt(args.expectRef),
};

const referenceChecks = {
  certified: expected.certified === null || report.certified === expected.certified,
  activations: expected.activations === null || report.compactationActivations === expected.activations,
  referenceImprovements:
    expected.referenceImprovements === null ||
    report.referenceRemnantImprovements === expected.referenceImprovements,
};

const qualityChecks = {
  boards: Number(report.boardRegressions || 0) === 0,
  validation: Number(report.invalidFinalPlans || 0) === 0,
  remnant: Number(report.referenceImprovementsMissed || 0) === 0,
};

const referenceOk = Object.values(referenceChecks).every(Boolean);
const qualityOk = Object.values(qualityChecks).every(Boolean);
const pass = referenceOk && qualityOk;

console.log(JSON.stringify({
  observed: {
    certified: report.certified,
    activations: report.compactationActivations,
    referenceImprovements: report.referenceRemnantImprovements,
    recoveredOrBeaten: report.referenceImprovementsRecoveredOrBeaten,
    missed: report.referenceImprovementsMissed,
    boardRegressions: report.boardRegressions,
    invalidFinalPlans: report.invalidFinalPlans,
    globalCompactationMs: report.globalCompactationMs,
    perBoardMs: report.perBoardMs,
    perBoardVsGlobalRatio: report.perBoardVsGlobalRatio,
  },
  expected,
  referenceChecks,
  qualityChecks,
  pass,
}, null, 2));

if (!referenceOk) {
  console.error("V20 REMNANT REPAIR INCONCLUSIVE: la referencia no reproduce la cohorte medida.");
  process.exit(2);
}
if (!qualityOk) {
  console.error("V20 REMNANT REPAIR FAIL: placas/validacion/remanente no preservados.");
  process.exit(1);
}

console.log("V20 REMNANT REPAIR QUALITY GATE PASS");
console.log("Siguiente paso: medir ahorro neto end-to-end antes de integrar al runtime.");

function optionalInt(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n) || n < 0) throw new Error(`entero invalido: ${value}`);
  return n;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else { out[key] = next; i += 1; }
  }
  return out;
}

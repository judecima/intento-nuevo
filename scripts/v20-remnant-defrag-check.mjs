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
const minRecovered = optionalInt(args.minRecovered);
const requireLegacyParity = flag(args.requireLegacyParity);

const referenceChecks = {
  certified: expected.certified === null || report.certified === expected.certified,
  activations: expected.activations === null || report.compactationActivations === expected.activations,
  referenceImprovements:
    expected.referenceImprovements === null ||
    report.referenceRemnantImprovements === expected.referenceImprovements,
};

const certifiedRows = Array.isArray(report.rows)
  ? report.rows.filter((row) => row?.ok === true && row?.certified === true)
  : [];
const worseThanCurrentV20 = certifiedRows.filter((row) => Number(row?.cVsA ?? 0) < 0);

// SAFETY responde una pregunta distinta de la paridad contra compactacion legacy:
// "¿la reparacion local empeora lo que V20 devuelve hoy?"
// Una tecnica puede ser segura respecto de A y aun recuperar solo una parte de B.
const safetyChecks = {
  boards: Number(report.boardRegressions || 0) === 0,
  validation: Number(report.invalidFinalPlans || 0) === 0,
  noWorseThanCurrentV20: worseThanCurrentV20.length === 0,
};

const recovered = Number(report.referenceImprovementsRecoveredOrBeaten || 0);
const missed = Number(report.referenceImprovementsMissed || 0);
const legacyParity = missed === 0;
const recoveryCheck = minRecovered === null || recovered >= minRecovered;

const referenceOk = Object.values(referenceChecks).every(Boolean);
const safetyOk = Object.values(safetyChecks).every(Boolean);

console.log(JSON.stringify({
  observed: {
    certified: report.certified,
    activations: report.compactationActivations,
    referenceImprovements: report.referenceRemnantImprovements,
    recoveredOrBeaten: recovered,
    missed,
    recoveryRate:
      Number(report.referenceRemnantImprovements || 0) > 0
        ? recovered / Number(report.referenceRemnantImprovements)
        : null,
    worseThanCurrentV20: worseThanCurrentV20.length,
    worseThanCurrentV20Files: worseThanCurrentV20.map((row) => row.file),
    boardRegressions: report.boardRegressions,
    invalidFinalPlans: report.invalidFinalPlans,
    globalCompactationMs: report.globalCompactationMs,
    perBoardMs: report.perBoardMs,
    perBoardVsGlobalRatio: report.perBoardVsGlobalRatio,
  },
  expected,
  minRecovered,
  requireLegacyParity,
  referenceChecks,
  safetyChecks,
  recoveryCheck,
  legacyParity,
}, null, 2));

if (!referenceOk) {
  console.error("V20 REMNANT REPAIR INCONCLUSIVE: la referencia no reproduce la cohorte medida.");
  process.exit(2);
}
if (!safetyOk) {
  console.error("V20 REMNANT REPAIR SAFETY FAIL: la reparacion empeora placas, validacion o el V20 actual.");
  process.exit(1);
}

console.log("V20 REMNANT REPAIR SAFETY PASS");

if (!recoveryCheck) {
  console.error(`V20 REMNANT REPAIR RECOVERY BELOW PREDECLARED FLOOR: ${recovered} < ${minRecovered}`);
  process.exit(3);
}

if (!legacyParity) {
  console.log(`LEGACY REMNANT PARITY NOT REACHED: recuperadas ${recovered}/${report.referenceRemnantImprovements}.`);
  console.log("Esto NO invalida la tecnica como reparacion parcial; los misses deben documentarse caso por caso.");
  console.log("Pero V20 no puede declararse equivalente al legacy en objetivo #2 sin una decision explicita de producto.");
  if (requireLegacyParity) process.exit(4);
  process.exit(0);
}

console.log("V20 REMNANT REPAIR LEGACY PARITY PASS");
console.log("Siguiente paso: medir ahorro neto end-to-end antes de integrar al runtime.");

function flag(value) {
  if (value === undefined || value === null || value === "") return false;
  return /^(1|true|yes|on)$/i.test(String(value));
}

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

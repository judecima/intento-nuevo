#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditLeptonProjectXml } from "./lib/lepton-project-semantics.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const args = parseArgs(process.argv.slice(2));

if (args.help || !args.inputs.length) {
  printHelp();
  process.exit(args.help ? 0 : 2);
}

fs.mkdirSync(args.output, { recursive: true });

const rowsPath = path.join(args.output, "LEPTON_SEMANTICS_ROWS.jsonl");
const summaryPath = path.join(args.output, "LEPTON_SEMANTICS_SUMMARY.json");
const nonZeroIdsPath = path.join(args.output, "IDS_TRIM_NONZERO.txt");
const ambiguousIdsPath = path.join(args.output, "IDS_TRIM_AMBIGUOUS.txt");
const zeroIdsPath = path.join(args.output, "IDS_TRIM_ZERO.txt");
const unknownIdsPath = path.join(args.output, "IDS_UNKNOWN.txt");
const rotationReviewIdsPath = path.join(args.output, "IDS_ROTATION_REVIEW.txt");
const furnitureLe75IdsPath = path.join(args.output, "IDS_FURNITURE_LE75.txt");
const over75IdsPath = path.join(args.output, "IDS_OVER75.txt");
const zeroPieceIdsPath = path.join(args.output, "IDS_ZERO_PIECES.txt");
const globalTrimRuleFailIdsPath = path.join(args.output, "IDS_TRIM_RULE_GLOBAL_FAIL.txt");
const factoryEdgeRuleFailIdsPath = path.join(args.output, "IDS_TRIM_RULE_FACTORY_EDGE_FAIL.txt");

const allFiles = collectXml(args.inputs);
const idsFilter = args.idsFile ? loadIdsFile(args.idsFile) : null;
const files = idsFilter
  ? allFiles.filter((file) => idsFilter.has(idFromFileName(path.basename(file))))
  : allFiles;
const runtimeRows = args.runtimeRows ? loadJsonl(args.runtimeRows) : [];
const runtimeById = new Map(
  runtimeRows
    .filter((row) => Number.isSafeInteger(Number(row.caseId)))
    .map((row) => [Number(row.caseId), row]),
);

const rows = [];
let processed = 0;

for (const file of files) {
  const xml = fs.readFileSync(file, "utf8");
  const caseId = idFromFileName(path.basename(file));
  let audit;
  try {
    audit = auditLeptonProjectXml(xml, {
      caseId,
      fileName: path.basename(file),
    });
  } catch (error) {
    audit = {
      schema: "lepton-project-semantics-v1",
      caseId,
      fileName: path.basename(file),
      project: null,
      error: String(error?.stack || error),
    };
  }

  const runtime = runtimeById.get(caseId);
  const candidateBoards = runtime?.candidate?.boards ?? runtime?.candidate?.boardCount ?? runtime?.candidate?.metrics?.boardCount ?? null;
  const leptonBoards = runtime?.leptonBoards ?? audit?.physicalBoards ?? null;
  const candidateVsLepton =
    runtime?.comparisons?.candidateVsLepton ??
    (Number.isFinite(candidateBoards) && Number.isFinite(leptonBoards)
      ? Math.sign(candidateBoards - leptonBoards)
      : null);

  rows.push({
    ...audit,
    path: file,
    runtime: runtime
      ? {
          candidateBoards,
          leptonBoards,
          candidateVsLepton,
          candidateCpuMs: runtime?.candidate?.cpuMs ?? null,
          candidateWallMs: runtime?.candidate?.wallMs ?? null,
          enteredMaster: runtime?.auto?.enteredMaster ?? null,
        }
      : null,
  });

  processed++;
  if (processed % args.progressEvery === 0 || processed === files.length) {
    console.log(`AUDIT ${processed}/${files.length}`);
  }
}

fs.writeFileSync(rowsPath, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");

const project = rows.filter((row) => row.project === true && !row.error);
const nonProject = rows.filter((row) => row.project === false && !row.error);
const errors = rows.filter((row) => row.error);
const unambiguous = project.filter((row) => row.inferredRefilado?.unambiguous);
const trimNonZero = unambiguous.filter((row) => row.inferredRefilado?.nonZero);
const trimZero = unambiguous.filter((row) => !row.inferredRefilado?.nonZero);
const trimAmbiguous = project.filter((row) => !row.inferredRefilado?.unambiguous);

const trimDistribution = histogram(
  unambiguous.map((row) => `${row.inferredRefilado.x},${row.inferredRefilado.y}`),
);

const unknownRows = project.filter(
  (row) => row.runtime?.candidateVsLepton == null,
);
const unknownRuntimeMissing = unknownRows.filter((row) => row.runtime == null);
const unknownRuntimePresent = unknownRows.filter((row) => row.runtime != null);

const furnitureLe75 = project.filter(
  (row) => row.physicalBoards <= 75 && row.physicalPieces > 0,
);
const over75 = project.filter((row) => row.physicalBoards > 75);
const zeroPiece = project.filter((row) => row.physicalPieces === 0);

const noRotationAtLeast5 = project.filter(
  (row) => row.physicalPieces >= 5 && !row.rotation?.rotationObserved,
);
const noRotationBetter = noRotationAtLeast5.filter(
  (row) => row.runtime?.candidateVsLepton < 0,
);
const noRotationEqual = noRotationAtLeast5.filter(
  (row) => row.runtime?.candidateVsLepton === 0,
);
const noRotationWorse = noRotationAtLeast5.filter(
  (row) => row.runtime?.candidateVsLepton > 0,
);
const noRotationUnknown = noRotationAtLeast5.filter(
  (row) => row.runtime?.candidateVsLepton == null,
);

const cohortSummary = {};
for (const [name, predicate] of Object.entries({
  better: (row) => row.runtime?.candidateVsLepton < 0,
  equal: (row) => row.runtime?.candidateVsLepton === 0,
  worse: (row) => row.runtime?.candidateVsLepton > 0,
  unknown: (row) => row.runtime?.candidateVsLepton == null,
})) {
  const cohort = project.filter(predicate);
  const cohortKnown = cohort.filter((row) => row.inferredRefilado?.unambiguous);
  const cohortNonZero = cohortKnown.filter((row) => row.inferredRefilado?.nonZero);
  cohortSummary[name] = {
    cases: cohort.length,
    trimKnown: cohortKnown.length,
    trimNonZero: cohortNonZero.length,
    trimNonZeroPct:
      cohortKnown.length > 0 ? +(100 * cohortNonZero.length / cohortKnown.length).toFixed(3) : null,
    trimDistribution: histogram(
      cohortKnown.map((row) => `${row.inferredRefilado.x},${row.inferredRefilado.y}`),
    ),
  };
}

const farEdge = {
  rightCases: project.filter((row) => row.touchesPhysicalRootEdge?.right).length,
  bottomCases: project.filter((row) => row.touchesPhysicalRootEdge?.bottom).length,
  eitherCases: project.filter(
    (row) => row.touchesPhysicalRootEdge?.right || row.touchesPhysicalRootEdge?.bottom,
  ).length,
  neitherCases: project.filter(
    (row) => !row.touchesPhysicalRootEdge?.right && !row.touchesPhysicalRootEdge?.bottom,
  ).length,
  physicalBoardsEither: project.reduce(
    (sum, row) => sum + (row.physicalBoardsTouchingFarEdge?.either || 0),
    0,
  ),
  byTrim: histogram(
    project.map((row) => {
      const trim = `${row.inferredRefilado?.x},${row.inferredRefilado?.y}`;
      const touched =
        row.touchesPhysicalRootEdge?.right || row.touchesPhysicalRootEdge?.bottom
          ? "far-edge"
          : "no-far-edge";
      return `${trim}|${touched}`;
    }),
  ),
};

function summarizeTrimRule(rows, ruleName) {
  const eligible = rows.filter(
    (row) =>
      row.inferredRefilado?.unambiguous &&
      row.trimRuleCandidates?.[ruleName]?.pass != null,
  );
  const passing = eligible.filter((row) => row.trimRuleCandidates[ruleName].pass === true);
  const failing = eligible.filter((row) => row.trimRuleCandidates[ruleName].pass === false);
  return {
    eligibleCases: eligible.length,
    passingCases: passing.length,
    failingCases: failing.length,
    passPct:
      eligible.length > 0 ? +(100 * passing.length / eligible.length).toFixed(3) : null,
    evaluablePhysicalBoards: eligible.reduce(
      (sum, row) =>
        sum + (row.trimRuleCandidates?.[ruleName]?.evaluablePhysicalBoards || 0),
      0,
    ),
    notApplicablePhysicalBoards: eligible.reduce(
      (sum, row) =>
        sum + (row.trimRuleCandidates?.[ruleName]?.notApplicablePhysicalBoards || 0),
      0,
    ),
    violatingPhysicalBoards: failing.reduce(
      (sum, row) =>
        sum + (row.trimRuleCandidates?.[ruleName]?.violatingPhysicalBoards || 0),
      0,
    ),
    byTrim: histogram(
      eligible.map((row) => {
        const trim = `${row.inferredRefilado.x},${row.inferredRefilado.y}`;
        return `${trim}|${row.trimRuleCandidates[ruleName].pass ? "pass" : "fail"}`;
      }),
    ),
    failingCaseIds: failing
      .map((row) => row.caseId)
      .filter(Number.isSafeInteger)
      .sort((a, b) => a - b),
  };
}

const trimRuleCandidates = {
  globalFarInset: summarizeTrimRule(project, "globalFarInset"),
  factoryEdgeOrReserve: summarizeTrimRule(project, "factoryEdgeOrReserve"),
};

const summary = {
  schema: "optimizer-holdout-lepton-semantics-audit-v1",
  generatedAt: new Date().toISOString(),
  inputs: args.inputs,
  runtimeRows: args.runtimeRows,
  xmlFiles: files.length,
  projectCases: project.length,
  nonProjectCases: nonProject.length,
  errors: errors.length,
  trim: {
    unambiguous: unambiguous.length,
    ambiguous: trimAmbiguous.length,
    nonZero: trimNonZero.length,
    zero: trimZero.length,
    nonZeroPct:
      unambiguous.length > 0 ? +(100 * trimNonZero.length / unambiguous.length).toFixed(3) : null,
    distribution: trimDistribution,
  },
  rotation: {
    observed: project.filter((row) => row.rotation?.rotationObserved).length,
    sameCodeBothOrientations: project.filter(
      (row) => row.rotation?.sameCodeBothOrientationsObserved,
    ).length,
  },
  farEdge,
  trimRuleCandidates,
  qualityCohorts: cohortSummary,
  unknown: {
    cases: unknownRows.length,
    runtimeMissing: unknownRuntimeMissing.length,
    runtimePresentNoComparison: unknownRuntimePresent.length,
    trimDistribution: histogram(
      unknownRows.map(
        (row) => `${row.inferredRefilado?.x},${row.inferredRefilado?.y}`,
      ),
    ),
    runtimePresentCases: unknownRuntimePresent.map((row) => ({
      caseId: row.caseId,
      leptonBoards: row.runtime?.leptonBoards ?? row.physicalBoards ?? null,
      physicalPieces: row.physicalPieces,
      candidateWallMs: row.runtime?.candidateWallMs ?? null,
      candidateCpuMs: row.runtime?.candidateCpuMs ?? null,
      trim: row.inferredRefilado,
    })),
  },
  productCohorts: {
    furnitureLe75: furnitureLe75.length,
    over75: over75.length,
    zeroPiece: zeroPiece.length,
  },
  noRotationAtLeast5: {
    cases: noRotationAtLeast5.length,
    better: noRotationBetter.length,
    equal: noRotationEqual.length,
    worse: noRotationWorse.length,
    unknown: noRotationUnknown.length,
    betterMaterials: histogram(
      noRotationBetter.flatMap((row) => row.materials || []),
    ),
  },
  outputs: {
    rows: rowsPath,
    nonZeroIds: nonZeroIdsPath,
    zeroIds: zeroIdsPath,
    ambiguousIds: ambiguousIdsPath,
    unknownIds: unknownIdsPath,
    rotationReviewIds: rotationReviewIdsPath,
    furnitureLe75Ids: furnitureLe75IdsPath,
    over75Ids: over75IdsPath,
    zeroPieceIds: zeroPieceIdsPath,
    globalTrimRuleFailIds: globalTrimRuleFailIdsPath,
    factoryEdgeRuleFailIds: factoryEdgeRuleFailIdsPath,
  },
  errorsPreview: errors.slice(0, 20).map((row) => ({
    caseId: row.caseId,
    fileName: row.fileName,
    error: row.error,
  })),
};

fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + "\n");
writeIds(nonZeroIdsPath, trimNonZero);
writeIds(zeroIdsPath, trimZero);
writeIds(ambiguousIdsPath, trimAmbiguous);
writeIds(unknownIdsPath, unknownRows);
writeIds(rotationReviewIdsPath, noRotationBetter);
writeIds(furnitureLe75IdsPath, furnitureLe75);
writeIds(over75IdsPath, over75);
writeIds(zeroPieceIdsPath, zeroPiece);
fs.writeFileSync(
  globalTrimRuleFailIdsPath,
  trimRuleCandidates.globalFarInset.failingCaseIds.join("\n") +
    (trimRuleCandidates.globalFarInset.failingCaseIds.length ? "\n" : ""),
);
fs.writeFileSync(
  factoryEdgeRuleFailIdsPath,
  trimRuleCandidates.factoryEdgeOrReserve.failingCaseIds.join("\n") +
    (trimRuleCandidates.factoryEdgeOrReserve.failingCaseIds.length ? "\n" : ""),
);

console.log("SUMMARY " + JSON.stringify({
  xmlFiles: summary.xmlFiles,
  projectCases: summary.projectCases,
  errors: summary.errors,
  trimUnambiguous: summary.trim.unambiguous,
  trimNonZero: summary.trim.nonZero,
  trimZero: summary.trim.zero,
  trimAmbiguous: summary.trim.ambiguous,
  trimDistribution: summary.trim.distribution,
  farEdge: summary.farEdge,
  trimRuleCandidates: summary.trimRuleCandidates,
  qualityCohorts: summary.qualityCohorts,
  unknown: summary.unknown,
  productCohorts: summary.productCohorts,
  noRotationAtLeast5: summary.noRotationAtLeast5,
  output: summaryPath,
}));

function writeIds(filePath, sourceRows) {
  const ids = sourceRows
    .map((row) => row.caseId)
    .filter(Number.isSafeInteger)
    .sort((a, b) => a - b);
  fs.writeFileSync(filePath, ids.join("\n") + (ids.length ? "\n" : ""));
}

function histogram(values) {
  const map = new Map();
  for (const value of values) map.set(value, (map.get(value) || 0) + 1);
  return Object.fromEntries(
    [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))),
  );
}

function loadIdsFile(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`No existe --ids-file: ${filePath}`);
  const ids = new Set();
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const value = Number(line.trim());
    if (Number.isSafeInteger(value)) ids.add(value);
  }
  if (!ids.size) throw new Error(`--ids-file no contiene IDs válidos: ${filePath}`);
  return ids;
}

function loadJsonl(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`No existe --runtime-rows: ${filePath}`);
  const out = [];
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    out.push(JSON.parse(line));
  }
  return out;
}

function collectXml(inputs) {
  const out = [];
  for (const input of inputs) {
    if (!fs.existsSync(input)) throw new Error(`No existe --input: ${input}`);
    const stat = fs.statSync(input);
    if (stat.isFile()) {
      if (path.extname(input).toLowerCase() === ".xml") out.push(input);
      else throw new Error(`El auditor acepta carpetas o XML, no ${input}`);
      continue;
    }
    walk(input, out);
  }
  return [...new Set(out)].sort((a, b) => a.localeCompare(b));
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".extracted-ok") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".xml") out.push(full);
  }
}

function idFromFileName(name) {
  const match = /(^|\D)(\d{5,})(?=\D|$)/.exec(name);
  return match ? Number(match[2]) : null;
}

function parseArgs(argv) {
  const out = {
    inputs: [],
    output: path.join(REPO, "validation-full", "lepton-semantics-audit"),
    runtimeRows: null,
    idsFile: null,
    progressEvery: 250,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--input") out.inputs.push(path.resolve(argv[++i]));
    else if (arg === "--output") out.output = path.resolve(argv[++i]);
    else if (arg === "--runtime-rows") out.runtimeRows = path.resolve(argv[++i]);
    else if (arg === "--ids-file") out.idsFile = path.resolve(argv[++i]);
    else if (arg === "--progress-every") out.progressEvery = Math.max(1, Number(argv[++i]) || 250);
    else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`Argumento desconocido: ${arg}`);
  }
  return out;
}

function printHelp() {
  console.log(`
Uso:
  node scripts/audit-holdout-lepton-semantics.mjs \\
    --input ".\\validation-full\\_extracted" \\
    --runtime-rows ".\\validation-full\\FULL_RUNTIME_VALIDATION_ROWS.jsonl" \\
    --ids-file ".\\validation-full\\FAILED_TRIM_IDS.txt" \\
    --output ".\\validation-full\\lepton-semantics-audit"

Puede repetirse --input para varias carpetas. El script sólo lee XML ya extraídos.
--ids-file es opcional y limita el audit a esos IDs; es útil para auditar sólo
los fallos por refilado sin recorrer nuevamente todo el holdout.
Cruzar --runtime-rows es opcional, pero permite informar trim por cohortes mejor/igual/peor.
`);
}

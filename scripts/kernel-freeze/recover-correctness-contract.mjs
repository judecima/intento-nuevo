#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(import.meta.url);
const REPO = resolve(dirname(SCRIPT), "../..");
const csvPath = resolve(REPO, process.argv[2] ?? "benchmark_project_v10.csv");
const outPath = resolve(
  REPO,
  process.argv[3] ?? "research/optimizer/freeze/KERNEL_V1_CORRECTNESS_CONTRACT.json"
);

const rows = parseCsv(readFileSync(csvPath, "utf8"));
if (rows.length < 2) fail("benchmark CSV is empty");

const header = rows[0];
const index = Object.fromEntries(header.map((name, i) => [name, i]));
for (const required of ["archivo", "delta", "estado", "detalle"]) {
  if (!(required in index)) fail(`missing CSV column ${required}`);
}

const data = rows.slice(1).filter((row) => row.some((value) => value !== ""));
const matrix = {
  OK: { negative: 0, zero: 0, positive: 0, na: 0 },
  ERROR: { negative: 0, zero: 0, positive: 0, na: 0 },
  SKIP: { negative: 0, zero: 0, positive: 0, na: 0 },
};
const details = {
  errorMultiset: 0,
  errorInfeasible: 0,
  errorOther: 0,
  skipUnsupportedRoot: 0,
  skipMixedBoard: 0,
  skipOther: 0,
};

const evidence = {
  okWorseThanReference: [],
  errorNonWorseThanReference: [],
  infeasible: [],
};

for (const row of data) {
  const estado = value(row, index.estado).trim();
  if (!(estado in matrix)) fail(`unexpected estado ${estado}`);
  const deltaRaw = value(row, index.delta).trim();
  const sign = deltaSign(deltaRaw);
  matrix[estado][sign]++;

  const detalle = value(row, index.detalle).trim();
  const archivo = value(row, index.archivo).trim();

  if (estado === "ERROR") {
    if (/multiset piezas/i.test(detalle)) {
      details.errorMultiset++;
    } else if (/no entra en una placa útil/i.test(detalle)) {
      details.errorInfeasible++;
      evidence.infeasible.push({ file: archivo, detail: detalle });
    } else {
      details.errorOther++;
    }
    if (sign === "negative" || sign === "zero") {
      evidence.errorNonWorseThanReference.push({ file: archivo, delta: Number(deltaRaw), detail: detalle });
    }
  } else if (estado === "SKIP") {
    if (/raíz distinta de <project>/i.test(detalle)) details.skipUnsupportedRoot++;
    else if (/stock mixto/i.test(detalle)) details.skipMixedBoard++;
    else details.skipOther++;
  } else if (estado === "OK" && sign === "positive") {
    evidence.okWorseThanReference.push({ file: archivo, delta: Number(deltaRaw) });
  }
}

assertEqual(data.length, 2000, "total rows");
assertMatrix(matrix.OK, { negative: 61, zero: 1386, positive: 10, na: 0 }, "OK");
assertMatrix(matrix.ERROR, { negative: 3, zero: 30, positive: 0, na: 60 }, "ERROR");
assertMatrix(matrix.SKIP, { negative: 0, zero: 0, positive: 0, na: 450 }, "SKIP");
assertEqual(details.errorMultiset, 33, "ERROR multiset");
assertEqual(details.errorInfeasible, 60, "ERROR infeasible");
assertEqual(details.errorOther, 0, "ERROR other");
assertEqual(details.skipUnsupportedRoot, 449, "SKIP unsupported root");
assertEqual(details.skipMixedBoard, 1, "SKIP mixed board");
assertEqual(details.skipOther, 0, "SKIP other");

const report = {
  schemaVersion: "kernel-v1-correctness-contract-v1",
  generatedAt: new Date().toISOString(),
  source: {
    file: relative(csvPath),
    rows: data.length,
    role: "Historical V10 benchmark evidence. estado and delta are independently recorded columns."
  },
  contingency: matrix,
  details,
  proofs: {
    boardsComparisonIsAcceptanceGate: false,
    okWithDeltaPositive: matrix.OK.positive,
    errorWithDeltaNonPositive: matrix.ERROR.negative + matrix.ERROR.zero,
    explanation:
      "10 rows are estado=OK while delta>0, and 33 rows are estado=ERROR while delta<=0. Therefore board delta versus Lepton is not the acceptance predicate."
  },
  recoveredPredicate: {
    status: "RECOVERED",
    id: "HISTORICAL_VALIDITY_V1",
    feasiblePlanRule:
      "A feasible case is correct when the produced plan covers exactly the demanded piece multiset and the plan is valid for the usable board geometry.",
    infeasibleInputRule:
      "A case containing a demanded piece that cannot fit the usable board in any orientation allowed by the case is an expected infeasible instance, not an optimizer regression.",
    referenceBoardsRole:
      "reference_panels / delta is a quality comparison metric versus Lepton, not a correctness acceptance gate.",
    formalFreezeRule:
      "For feasible inputs require a fresh, validated, exact-demand plan. Classify physically infeasible inputs separately and exclude them from plan-hash determinism denominators."
  },
  evidenceExamples: {
    okWorseThanReference: evidence.okWorseThanReference.slice(0, 10),
    errorNonWorseThanReference: evidence.errorNonWorseThanReference.slice(0, 10),
    infeasible: evidence.infeasible
  }
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({
  out: relative(outPath),
  status: report.recoveredPredicate.status,
  predicate: report.recoveredPredicate.id,
  okWorseThanReference: report.proofs.okWithDeltaPositive,
  errorNonWorseThanReference: report.proofs.errorWithDeltaNonPositive,
  infeasibleSampleRows: details.errorInfeasible,
}));

function value(row, i) {
  return i == null ? "" : String(row[i] ?? "");
}

function deltaSign(raw) {
  if (raw === "") return "na";
  const n = Number(raw);
  if (!Number.isFinite(n)) return "na";
  if (n < 0) return "negative";
  if (n > 0) return "positive";
  return "zero";
}

function assertMatrix(actual, expected, label) {
  for (const key of ["negative", "zero", "positive", "na"]) {
    assertEqual(actual[key], expected[key], `${label}.${key}`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) fail(`${label}: expected ${expected}, got ${actual}`);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (quoted) fail("unterminated quoted CSV field");
  if (field !== "" || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

function relative(path) {
  return path.startsWith(REPO) ? path.slice(REPO.length + 1).replace(/\\/g, "/") : path.replace(/\\/g, "/");
}

function fail(message) {
  throw new Error(message);
}

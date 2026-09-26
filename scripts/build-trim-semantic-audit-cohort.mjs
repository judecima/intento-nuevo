#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));
fs.mkdirSync(args.output, { recursive: true });

const rows = loadJsonl(args.runtimeRows);
const problemIds = buildProblemIds(rows);
const controls = buildControls(rows, problemIds, {
  equal: args.equalControls,
  better: args.betterControls,
  seed: args.seed,
});
const controlIds = controls.map((row) => row.caseId).sort((a, b) => a - b);
const combinedIds = [...new Set([...problemIds, ...controlIds])].sort((a, b) => a - b);

writeIds(path.join(args.output, "TRIM_SEMANTIC_AUDIT_IDS.txt"), problemIds);
writeIds(path.join(args.output, "TRIM_SEMANTIC_CONTROL_IDS.txt"), controlIds);
writeIds(path.join(args.output, "TRIM_SEMANTIC_AUDIT_WITH_CONTROL_IDS.txt"), combinedIds);

fs.writeFileSync(
  path.join(args.output, "TRIM_SEMANTIC_CONTROL.csv"),
  [
    "caseId,outcome,trimX,trimY,leptonBoards,boardBand",
    ...controls
      .slice()
      .sort((a, b) => a.caseId - b.caseId)
      .map(
        (row) =>
          `${row.caseId},${row.outcome},${row.trimX},${row.trimY},${row.leptonBoards},${row.boardBand}`,
      ),
  ].join("\n") + "\n",
);

const meta = {
  schema: "trim-semantics-control-cohort-v1",
  generatedAt: new Date().toISOString(),
  runtimeRows: args.runtimeRows,
  seed: args.seed,
  problemRule:
    "status=FAIL OR (status=OK AND candidate.lowerBound > leptonBoards)",
  controlSelection:
    "status=OK, nonzero trim, <=75 Lepton boards, outcome equal/better, excluding problem cases; deterministic SHA256 ranking, proportional within outcome by trim and Lepton-board band",
  targets: {
    equal: args.equalControls,
    better: args.betterControls,
  },
  counts: {
    runtimeRows: rows.length,
    problemCases: problemIds.length,
    controls: controlIds.length,
    equalControls: controls.filter((row) => row.outcome === "equal").length,
    betterControls: controls.filter((row) => row.outcome === "better").length,
    combinedCases: combinedIds.length,
  },
};

fs.writeFileSync(
  path.join(args.output, "TRIM_SEMANTIC_CONTROL_META.json"),
  JSON.stringify(meta, null, 2) + "\n",
);

console.log("TRIM_SEMANTIC_COHORT " + JSON.stringify(meta));

function buildProblemIds(rows) {
  const ids = new Set();
  for (const row of rows) {
    const caseId = Number(row.caseId);
    if (!Number.isSafeInteger(caseId)) continue;

    if (row.status === "FAIL") {
      ids.add(caseId);
      continue;
    }

    const lowerBound = Number(row?.candidate?.lowerBound);
    const leptonBoards = Number(row?.leptonBoards);
    if (
      row.status === "OK" &&
      Number.isFinite(lowerBound) &&
      Number.isFinite(leptonBoards) &&
      lowerBound > leptonBoards
    ) {
      ids.add(caseId);
    }
  }
  return [...ids].sort((a, b) => a - b);
}

function buildControls(rows, problemIds, config) {
  const problem = new Set(problemIds);
  const eligible = [];

  for (const row of rows) {
    const caseId = Number(row.caseId);
    if (!Number.isSafeInteger(caseId) || problem.has(caseId)) continue;
    if (row.status !== "OK") continue;

    const comparison = row?.comparisons?.candidateVsLepton;
    const outcome =
      comparison === 0 ? "equal" : comparison === -1 ? "better" : null;
    if (!outcome) continue;

    const trimX = Number(row?.effectiveTrim?.x || 0);
    const trimY = Number(row?.effectiveTrim?.y || 0);
    if (!(trimX > 0 || trimY > 0)) continue;

    const leptonBoards = Number(row.leptonBoards);
    if (!Number.isFinite(leptonBoards) || leptonBoards <= 0 || leptonBoards > 75) {
      continue;
    }

    eligible.push({
      caseId,
      outcome,
      trimX,
      trimY,
      leptonBoards,
      boardBand: boardBand(leptonBoards),
    });
  }

  return [
    ...stratifiedSample(
      eligible.filter((row) => row.outcome === "equal"),
      config.equal,
      config.seed,
    ),
    ...stratifiedSample(
      eligible.filter((row) => row.outcome === "better"),
      config.better,
      config.seed,
    ),
  ];
}

function stratifiedSample(rows, target, seed) {
  if (target <= 0 || !rows.length) return [];
  if (rows.length <= target) return rows.slice();

  const strata = new Map();
  for (const row of rows) {
    const key = `${row.trimX},${row.trimY}|${row.boardBand}`;
    if (!strata.has(key)) strata.set(key, []);
    strata.get(key).push(row);
  }

  const total = rows.length;
  const quotas = new Map();
  const remainders = [];
  let assigned = 0;

  for (const [key, values] of strata) {
    const exact = (target * values.length) / total;
    const base = Math.min(values.length, Math.floor(exact));
    quotas.set(key, base);
    assigned += base;
    remainders.push({ key, remainder: exact - base });
  }

  remainders.sort(
    (a, b) =>
      b.remainder - a.remainder || String(a.key).localeCompare(String(b.key)),
  );

  for (const entry of remainders) {
    if (assigned >= target) break;
    const values = strata.get(entry.key);
    const current = quotas.get(entry.key) || 0;
    if (current < values.length) {
      quotas.set(entry.key, current + 1);
      assigned++;
    }
  }

  const selected = [];
  for (const [key, values] of strata) {
    values.sort((a, b) => {
      const ha = stableHash(`${seed}|${a.caseId}`);
      const hb = stableHash(`${seed}|${b.caseId}`);
      return ha.localeCompare(hb);
    });
    selected.push(...values.slice(0, quotas.get(key) || 0));
  }
  return selected;
}

function stableHash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function boardBand(value) {
  if (value <= 1) return "1";
  if (value <= 3) return "2-3";
  if (value <= 10) return "4-10";
  if (value <= 30) return "11-30";
  return "31-75";
}

function writeIds(filePath, ids) {
  fs.writeFileSync(filePath, ids.join("\n") + (ids.length ? "\n" : ""));
}

function loadJsonl(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`No existe --runtime-rows: ${filePath}`);
  }
  const rows = [];
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    rows.push(JSON.parse(line));
  }
  return rows;
}

function parseArgs(argv) {
  const out = {
    runtimeRows: null,
    output: path.resolve("validation-full/trim-semantic-cohort"),
    equalControls: 400,
    betterControls: 200,
    seed: "trim-control-v1",
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--runtime-rows") out.runtimeRows = path.resolve(argv[++i]);
    else if (arg === "--output") out.output = path.resolve(argv[++i]);
    else if (arg === "--equal-controls") out.equalControls = Number(argv[++i]);
    else if (arg === "--better-controls") out.betterControls = Number(argv[++i]);
    else if (arg === "--seed") out.seed = String(argv[++i]);
    else throw new Error(`Argumento desconocido: ${arg}`);
  }

  if (!out.runtimeRows) throw new Error("Falta --runtime-rows");
  return out;
}

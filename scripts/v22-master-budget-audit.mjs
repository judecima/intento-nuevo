#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
const source = resolve(String(args.source ?? "experiencia/v6/hotspot-all.jsonl"));
const postV20Path = typeof args.postV20 === "string" ? resolve(args.postV20) : null;
const outPath = typeof args.out === "string" ? resolve(args.out) : null;

if (!existsSync(source)) throw new Error(`no existe source: ${source}`);
if (postV20Path && !existsSync(postV20Path)) throw new Error(`no existe postV20: ${postV20Path}`);

const rows = readJsonl(source).filter((row) => row && row.engineCacheHit !== true);
const postV20 = postV20Path ? new Map(readJsonl(postV20Path).filter((r) => r?.file).map((r) => [r.file, r])) : null;

const records = rows.map((row) => {
  const master = masterMetrics(row);
  const savedBoards = +(master.placasAhorradas ?? 0) || 0;
  const preMasterBoards = (+row.boards || 0) + savedBoards;
  const cota = +row.cota || 0;
  const gap = Math.max(0, preMasterBoards - cota);
  const masterMs = +(row.masterMs ?? master.ms ?? 0) || 0;
  const generationMs = +(row?.stageMs?.masterGenerarPatrones ?? 0) || 0;
  const monotypeMs = +(row?.stageMs?.masterPatronesMonotipo ?? 0) || 0;
  const solveMs = +(row?.stageMs?.masterResolverCobertura ?? 0) || 0;
  const materializeMs = +(row?.stageMs?.masterMaterializar ?? 0) || 0;
  const activated = +(master.activaciones ?? 0) > 0 || masterMs > 0;
  const boardWin = savedBoards > 0;
  const v20row = postV20?.get(row.file) ?? null;
  const v20Known = v20row !== null;
  const v20Certified = v20row ? isCertifiedAfterBaseline(v20row) : false;
  return {
    file: row.file,
    boards: +row.boards || 0,
    preMasterBoards,
    cota,
    gap,
    activated,
    boardWin,
    savedBoards,
    masterMs,
    generationMs,
    monotypeMs,
    solveMs,
    materializeMs,
    v20Known,
    v20Certified,
  };
});

const activated = records.filter((r) => r.activated);
const survivors = postV20 ? activated.filter((r) => !r.v20Certified) : activated;
const knownWins = activated.filter((r) => r.boardWin);
const matchedV20 = postV20 ? activated.filter((r) => r.v20Known) : [];

const byGap = aggregateByGap(activated);
const survivorByGap = aggregateByGap(survivors);
const policies = [1, 2, 3, 4, 5].map((maxGap) => simulateMaxGap(survivors, maxGap));

const totals = aggregate(activated);
const survivorTotals = aggregate(survivors);
const summary = {
  source,
  postV20: postV20Path,
  cases: records.length,
  masterActivations: activated.length,
  masterBoardWins: knownWins.length,
  masterBoardsSaved: sum(knownWins, "savedBoards"),
  knownWins: knownWins.map((r) => ({
    file: r.file,
    preMasterBoards: r.preMasterBoards,
    boards: r.boards,
    cota: r.cota,
    gap: r.gap,
    masterMs: r.masterMs,
  })),
  masterCost: totals,
  byGap,
  v20: postV20 ? {
    candidateRows: postV20.size,
    matchedHistoricalMasterActivations: matchedV20.length,
    matchedActivationCoveragePct: pct(matchedV20.length, activated.length),
    certifiedAmongHistoricalMasterActivations: activated.filter((r) => r.v20Certified).length,
    survivingMasterActivations: survivors.length,
    survivingMasterCost: survivorTotals,
    survivingByGap: survivorByGap,
    note: postV20.size < records.length
      ? "postV20 parcial: filas ausentes se tratan como no certificadas; no interpretar survivingMasterCost como estimacion final."
      : "postV20 cubre toda la cohorte.",
  } : null,
  solverBudgetObservation: {
    generationPlusMonotypeMs: survivorTotals.generationMs + survivorTotals.monotypeMs,
    solveMs: survivorTotals.solveMs,
    generationSharePct: pct(survivorTotals.generationMs + survivorTotals.monotypeMs, survivorTotals.masterMs),
    solveSharePct: pct(survivorTotals.solveMs, survivorTotals.masterMs),
    note: "msMaster limita resolverCobertura; no limita generarPatrones. Si generationSharePct domina, bajar msMaster no ataca el hotspot principal.",
  },
  counterfactualMaxGapPolicies: policies,
  fixedRoadmapGate: {
    boardsOnFrozenCohort: 2371,
    maxPatternMasterMs: 6500000,
    maxTotalMs: 9000000,
    regressionsAllowed: 0,
    invalidPlansAllowed: 0,
    sentinels: [
      "4050594__Mega_Maderas4050594.xml",
      "4058501__Marcos _Cumini Londero4058501.xml",
    ],
  },
};

console.log(JSON.stringify(summary, null, 2));
if (outPath) writeFileSync(outPath, JSON.stringify(summary, null, 2) + "\n");

function simulateMaxGap(rows, maxGap) {
  const run = rows.filter((r) => r.gap <= maxGap);
  const skipped = rows.filter((r) => r.gap > maxGap);
  const lostWins = skipped.filter((r) => r.boardWin);
  const totalMs = sum(rows, "masterMs");
  const keptMs = sum(run, "masterMs");
  return {
    policy: `run Master only when gap <= ${maxGap}`,
    maxGap,
    activationsKept: run.length,
    activationsSkipped: skipped.length,
    masterMsKept: keptMs,
    masterMsSaved: totalMs - keptMs,
    masterMsSavedPct: pct(totalMs - keptMs, totalMs),
    historicalBoardWinsLost: lostWins.length,
    historicalBoardsLost: sum(lostWins, "savedBoards"),
    lostWinFiles: lostWins.map((r) => r.file),
  };
}

function aggregateByGap(rows) {
  const buckets = new Map();
  for (const row of rows) {
    const key = row.gap >= 5 ? "5+" : String(row.gap);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  }
  return Object.fromEntries([...buckets.entries()]
    .sort(([a], [b]) => gapOrder(a) - gapOrder(b))
    .map(([key, list]) => [key, aggregate(list)]));
}

function aggregate(rows) {
  return {
    activations: rows.length,
    wins: rows.filter((r) => r.boardWin).length,
    boardsSaved: sum(rows.filter((r) => r.boardWin), "savedBoards"),
    masterMs: sum(rows, "masterMs"),
    generationMs: sum(rows, "generationMs"),
    monotypeMs: sum(rows, "monotypeMs"),
    solveMs: sum(rows, "solveMs"),
    materializeMs: sum(rows, "materializeMs"),
  };
}

function masterMetrics(row) {
  return row?.metricas?.master ?? row?.metricasV10?.master ?? row?.master ?? {};
}

function isCertifiedAfterBaseline(row) {
  const lb = row?.metricasV10?.lowerBound ?? row?.metricas?.lowerBound ?? row?.lowerBound ?? {};
  return +(row?.cheapCertified ?? lb.cheapCertified ?? 0) > 0 ||
    +(row?.certifiedAfterBaseline ?? lb.certifiedAfterBaseline ?? 0) > 0;
}

function readJsonl(path) {
  return readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error(`${path}:${index + 1}: ${error.message}`); }
  });
}

function sum(rows, key) {
  return rows.reduce((acc, row) => acc + (+row[key] || 0), 0);
}
function pct(part, total) {
  return total > 0 ? part / total * 100 : 0;
}
function gapOrder(key) {
  return key === "5+" ? 5 : +key;
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

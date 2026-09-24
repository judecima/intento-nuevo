#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_CONTROL_SIZE = 300;
const DEFAULT_TAIL_SIZE = 50;

export function prepareValidationSelection(
  outputDir,
  { controlSize = DEFAULT_CONTROL_SIZE, tailSize = DEFAULT_TAIL_SIZE } = {},
) {
  const root = resolve(outputDir);
  const metaPath = join(root, "FULL_RUNTIME_VALIDATION_META.json");
  const rowsPath = join(root, "FULL_RUNTIME_VALIDATION_ROWS.jsonl");
  const selectionPath = join(root, "FULL_RUNTIME_VALIDATION_SELECTION.jsonl");
  const queuePath = join(root, "FULL_RUNTIME_VALIDATION_V1_QUEUE.jsonl");
  const summaryPath = join(root, "FULL_RUNTIME_VALIDATION_SELECTION_SUMMARY.json");

  if (!existsSync(metaPath) || !existsSync(rowsPath)) {
    throw new Error(
      "Faltan META o ROWS de la pasada Auto. Ejecuta primero optimizer:validate:auto.",
    );
  }

  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  if (meta.complete !== true) {
    throw new Error(
      "La pasada Auto todavia no esta completa. No se construye la seleccion V1 sobre un corpus parcial.",
    );
  }

  const rows = readJsonl(rowsPath);
  const entries = rows.map(classifyRow);
  const proven = entries.filter((entry) => entry.selectionReason === "PROVEN_ROUTE");
  const controlKeys = selectControlSample(proven, controlSize, tailSize);

  for (const entry of entries) {
    if (!controlKeys.has(entry.caseKey)) continue;
    entry.selectionReason = "CONTROL_SAMPLE";
    entry.comparisonStatus = "PENDING";
    entry.proofScope = "CONTROL";
    pushUnique(entry.reasonCodes, "CONTROL_STRATIFIED");
    if (controlKeys.get(entry.caseKey)?.slowTail) {
      pushUnique(entry.reasonCodes, "CONTROL_SLOW_TAIL");
    }
  }

  const queue = entries.filter(
    (entry) =>
      entry.selectionReason === "REVIEW_REQUIRED" ||
      entry.selectionReason === "CONTROL_SAMPLE",
  );

  writeJsonl(selectionPath, entries);
  writeJsonl(queuePath, queue);

  const summary = {
    schema: "optimizer-validation-selection-summary-v1",
    generatedAt: new Date().toISOString(),
    sourceGit: meta.git?.head ?? null,
    processedRows: rows.length,
    candidateValid: rows.filter((row) => row.candidate?.valid).length,
    skipped: entries.filter((entry) => entry.selectionReason === "SKIPPED").length,
    reviewRequired: entries.filter((entry) => entry.selectionReason === "REVIEW_REQUIRED").length,
    provenRouteBoardCountOnly: entries.filter((entry) => entry.selectionReason === "PROVEN_ROUTE").length,
    controlSample: entries.filter((entry) => entry.selectionReason === "CONTROL_SAMPLE").length,
    v1Queue: queue.length,
    reasons: countReasonCodes(entries),
    routes: countBy(entries, (entry) => entry.route),
    control: {
      requestedSize: controlSize,
      requestedSlowTail: tailSize,
      strata: new Set(
        entries
          .filter((entry) => entry.selectionReason === "CONTROL_SAMPLE")
          .map((entry) => entry.stratum),
      ).size,
    },
    semantics: {
      REVIEW_REQUIRED:
        "V1 must be executed because board-count or remnant parity is not structurally established.",
      PROVEN_ROUTE:
        "Only board-count optimality is structurally established by a global admissible lower bound on a no-Master route. Remnant parity is not claimed without V1.",
      CONTROL_SAMPLE:
        "Case otherwise eligible for PROVEN_ROUTE but intentionally compared with V1 as a stratified audit.",
      comparisonStatus:
        "PENDING means queued for V1; NOT_RUN means no V1 execution is claimed.",
    },
  };
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + "\n");

  return { entries, queue, summary, selectionPath, queuePath, summaryPath };
}

function classifyRow(row) {
  const candidateBoards = row.candidate?.boards;
  const globalLowerBound = row.candidate?.lowerBound;
  const leptonBoards = row.leptonBoards;
  const auto = row.auto ?? {};
  const reasonCodes = [];

  const base = {
    schema: "optimizer-validation-selection-row-v1",
    caseKey: row.caseKey,
    caseId: row.caseId,
    fileName: row.fileName,
    source: row.source,
    relativePath: row.relativePath,
    typeCount: row.typeCount,
    pieceCount: row.pieceCount,
    leptonBoards,
    candidateBoards,
    globalLowerBound,
    candidateRemnant: row.candidate?.remnant ?? null,
    candidateWallMs: row.candidate?.wallMs ?? null,
    auto,
    lowerBoundRoute: row.lowerBoundRoute ?? null,
    route: routeOf(row),
    typeBucket: typeBucket(row.typeCount),
    pieceBucket: pieceBucket(row.pieceCount),
    stratum: null,
    selectionReason: "REVIEW_REQUIRED",
    comparisonStatus: "PENDING",
    proofScope: "DIRECT_COMPARISON_REQUIRED",
    reasonCodes,
  };
  base.stratum = `${base.route}|${base.typeBucket}|${base.pieceBucket}`;

  if (row.status === "SKIP") {
    base.selectionReason = "SKIPPED";
    base.comparisonStatus = "NOT_RUN";
    base.proofScope = "NONE";
    reasonCodes.push("CANONICAL_PARSE_SKIP");
    return base;
  }

  if (!row.candidate?.valid || row.failures?.includes("exception")) {
    reasonCodes.push("CANDIDATE_INVALID_OR_EXCEPTION");
    return base;
  }

  if (!Number.isFinite(candidateBoards)) {
    reasonCodes.push("CANDIDATE_BOARD_COUNT_MISSING");
    return base;
  }

  if (Number.isFinite(leptonBoards) && candidateBoards > leptonBoards) {
    reasonCodes.push("WORSE_THAN_LEPTON");
  }

  if (!Number.isFinite(globalLowerBound)) {
    reasonCodes.push("NO_GLOBAL_LB");
  } else if (candidateBoards < globalLowerBound) {
    reasonCodes.push("GLOBAL_LB_CONTRADICTION");
  } else if (candidateBoards > globalLowerBound) {
    reasonCodes.push("ABOVE_GLOBAL_LB");
  }

  if (auto.stopReason === "certified-industrial-p3") {
    reasonCodes.push("P3_EARLY_STOP");
  }

  if (auto.enteredMaster === true) {
    reasonCodes.push("MASTER_ENTERED");
    if (
      Number.isFinite(auto.preMasterBoards) &&
      candidateBoards < auto.preMasterBoards
    ) {
      reasonCodes.push("MASTER_REDUCED_BOARDS");
    }
    if (Number.isFinite(auto.roundsExecuted) && auto.roundsExecuted < 40) {
      reasonCodes.push("MASTER_EARLY_STOP");
    }
  }

  // Conservative rule: every Master case is compared with V1. This directly
  // covers remnant differences and all P3/early-stop behavior without claiming
  // that a lower bound certifies equal-board physical quality.
  if (auto.enteredMaster === true) return base;

  // Any uncertainty in the global board-count proof remains REVIEW_REQUIRED.
  if (
    !Number.isFinite(globalLowerBound) ||
    candidateBoards !== globalLowerBound ||
    reasonCodes.includes("WORSE_THAN_LEPTON")
  ) {
    return base;
  }

  // No Master + global admissible LB reached. This proves the primary objective
  // only. Because the common baseline can still contain wall-clock bounded Beam
  // or Rescue work, remnant parity is deliberately NOT inferred.
  base.selectionReason = "PROVEN_ROUTE";
  base.comparisonStatus = "NOT_RUN";
  base.proofScope = "BOARD_COUNT_ONLY";
  reasonCodes.push("GLOBAL_LB_REACHED_NO_MASTER");
  return base;
}

function routeOf(row) {
  const lb = row.lowerBoundRoute ?? {};
  if (row.auto?.enteredMaster === true) {
    return `MASTER:${row.auto?.stopReason ?? "unknown"}`;
  }
  if (Number(lb.certifiedAfterBaseline) > 0) return "LB_AFTER_BASELINE";
  if (Number(lb.certifiedAfterCompactation) > 0) return "LB_AFTER_COMPACTION";
  if (Number(lb.postCompactCertified) > 0) return "LB_POST_COMPACTION";
  if (Number(lb.cheapCertified) > 0) return "CHEAP_LB";
  return "NO_MASTER_GLOBAL_LB";
}

function selectControlSample(entries, requestedSize, requestedTailSize) {
  const chosen = new Map();
  if (!entries.length || requestedSize <= 0) return chosen;

  const target = Math.min(entries.length, Math.max(1, Math.floor(requestedSize)));
  const tailSize = Math.min(target, Math.max(0, Math.floor(requestedTailSize)));
  const groups = new Map();

  for (const entry of entries) {
    const group = groups.get(entry.stratum) ?? [];
    group.push(entry);
    groups.set(entry.stratum, group);
  }

  for (const group of groups.values()) {
    group.sort((a, b) => stableRank(a).localeCompare(stableRank(b)));
  }

  // First cover every observed route/type/piece stratum when budget permits.
  for (const key of [...groups.keys()].sort()) {
    if (chosen.size >= target) break;
    const first = groups.get(key)?.[0];
    if (first) chosen.set(first.caseKey, { slowTail: false });
  }

  // Then force coverage of slow tails, because timing-dependent paths are the
  // most likely place for a repeated V1 run to expose instability.
  const slow = entries
    .slice()
    .sort((a, b) => (b.candidateWallMs ?? -1) - (a.candidateWallMs ?? -1));
  let tailAdded = 0;
  for (const entry of slow) {
    if (chosen.size >= target || tailAdded >= tailSize) break;
    const previous = chosen.get(entry.caseKey);
    chosen.set(entry.caseKey, { slowTail: true });
    if (!previous) tailAdded++;
  }

  // Round-robin the remaining strata to avoid one large population dominating.
  const offsets = new Map([...groups.keys()].map((key) => [key, 1]));
  while (chosen.size < target) {
    let added = false;
    for (const key of [...groups.keys()].sort()) {
      if (chosen.size >= target) break;
      const group = groups.get(key);
      let index = offsets.get(key) ?? 0;
      while (index < group.length && chosen.has(group[index].caseKey)) index++;
      offsets.set(key, index + 1);
      if (index >= group.length) continue;
      chosen.set(group[index].caseKey, { slowTail: false });
      added = true;
    }
    if (!added) break;
  }

  return chosen;
}

function stableRank(entry) {
  return createHash("sha256")
    .update(String(entry.caseKey), "utf8")
    .digest("hex");
}

function typeBucket(value) {
  if (!Number.isFinite(value)) return "unknown";
  if (value === 1) return "1";
  if (value <= 3) return "2-3";
  if (value <= 10) return "4-10";
  if (value <= 20) return "11-20";
  if (value <= 40) return "21-40";
  return ">40";
}

function pieceBucket(value) {
  if (!Number.isFinite(value)) return "unknown";
  if (value <= 50) return "<=50";
  if (value <= 120) return "51-120";
  return ">120";
}

function countReasonCodes(entries) {
  const out = {};
  for (const entry of entries) {
    for (const code of entry.reasonCodes ?? []) {
      out[code] = (out[code] ?? 0) + 1;
    }
  }
  return out;
}

function countBy(entries, getter) {
  const out = {};
  for (const entry of entries) {
    const value = getter(entry);
    if (value == null || value === "") continue;
    out[value] = (out[value] ?? 0) + 1;
  }
  return out;
}

function pushUnique(array, value) {
  if (!array.includes(value)) array.push(value);
}

function readJsonl(path) {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function writeJsonl(path, rows) {
  writeFileSync(path, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""));
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const output = process.argv[2] ?? join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "validation-full");
  const result = prepareValidationSelection(output);
  console.log(result.summaryPath);
  console.log(result.queuePath);
}

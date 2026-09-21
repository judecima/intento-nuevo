"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../..");
const CANONICAL_PATH = path.join(ROOT, "experiencia/canonical_cases.json");
const MANIFEST_PATH = path.join(ROOT, "research/optimizer/master-portfolio/MASTER_ACTIVE_323_MANIFEST_2026-09-18.json");
const FIXTURE_4056900 = path.join(ROOT, "research/optimizer/pattern-generators/guide-slice/INDUSTRIAL_PORTFOLIO_4056900_CHECKPOINT_2026-09-14.json");
const OUT_DIR = path.join(ROOT, "research/optimizer/master-portfolio/out");
const OUT_PATH = path.join(OUT_DIR, "MASTER_MANDATORY_TYPE_PRUNE_2026-09-21.json");

const THRESHOLD = Number(process.env.MASTER_GATE_MULT || 4.75);

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function basename(v) {
  return typeof v === "string" ? v.replaceAll("\\", "/").split("/").pop() : null;
}
function qty(p) {
  for (const k of ["quantity", "qty", "count", "cant", "num", "q", "qMin"]) {
    const n = Number(p?.[k]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 1;
}
function dims(p) {
  return {
    w: num(p?.width ?? p?.base ?? p?.l ?? p?.L),
    h: num(p?.height ?? p?.altura ?? p?.w ?? p?.W),
  };
}
function features(row) {
  const ps = Array.isArray(row.pieces) ? row.pieces : [];
  const pieceCount = num(row.piece_count, ps.reduce((s, p) => s + qty(p), 0));
  const typeCount = num(row.piece_types, ps.length);
  return {
    file: basename(row.source_path || ((row.case_id || "") + ".xml")),
    pieceCount,
    typeCount,
  };
}
function gateV2(m) {
  const gap = num(m.preMasterBoards) - num(m.lowerBound);
  const mult = num(m.typeCount) > 0 ? num(m.pieces) / num(m.typeCount) : 0;
  return gap > 1 || mult >= THRESHOLD;
}
function schedule(typeCount, rounds = 40, seed = 7) {
  let s = seed >>> 0;
  const R = () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return (s & 0x7fffffff) / 0x7fffffff;
  };
  const out = [];
  for (let r = 0; r < rounds; r++) {
    const mask = r === 0
      ? Array.from({ length: typeCount }, (_, i) => i)
      : Array.from({ length: typeCount }, (_, i) => i).filter(() => R() > 0.45);
    out.push(mask);
  }
  return out;
}
function synthetic4056900() {
  const cp = JSON.parse(fs.readFileSync(FIXTURE_4056900, "utf8")).source;
  return {
    case_id: "4056900__Alfredo_Arrua4056900",
    source_path: cp.file,
    stock_width: cp.board.width,
    stock_height: cp.board.height,
    piece_count: cp.pieceQuantity,
    piece_types: cp.pieceTypes,
    pieces: cp.lines.map(x => ({ base: x.width, altura: x.height, cant: x.quantity })),
    _syntheticFrozen: true,
  };
}
function synthetic4057401() {
  return {
    case_id: "4057401__GABRIEL_TUMBACO CRUZ4057401",
    source_path: "4057401__GABRIEL_TUMBACO CRUZ4057401.xml",
    stock_width: 2742,
    stock_height: 1822,
    piece_count: 19,
    piece_types: 4,
    pieces: [
      { base: 1800, altura: 1050, cant: 2 },
      { base: 2000, altura: 1100, cant: 2 },
      { base: 1900, altura: 1500, cant: 1 },
      { base: 744, altura: 450, cant: 14 },
    ],
    _syntheticFrozen: true,
  };
}

function analyze(m, row) {
  const f = features(row);
  const boardArea = num(row.stock_width) * num(row.stock_height);
  const improvementTargetBoards = num(m.preMasterBoards) - 1;
  if (!(boardArea > 0) || improvementTargetBoards < 1) return null;

  const mandatory = [];
  for (let i = 0; i < row.pieces.length; i++) {
    const p = row.pieces[i];
    const d = dims(p);
    const pieceArea = d.w * d.h;
    const demand = qty(p);
    if (!(pieceArea > 0) || demand <= 0) continue;

    // Safe optimistic per-board capacity. It ignores kerf, guillotine stages,
    // orientation restrictions and fragmentation, so it can only OVERestimate
    // real capacity. If the type is mandatory even under this optimistic bound,
    // it is mandatory in every real improving solution too.
    const upperPerBoard = Math.floor(boardArea / pieceArea);
    if (upperPerBoard < 1) continue;

    if ((improvementTargetBoards - 1) * upperPerBoard < demand) {
      mandatory.push({
        typeIndex: i,
        demand,
        upperPerBoard,
        proofLhs: (improvementTargetBoards - 1) * upperPerBoard,
      });
    }
  }

  const masks = schedule(f.typeCount);
  const nonEmpty = masks
    .map((mask, round) => ({ round, mask }))
    .filter(x => x.mask.length > 0);
  const skippable = mandatory.length
    ? nonEmpty.filter(x => mandatory.some(t => !x.mask.includes(t.typeIndex)))
    : [];

  return {
    order: m.order,
    file: f.file,
    features: f,
    historical: {
      preMasterBoards: num(m.preMasterBoards),
      finalBoards: num(m.finalBoards),
      lowerBound: num(m.lowerBound),
      masterWin: Boolean(m.masterWin),
      generationMs: num(m.generationMs),
    },
    improvementTargetBoards,
    mandatory,
    nonEmptyRounds: nonEmpty.length,
    skippableRounds: skippable.map(x => x.round),
    skippableCount: skippable.length,
    executableCount: nonEmpty.length - skippable.length,
    projectedGenerationSavedMsLinear:
      num(m.generationMs) * (skippable.length / 40),
  };
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const raw = JSON.parse(fs.readFileSync(CANONICAL_PATH, "utf8"));
  const all = Array.isArray(raw) ? raw : raw.cases || [];
  const byFile = new Map(all.map(row => [features(row).file, row]));

  const survivors = (manifest.cases || []).filter(gateV2);
  const records = [];
  const unavailable = [];

  for (const m of survivors) {
    let row =
      num(m.order) === 4056900 ? synthetic4056900() :
      num(m.order) === 4057401 ? synthetic4057401() :
      byFile.get(basename(m.file));

    if (!row) {
      row = all.find(r => String(r.case_id || r.source_path || "").includes(String(m.order)));
    }
    if (!row) {
      unavailable.push({ order: m.order, reason: "missing-canonical-row" });
      continue;
    }

    const f = features(row);
    if (f.pieceCount !== num(m.pieces) || f.typeCount !== num(m.typeCount)) {
      unavailable.push({
        order: m.order,
        reason: "snapshot-mismatch",
        historical: { pieces: num(m.pieces), typeCount: num(m.typeCount) },
        current: { pieces: f.pieceCount, typeCount: f.typeCount },
      });
      continue;
    }

    const rec = analyze(m, row);
    if (rec) records.push(rec);
  }

  const withMandatory = records.filter(r => r.mandatory.length > 0);
  const sum = (xs, fn) => xs.reduce((s, x) => s + num(fn(x)), 0);
  const historicalGenerationMs = sum(records, r => r.historical.generationMs);
  const projectedSavedMs = sum(withMandatory, r => r.projectedGenerationSavedMsLinear);

  const result = {
    schema: "master-mandatory-type-prune-v1",
    generatedAt: new Date().toISOString(),
    proof: {
      targetBoards: "B = preMasterBoards - 1; every accepted Master improvement uses <= B boards",
      upperCapacity: "U_i = floor(fullStockArea / pieceArea_i), deliberately optimistic",
      mandatoryCondition: "(B - 1) * U_i < demand_i",
      roundSkip: "if a round mask omits any mandatory type, no pattern from that round can belong to any <=B-board solution",
      safetyNote: "projection assumes linear generation cost per round; safety of the skip does not depend on that timing assumption",
    },
    counts: {
      gateV2Survivors: survivors.length,
      exactSnapshotsAnalyzed: records.length,
      unavailable: unavailable.length,
      withMandatoryType: withMandatory.length,
      totalSkippableRounds: sum(withMandatory, r => r.skippableCount),
      affectedHistoricalWinners: withMandatory.filter(r => r.historical.masterWin).map(r => r.order),
    },
    timingProjection: {
      historicalGenerationMs,
      projectedSavedMsLinear: projectedSavedMs,
      projectedSavedPctOfAnalyzedGeneration:
        historicalGenerationMs ? projectedSavedMs / historicalGenerationMs : null,
    },
    topOpportunities: withMandatory
      .slice()
      .sort((a, b) => b.projectedGenerationSavedMsLinear - a.projectedGenerationSavedMsLinear)
      .slice(0, 20)
      .map(r => ({
        order: r.order,
        types: r.features.typeCount,
        pieces: r.features.pieceCount,
        mandatoryTypes: r.mandatory.length,
        skippableRounds: r.skippableCount,
        executableRounds: r.executableCount,
        generationMs: r.historical.generationMs,
        projectedSavedMsLinear: r.projectedGenerationSavedMsLinear,
        masterWin: r.historical.masterWin,
      })),
    unavailable,
    records,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2) + "\n", "utf8");
  console.log("MANDATORY_TYPE_SUMMARY", JSON.stringify({
    counts: result.counts,
    timingProjection: result.timingProjection,
    topOpportunities: result.topOpportunities.slice(0, 10),
  }));
}

main();

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../..");
const CANONICAL_PATH = path.join(ROOT, "experiencia/canonical_cases.json");
const MANIFEST_PATH = path.join(
  ROOT,
  "research/optimizer/master-portfolio/MASTER_ACTIVE_323_MANIFEST_2026-09-18.json",
);
const OUT_DIR = path.join(ROOT, "research/optimizer/master-portfolio/out");
const SUMMARY_PATH = path.join(OUT_DIR, "MASTER_GATE_CRIBA_V1_2026-09-21.json");
const CSV_PATH = path.join(OUT_DIR, "MASTER_GATE_CRIBA_V1_FEATURES_2026-09-21.csv");

function basename(value) {
  return typeof value === "string" ? value.replaceAll("\\", "/").split("/").pop() : null;
}

function orderNumber(value) {
  const name = basename(value ?? "");
  const runs = name?.replace(/\.xml$/i, "").match(/\d+/g);
  if (!runs?.length) return null;
  const last = runs[runs.length - 1];
  return Number(last.length > 7 ? last.slice(-7) : last);
}

function asNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function boolTrue(value) {
  return value === true || value === 1 || value === "1" || value === "true" || value === "TRUE";
}

function quantile(values, q) {
  if (!values.length) return null;
  const xs = values.slice().sort((a, b) => a - b);
  const pos = (xs.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return xs[lo];
  return xs[lo] + (xs[hi] - xs[lo]) * (pos - lo);
}

function mean(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function std(values) {
  if (!values.length) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length);
}

function median(values) {
  return quantile(values, 0.5);
}

function discoverCaseArray(raw) {
  if (Array.isArray(raw)) return raw.map((value, index) => ({ value, key: String(index) }));
  if (!raw || typeof raw !== "object") return [];

  for (const key of ["cases", "records", "items", "data"]) {
    if (Array.isArray(raw[key])) return raw[key].map((value, index) => ({ value, key: String(index) }));
  }

  const entries = Object.entries(raw);
  const objectEntries = entries.filter(([, value]) => value && typeof value === "object" && !Array.isArray(value));
  if (objectEntries.length >= Math.max(1, entries.length * 0.5)) {
    return objectEntries.map(([key, value]) => ({ value, key }));
  }
  return [];
}

function unwrap(entry) {
  const row = entry.value ?? {};
  const canonical =
    row.case ??
    row.canonicalCase ??
    row.canonical ??
    row.optimizationCase ??
    row.data?.case ??
    row.data?.canonicalCase ??
    row;

  const rawFile =
    row.file ??
    row.fileName ??
    row.filename ??
    row.sourceFile ??
    row.name ??
    canonical.file ??
    canonical.fileName ??
    canonical.filename ??
    row.case_id ??
    row.caseId ??
    row.id ??
    (entry.key?.toLowerCase().endsWith(".xml") ? entry.key : null);

  let file = basename(rawFile);
  if (file && !file.toLowerCase().endsWith(".xml") && /\\d/.test(file)) file += ".xml";

  const pieces = Array.isArray(canonical.pieces)
    ? canonical.pieces
    : Array.isArray(row.pieces)
      ? row.pieces
      : Array.isArray(row.piece_types_data)
        ? row.piece_types_data
        : Array.isArray(row.types)
          ? row.types
          : [];

  return { row, canonical, file, pieces };
}

function qty(piece) {
  for (const key of ["quantity", "qty", "count", "num", "q", "qMin"]) {
    const n = asNumber(piece?.[key]);
    if (n != null && n > 0) return n;
  }
  return 1;
}

function width(piece) {
  return asNumber(piece?.width ?? piece?.base ?? piece?.l ?? piece?.L, 0);
}

function height(piece) {
  return asNumber(piece?.height ?? piece?.altura ?? piece?.w ?? piece?.W, 0);
}

function grainBlock(row, canonical, pieces) {
  const directional =
    row?.directional_input ??
    row?.directional ??
    row?.has_grain ??
    row?.hasGrain ??
    canonical?.directional_input;
  if (directional != null) return boolTrue(directional);

  const materialHasGrain = boolTrue(canonical?.material?.hasGrain);
  const explicitNoRotate = pieces.some((p) => p?.rotationAllowed === false || p?.canRotate === false);
  const explicitGrain = pieces.some((p) => boolTrue(p?.grain));
  return explicitNoRotate || (materialHasGrain && explicitGrain);
}

function geometryFeatures(entry) {
  const { row, canonical, pieces, file } = unwrap(entry);
  const quantities = pieces.map(qty);
  const inferredPieceCount = quantities.reduce((a, b) => a + b, 0);
  const pieceCount =
    asNumber(row?.piece_count) ??
    asNumber(row?.pieceCount) ??
    asNumber(row?.pieces_count) ??
    asNumber(row?.pieces) ??
    asNumber(canonical?.piece_count) ??
    inferredPieceCount;
  const typeCount =
    asNumber(row?.type_count) ??
    asNumber(row?.typeCount) ??
    asNumber(row?.piece_types) ??
    asNumber(row?.pieceTypes) ??
    asNumber(canonical?.type_count) ??
    (pieces.length || 0);
  const multiplicityMean = typeCount ? pieceCount / typeCount : 0;
  const multiplicityMax =
    asNumber(row?.multiplicity_max) ??
    asNumber(row?.max_multiplicity) ??
    (quantities.length ? Math.max(...quantities) : multiplicityMean);
  const multiplicityMedian =
    asNumber(row?.multiplicity_median) ??
    (quantities.length ? (median(quantities) ?? 0) : multiplicityMean);
  const multiplicityCv =
    asNumber(row?.multiplicity_cv) ??
    (mean(quantities) ? std(quantities) / mean(quantities) : 0);

  const rows = pieces.map((p, i) => {
    const q = quantities[i];
    const w = width(p);
    const h = height(p);
    const area = Math.max(0, w) * Math.max(0, h);
    const aspect = Math.min(w, h) > 0 ? Math.max(w, h) / Math.min(w, h) : 0;
    return { q, w, h, area, aspect };
  });

  const totalArea = rows.reduce((s, r) => s + r.area * r.q, 0);
  const typeAreas = rows.map((r) => r.area * r.q).sort((a, b) => b - a);
  const top1AreaShare = totalArea ? (typeAreas[0] ?? 0) / totalArea : 0;
  const top3AreaShare = totalArea ? typeAreas.slice(0, 3).reduce((a, b) => a + b, 0) / totalArea : 0;
  const top1QtyShare = pieceCount ? multiplicityMax / pieceCount : 0;
  const repeatedPieceShare = pieceCount
    ? rows.filter((r) => r.q >= 2).reduce((s, r) => s + r.q, 0) / pieceCount
    : 0;
  const repeatedTypeShare = typeCount ? rows.filter((r) => r.q >= 2).length / typeCount : 0;
  const longThinPieceShare = pieceCount
    ? rows.filter((r) => r.aspect >= 4).reduce((s, r) => s + r.q, 0) / pieceCount
    : 0;

  const dimKeys = new Set(
    rows.map((r) => {
      const a = Math.min(r.w, r.h);
      const b = Math.max(r.w, r.h);
      return a.toFixed(3) + "x" + b.toFixed(3);
    }),
  );
  const uniqueDimensionRatio = typeCount ? dimKeys.size / typeCount : 0;

  const rotatableCount = pieces.reduce((s, p, i) => {
    const allowed = p?.rotationAllowed ?? p?.canRotate;
    return s + (allowed === false ? 0 : quantities[i]);
  }, 0);

  const panelW = asNumber(canonical?.panel?.width ?? canonical?.board?.width, 0);
  const panelH = asNumber(canonical?.panel?.height ?? canonical?.board?.height, 0);
  const panelArea = panelW * panelH;

  return {
    file,
    order: orderNumber(file),
    source: canonical?.source ?? null,
    panelW,
    panelH,
    panelArea,
    pieceCount,
    typeCount,
    multiplicityMean,
    multiplicityMax,
    multiplicityMedian,
    multiplicityCv,
    repeatedPieceShare,
    repeatedTypeShare,
    top1QtyShare,
    top1AreaShare,
    top3AreaShare,
    uniqueDimensionRatio,
    longThinPieceShare,
    rotatablePieceShare: pieceCount ? rotatableCount / pieceCount : 0,
    grainBlocking: grainBlock(row, canonical, pieces),
    materialHasGrain:
      row?.directional_input === true ||
      row?.directional === true ||
      canonical?.material?.hasGrain === true,
    totalArea,
    areaPerPieceMean: pieceCount ? totalArea / pieceCount : 0,
  };
}

function matchCanonical(canonicalFeatures, manifestCases) {
  const byFile = new Map();
  for (const row of canonicalFeatures) {
    if (!row.file) continue;
    const arr = byFile.get(row.file) ?? [];
    arr.push(row);
    byFile.set(row.file, arr);
  }

  const exact = [];
  const mismatch = [];
  for (const m of manifestCases) {
    const matches = byFile.get(basename(m.file)) ?? [];
    if (!matches.length) {
      mismatch.push({ order: m.order, file: m.file, reason: "filename-missing" });
      continue;
    }
    const same = matches.find((c) => c.pieceCount === m.pieces && c.typeCount === m.typeCount);
    if (!same) {
      mismatch.push({
        order: m.order,
        file: m.file,
        reason: "piece-type-mismatch",
        manifest: { pieces: m.pieces, typeCount: m.typeCount },
        canonical: matches.map((c) => ({ pieces: c.pieceCount, typeCount: c.typeCount })),
      });
      continue;
    }
    exact.push({
      ...same,
      finalBoards: m.finalBoards,
      lowerBound: m.lowerBound,
      preMasterBoards: m.preMasterBoards,
      gapPreMaster: m.preMasterBoards - m.lowerBound,
      masterWin: Boolean(m.masterWin),
      boardsSaved: m.boardsSaved ?? 0,
      generationMs: m.generationMs ?? 0,
      monotypeMs: m.monotypeMs ?? 0,
      solveMs: m.solveMs ?? 0,
    });
  }
  return { exact, mismatch };
}

const featureNames = [
  "pieceCount",
  "typeCount",
  "multiplicityMean",
  "multiplicityMax",
  "multiplicityMedian",
  "multiplicityCv",
  "repeatedPieceShare",
  "repeatedTypeShare",
  "top1QtyShare",
  "top1AreaShare",
  "top3AreaShare",
  "uniqueDimensionRatio",
  "longThinPieceShare",
  "rotatablePieceShare",
  "totalArea",
  "areaPerPieceMean",
];

function metrics(rows, predicate) {
  const positives = rows.filter((r) => r.masterWin);
  const negatives = rows.filter((r) => !r.masterWin);
  const tpRows = positives.filter(predicate);
  const fnRows = positives.filter((r) => !predicate(r));
  const fpRows = negatives.filter(predicate);
  const tnRows = negatives.filter((r) => !predicate(r));
  return {
    tp: tpRows.length,
    fn: fnRows.length,
    fp: fpRows.length,
    tn: tnRows.length,
    selected: tpRows.length + fpRows.length,
    recall: positives.length ? tpRows.length / positives.length : null,
    specificity: negatives.length ? tnRows.length / negatives.length : null,
    selectedPct: rows.length ? (tpRows.length + fpRows.length) / rows.length : null,
    tpOrders: tpRows.map((r) => r.order),
    fpOrders: fpRows.map((r) => r.order),
    fnOrders: fnRows.map((r) => r.order),
  };
}

function winnerBounds(rows) {
  const winners = rows.filter((r) => r.masterWin);
  const out = [];
  for (const name of featureNames) {
    const values = winners.map((r) => r[name]).filter(Number.isFinite);
    if (!values.length) continue;
    out.push({
      name,
      min: Math.min(...values),
      max: Math.max(...values),
      ge: (r) => Number.isFinite(r[name]) && r[name] >= Math.min(...values),
      le: (r) => Number.isFinite(r[name]) && r[name] <= Math.max(...values),
    });
  }
  return out;
}

function candidateSeparators(rows, seedPredicate) {
  const bounds = winnerBounds(rows);
  const results = [];
  for (const b of bounds) {
    for (const direction of ["ge", "le"]) {
      const bound = direction === "ge" ? b.min : b.max;
      const pred = (r) => seedPredicate(r) && b[direction](r);
      const m = metrics(rows, pred);
      if (m.fn === 0) {
        results.push({ feature: b.name, direction, bound, ...m });
      }
    }
  }
  return results.sort((a, b) => a.fp - b.fp || a.selected - b.selected || a.feature.localeCompare(b.feature));
}

function pairRules(rows) {
  const bounds = winnerBounds(rows);
  const atoms = [];
  for (const b of bounds) {
    atoms.push({ key: b.name + ">=" + b.min, pred: b.ge });
    atoms.push({ key: b.name + "<=" + b.max, pred: b.le });
  }
  atoms.push({ key: "grainBlocking=false", pred: (r) => !r.grainBlocking });

  const singles = atoms
    .map((a) => ({ atoms: [a.key], pred: a.pred, ...metrics(rows, a.pred) }))
    .filter((x) => x.fn === 0)
    .sort((a, b) => a.fp - b.fp || a.selected - b.selected);

  const bestAtoms = singles.slice(0, 18);
  const pairs = [];
  for (let i = 0; i < bestAtoms.length; i++) {
    for (let j = i + 1; j < bestAtoms.length; j++) {
      const p1 = bestAtoms[i].pred;
      const p2 = bestAtoms[j].pred;
      const pred = (r) => p1(r) && p2(r);
      const m = metrics(rows, pred);
      if (m.fn === 0) pairs.push({ atoms: [...bestAtoms[i].atoms, ...bestAtoms[j].atoms], pred, ...m });
    }
  }
  pairs.sort((a, b) => a.fp - b.fp || a.selected - b.selected || a.atoms.join("|").localeCompare(b.atoms.join("|")));
  return {
    singles: singles.slice(0, 20).map(({ pred, ...x }) => x),
    pairs: pairs.slice(0, 30).map(({ pred, ...x }) => x),
  };
}

function perturbation(rows) {
  const thresholds = [3.5, 3.75, 4, 4.25, 4.5, 4.75, 5, 5.25, 5.5, 6];
  return thresholds.map((threshold) => ({
    threshold,
    noGrain: metrics(rows, (r) => r.multiplicityMean >= threshold && !r.grainBlocking),
    multiplicityOnly: metrics(rows, (r) => r.multiplicityMean >= threshold),
  }));
}

function zStats(rows) {
  const out = {};
  for (const name of featureNames) {
    const values = rows.map((r) => r[name]).filter(Number.isFinite);
    out[name] = { mean: mean(values), std: std(values) || 1 };
  }
  return out;
}

function distance(a, b, stats) {
  let sum = 0;
  let n = 0;
  for (const name of featureNames) {
    if (!Number.isFinite(a[name]) || !Number.isFinite(b[name])) continue;
    const z = (a[name] - b[name]) / stats[name].std;
    sum += z * z;
    n++;
  }
  if (a.grainBlocking !== b.grainBlocking) sum += 2;
  return n ? Math.sqrt(sum / n) : Infinity;
}

function nearestNeighbors(rows, allCanonical) {
  const stats = zStats(allCanonical);
  return rows
    .filter((r) => r.masterWin)
    .map((winner) => {
      const candidates = allCanonical
        .filter((c) => c.file && c.file !== winner.file && c.typeCount > 0)
        .map((c) => ({ order: c.order, file: c.file, distance: distance(winner, c, stats), ...c }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 12)
        .map((c) => ({
          order: c.order,
          file: c.file,
          distance: Number(c.distance.toFixed(4)),
          pieceCount: c.pieceCount,
          typeCount: c.typeCount,
          multiplicityMean: c.multiplicityMean,
          multiplicityMax: c.multiplicityMax,
          grainBlocking: c.grainBlocking,
          repeatedPieceShare: c.repeatedPieceShare,
          top1AreaShare: c.top1AreaShare,
          top3AreaShare: c.top3AreaShare,
          uniqueDimensionRatio: c.uniqueDimensionRatio,
        }));
      return {
        order: winner.order,
        file: winner.file,
        features: Object.fromEntries(
          ["pieceCount", "typeCount", "multiplicityMean", "multiplicityMax", "grainBlocking", "repeatedPieceShare", "top1AreaShare", "top3AreaShare", "uniqueDimensionRatio"]
            .map((k) => [k, winner[k]]),
        ),
        nearest: candidates,
      };
    });
}

function distribution(rows, name) {
  const values = rows.map((r) => r[name]).filter(Number.isFinite);
  return {
    n: values.length,
    min: values.length ? Math.min(...values) : null,
    p10: quantile(values, 0.1),
    p25: quantile(values, 0.25),
    p50: quantile(values, 0.5),
    p75: quantile(values, 0.75),
    p90: quantile(values, 0.9),
    max: values.length ? Math.max(...values) : null,
    mean: values.length ? mean(values) : null,
  };
}

function csvEscape(value) {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
}

function writeCsv(rows) {
  const keys = [
    "order", "file", "masterWin", "gapPreMaster", "pieceCount", "typeCount",
    "multiplicityMean", "multiplicityMax", "multiplicityMedian", "multiplicityCv",
    "grainBlocking", "materialHasGrain", "repeatedPieceShare", "repeatedTypeShare",
    "top1QtyShare", "top1AreaShare", "top3AreaShare", "uniqueDimensionRatio",
    "longThinPieceShare", "rotatablePieceShare", "totalArea", "areaPerPieceMean",
    "generationMs", "monotypeMs", "solveMs",
  ];
  const lines = [keys.join(",")];
  for (const row of rows) lines.push(keys.map((k) => csvEscape(row[k])).join(","));
  fs.writeFileSync(CSV_PATH, lines.join("\n") + "\n", "utf8");
}

function roundDeep(value) {
  if (Array.isArray(value)) return value.map(roundDeep);
  if (!value || typeof value !== "object") {
    if (typeof value === "number" && Number.isFinite(value)) return Number(value.toFixed(6));
    return value;
  }
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, roundDeep(v)]));
}

function main() {
  const rawCanonical = JSON.parse(fs.readFileSync(CANONICAL_PATH, "utf8"));
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));

  const discovered = discoverCaseArray(rawCanonical);
  const diagnostics = discovered.slice(0, 3).map((entry) => {
    const row = entry.value ?? {};
    return {
      key: entry.key,
      keys: Object.keys(row).slice(0, 80),
      case_id: row.case_id ?? row.caseId ?? null,
      file: row.file ?? row.fileName ?? row.filename ?? null,
      piece_count: row.piece_count ?? row.pieceCount ?? null,
      type_count: row.type_count ?? row.typeCount ?? row.piece_types ?? null,
      directional_input: row.directional_input ?? row.directional ?? null,
      placementsShape: Array.isArray(row.placements)
        ? [row.placements.length, Array.isArray(row.placements[0]) ? row.placements[0].length : null]
        : null,
    };
  });
  const knownDiagnostics = discovered
    .filter((entry) => {
      const row = entry.value ?? {};
      const token = String(row.case_id ?? row.caseId ?? row.file ?? row.fileName ?? row.filename ?? "");
      return /4050594|4056900|4057401|4059200/.test(token);
    })
    .slice(0, 12)
    .map((entry) => {
      const row = entry.value ?? {};
      return {
        keys: Object.keys(row).slice(0, 80),
        case_id: row.case_id ?? row.caseId ?? null,
        file: row.file ?? row.fileName ?? row.filename ?? null,
        piece_count: row.piece_count ?? row.pieceCount ?? null,
        type_count: row.type_count ?? row.typeCount ?? row.piece_types ?? null,
        directional_input: row.directional_input ?? row.directional ?? null,
        pieceArrayLength: Array.isArray(row.pieces) ? row.pieces.length : null,
      };
    });
  console.log("CANONICAL_DIAGNOSTICS " + JSON.stringify(diagnostics));
  console.log("KNOWN_DIAGNOSTICS " + JSON.stringify(knownDiagnostics));

  const allCanonical = discovered.map(geometryFeatures).filter((r) => r.file && r.typeCount > 0);
  const matched = matchCanonical(allCanonical, manifest.cases ?? []);
  const gap1 = matched.exact.filter((r) => r.gapPreMaster === 1);

  const seed = (r) => r.multiplicityMean >= 4.75 && !r.grainBlocking;
  const seedMetrics = metrics(gap1, seed);
  const selected = gap1.filter(seed);
  const winners = gap1.filter((r) => r.masterWin);
  const negatives = gap1.filter((r) => !r.masterWin);

  const separators = candidateSeparators(gap1, seed);
  const ruleSearch = pairRules(gap1);

  const allSeedCount = allCanonical.filter(seed).length;
  const summary = {
    schema: "master-gate-criba-v1",
    generatedAt: new Date().toISOString(),
    sources: {
      canonicalPath: path.relative(ROOT, CANONICAL_PATH),
      manifestPath: path.relative(ROOT, MANIFEST_PATH),
      manifestSourceRef: manifest.sourceRef ?? null,
      manifestCount: manifest.count ?? manifest.cases?.length ?? null,
    },
    corpus: {
      discoveredRecords: discovered.length,
      usableCanonicalCases: allCanonical.length,
      exactManifestMatches: matched.exact.length,
      mismatches: matched.mismatch.length,
      gap1Exact: gap1.length,
      gap1Winners: winners.length,
      gap1NonWinners: negatives.length,
    },
    seedRule: {
      expression: "multiplicityMean >= 4.75 && grainBlocking == false",
      metrics: seedMetrics,
      selectedRows: selected.map((r) => ({
        order: r.order,
        file: r.file,
        masterWin: r.masterWin,
        multiplicityMean: r.multiplicityMean,
        multiplicityMax: r.multiplicityMax,
        typeCount: r.typeCount,
        pieceCount: r.pieceCount,
        grainBlocking: r.grainBlocking,
        repeatedPieceShare: r.repeatedPieceShare,
        top1AreaShare: r.top1AreaShare,
        top3AreaShare: r.top3AreaShare,
        uniqueDimensionRatio: r.uniqueDimensionRatio,
      })),
      allCanonicalPrevalence: {
        selected: allSeedCount,
        total: allCanonical.length,
        pct: allCanonical.length ? allSeedCount / allCanonical.length : null,
      },
      winnerMargin: winners.map((r) => ({
        order: r.order,
        multiplicityMean: r.multiplicityMean,
        marginAbove4_75: r.multiplicityMean - 4.75,
        grainBlocking: r.grainBlocking,
      })),
    },
    thresholdPerturbation: perturbation(gap1),
    seedThirdVariableCandidates: separators.slice(0, 25),
    boundedRuleSearch: ruleSearch,
    featureDistributions: Object.fromEntries(
      featureNames.map((name) => [
        name,
        {
          winners: distribution(winners, name),
          nonWinners: distribution(negatives, name),
          seedFalsePositives: distribution(selected.filter((r) => !r.masterWin), name),
        },
      ]),
    ),
    winners: winners.map((r) => Object.fromEntries(
      ["order", "file", "pieceCount", "typeCount", "multiplicityMean", "multiplicityMax", "multiplicityMedian",
       "multiplicityCv", "grainBlocking", "materialHasGrain", "repeatedPieceShare", "repeatedTypeShare",
       "top1QtyShare", "top1AreaShare", "top3AreaShare", "uniqueDimensionRatio", "longThinPieceShare",
       "rotatablePieceShare", "totalArea", "areaPerPieceMean"].map((k) => [k, r[k]]),
    )),
    nearestNeighbors: nearestNeighbors(gap1, allCanonical),
    mismatchSample: matched.mismatch.slice(0, 30),
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(roundDeep(summary), null, 2) + "\n", "utf8");
  writeCsv(gap1);

  console.log("=== MASTER GATE CRIBA V1 ===");
  console.log(JSON.stringify(roundDeep(summary.corpus)));
  console.log("SEED " + JSON.stringify(roundDeep(summary.seedRule.metrics)));
  console.log("SEED_SELECTED " + JSON.stringify(roundDeep(summary.seedRule.selectedRows)));
  console.log("PERTURBATION " + JSON.stringify(roundDeep(summary.thresholdPerturbation)));
  console.log("THIRD_VARIABLE_TOP " + JSON.stringify(roundDeep(summary.seedThirdVariableCandidates.slice(0, 12))));
  console.log("PAIR_RULES_TOP " + JSON.stringify(roundDeep(summary.boundedRuleSearch.pairs.slice(0, 12))));
  console.log("WINNERS " + JSON.stringify(roundDeep(summary.winners)));
  console.log("OUT " + path.relative(ROOT, SUMMARY_PATH));
}

main();

#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
const canonicalPath = resolve(args.canonical ?? "experiencia/canonical_cases.json");
const benchmarkPath = resolve(args.benchmark ?? "benchmark_project_v10.csv");
const topN = positiveInt(args.top, 20);

const cases = JSON.parse(readFileSync(canonicalPath, "utf8"));
const byId = new Map(cases.map((item) => [String(item.case_id), item]));
const benchmark = parseCsv(readFileSync(benchmarkPath, "utf8"));

const joined = [];
for (const row of benchmark) {
  const caseId = String(row.archivo ?? "").replace(/\.xml$/i, "");
  const canonical = byId.get(caseId);
  if (!canonical) continue;
  joined.push({
    caseId,
    ms: finiteNumber(row.ms),
    ref: finiteNumber(row.ref),
    ours: finiteNumber(row.ours),
    estado: row.estado,
    material: canonical.material,
    sourceFormat: canonical.source_format,
    ...structureMetrics(canonical)
  });
}

joined.sort((a, b) => b.ms - a.ms);

const summary = {
  canonicalCases: cases.length,
  benchmark: basename(benchmarkPath),
  benchmarkRows: benchmark.length,
  matchedRows: joined.length,
  overall: aggregate(joined),
  top20: aggregate(joined.slice(0, Math.min(20, joined.length))),
  top50: aggregate(joined.slice(0, Math.min(50, joined.length))),
  top100: aggregate(joined.slice(0, Math.min(100, joined.length))),
  correlationsSpearman: {
    pieceCount: spearman(joined, "pieceCount", "ms"),
    pieceTypes: spearman(joined, "pieceTypes", "ms"),
    repeatFactor: spearman(joined, "repeatFactor", "ms"),
    maxMultiplicity: spearman(joined, "maxMultiplicity", "ms"),
    repeatedPieceRatio: spearman(joined, "repeatedPieceRatio", "ms"),
    familyCoverageRatio: spearman(joined, "familyCoverageRatio", "ms"),
    sharedDimensionCoverageRatio: spearman(joined, "sharedDimensionCoverageRatio", "ms")
  },
  topCases: joined.slice(0, topN).map((row) => ({
    caseId: row.caseId,
    ms: row.ms,
    material: row.material,
    sourceFormat: row.sourceFormat,
    pieces: row.pieceCount,
    types: row.pieceTypes,
    repeatFactor: round(row.repeatFactor, 3),
    maxMultiplicity: row.maxMultiplicity,
    familyCoverageRatio: round(row.familyCoverageRatio, 4),
    sharedDimensionCoverageRatio: round(row.sharedDimensionCoverageRatio, 4),
    ref: row.ref,
    ours: row.ours
  }))
};

if (args.json) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  printHuman(summary);
}

function structureMetrics(canonical) {
  const pieces = Array.isArray(canonical.pieces) ? canonical.pieces : [];
  const pieceCount = pieces.reduce((sum, p) => sum + finiteNumber(p.cant, 1), 0);
  const pieceTypes = pieces.length;
  if (!pieceCount || !pieceTypes) {
    return {
      pieceCount: 0,
      pieceTypes: 0,
      repeatFactor: 0,
      maxMultiplicity: 0,
      repeatedPieceRatio: 0,
      familyCoverageRatio: 0,
      sharedDimensionCoverageRatio: 0,
      familyCount: 0
    };
  }

  const byDimension = new Map();
  pieces.forEach((piece, index) => {
    const dimensions = new Set([normalizeDimension(piece.base), normalizeDimension(piece.altura)]);
    for (const dimension of dimensions) {
      const indexes = byDimension.get(dimension) ?? [];
      indexes.push(index);
      byDimension.set(dimension, indexes);
    }
  });

  const graph = Array.from({ length: pieceTypes }, () => new Set());
  for (const indexes of byDimension.values()) {
    for (let i = 0; i < indexes.length; i++) {
      for (let j = i + 1; j < indexes.length; j++) {
        graph[indexes[i]].add(indexes[j]);
        graph[indexes[j]].add(indexes[i]);
      }
    }
  }

  const components = connectedComponents(graph);
  const families = components.filter((component) => component.length >= 2);
  const familyPieces = families.reduce(
    (sum, family) => sum + family.reduce((acc, index) => acc + finiteNumber(pieces[index].cant, 1), 0),
    0,
  );
  const sharedDimensionPieces = pieces.reduce(
    (sum, piece, index) => sum + (graph[index].size > 0 ? finiteNumber(piece.cant, 1) : 0),
    0,
  );
  const repeatedPieces = pieces.reduce(
    (sum, piece) => sum + (finiteNumber(piece.cant, 1) > 1 ? finiteNumber(piece.cant, 1) : 0),
    0,
  );

  return {
    pieceCount,
    pieceTypes,
    repeatFactor: pieceCount / pieceTypes,
    maxMultiplicity: Math.max(...pieces.map((piece) => finiteNumber(piece.cant, 1))),
    repeatedPieceRatio: repeatedPieces / pieceCount,
    familyCoverageRatio: familyPieces / pieceCount,
    sharedDimensionCoverageRatio: sharedDimensionPieces / pieceCount,
    familyCount: families.length
  };
}

function aggregate(rows) {
  if (!rows.length) return { n: 0 };
  return {
    n: rows.length,
    medianMs: median(rows.map((row) => row.ms)),
    p95Ms: percentile(rows.map((row) => row.ms), 0.95),
    medianPieces: median(rows.map((row) => row.pieceCount)),
    medianTypes: median(rows.map((row) => row.pieceTypes)),
    medianRepeatFactor: round(median(rows.map((row) => row.repeatFactor)), 3),
    medianFamilyCoverageRatio: round(median(rows.map((row) => row.familyCoverageRatio)), 4),
    medianSharedDimensionCoverageRatio: round(median(rows.map((row) => row.sharedDimensionCoverageRatio)), 4),
    familyCoverageGe80Pct: round(
      100 * rows.filter((row) => row.familyCoverageRatio >= 0.8).length / rows.length,
      2,
    ),
    familyCoverageGe95Pct: round(
      100 * rows.filter((row) => row.familyCoverageRatio >= 0.95).length / rows.length,
      2,
    )
  };
}

function printHuman(summary) {
  console.log(`Furniture Structure Report`);
  console.log(`canonical=${summary.canonicalCases} benchmark=${summary.benchmarkRows} matched=${summary.matchedRows}`);
  console.log("");
  printAggregate("ALL", summary.overall);
  printAggregate("TOP20", summary.top20);
  printAggregate("TOP50", summary.top50);
  printAggregate("TOP100", summary.top100);
  console.log("");
  console.log("Spearman vs ms:");
  for (const [key, value] of Object.entries(summary.correlationsSpearman)) {
    console.log(`  ${key.padEnd(30)} ${formatNumber(value, 4)}`);
  }
  console.log("");
  console.log(`Top ${summary.topCases.length} slow cases:`);
  for (const row of summary.topCases) {
    console.log([
      String(row.ms).padStart(8),
      `pz=${String(row.pieces).padStart(4)}`,
      `types=${String(row.types).padStart(3)}`,
      `rep=${formatNumber(row.repeatFactor, 2)}`,
      `fam=${formatNumber(row.familyCoverageRatio, 2)}`,
      `shared=${formatNumber(row.sharedDimensionCoverageRatio, 2)}`,
      row.caseId,
      `| ${row.material}`
    ].join("  "));
  }
}

function printAggregate(label, value) {
  console.log([
    label.padEnd(7),
    `n=${String(value.n).padStart(4)}`,
    `medianMs=${formatNumber(value.medianMs, 0)}`,
    `p95Ms=${formatNumber(value.p95Ms, 0)}`,
    `pieces=${formatNumber(value.medianPieces, 1)}`,
    `types=${formatNumber(value.medianTypes, 1)}`,
    `rep=${formatNumber(value.medianRepeatFactor, 2)}`,
    `famMed=${formatNumber(value.medianFamilyCoverageRatio, 2)}`,
    `fam>=.80=${formatNumber(value.familyCoverageGe80Pct, 1)}%`,
    `fam>=.95=${formatNumber(value.familyCoverageGe95Pct, 1)}%`
  ].join("  "));
}

function connectedComponents(graph) {
  const seen = new Set();
  const components = [];
  for (let start = 0; start < graph.length; start++) {
    if (seen.has(start)) continue;
    const pending = [start];
    const component = [];
    seen.add(start);
    while (pending.length) {
      const current = pending.pop();
      component.push(current);
      for (const next of graph[current]) {
        if (seen.has(next)) continue;
        seen.add(next);
        pending.push(next);
      }
    }
    components.push(component);
  }
  return components;
}

function spearman(rows, xKey, yKey) {
  const usable = rows.filter((row) => Number.isFinite(row[xKey]) && Number.isFinite(row[yKey]));
  if (usable.length < 2) return null;
  const rx = rank(usable.map((row) => row[xKey]));
  const ry = rank(usable.map((row) => row[yKey]));
  return pearson(rx, ry);
}

function rank(values) {
  const sorted = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = new Array(values.length);
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && sorted[j].value === sorted[i].value) j++;
    const averageRank = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) ranks[sorted[k].index] = averageRank;
    i = j;
  }
  return ranks;
}

function pearson(a, b) {
  const meanA = a.reduce((sum, value) => sum + value, 0) / a.length;
  const meanB = b.reduce((sum, value) => sum + value, 0) / b.length;
  let numerator = 0;
  let denomA = 0;
  let denomB = 0;
  for (let i = 0; i < a.length; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    numerator += da * db;
    denomA += da * da;
    denomB += db * db;
  }
  if (!denomA || !denomB) return 0;
  return numerator / Math.sqrt(denomA * denomB);
}

function median(values) {
  return percentile(values, 0.5);
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  if (lo === hi) return sorted[lo];
  const weight = index - lo;
  return sorted[lo] * (1 - weight) + sorted[hi] * weight;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
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
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  const [header, ...data] = rows.filter((item) => item.some((value) => value !== ""));
  return data.map((values) => Object.fromEntries(header.map((key, index) => [key, values[index] ?? ""])));
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") out.json = true;
    else if (arg.startsWith("--") && argv[i + 1] && !argv[i + 1].startsWith("--")) {
      out[arg.slice(2)] = argv[++i];
    }
  }
  return out;
}

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeDimension(value) {
  return Math.round(finiteNumber(value) * 1000) / 1000;
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatNumber(value, digits) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return Number(value).toFixed(digits);
}

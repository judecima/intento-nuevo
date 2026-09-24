#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";

import { createContext } from "../pattern-generators/context.mjs";
import { generatePatternsRust } from "../pattern-generators/rust/adapter.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(new URL("../../../", import.meta.url).pathname);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const FIX = path.resolve(HERE, "../holdout-v2-fixture");

const { resolverCoberturaContada } = require(path.join(
  ROOT,
  "src/lib/optimizer/experimental/counted-coverage.cjs",
));
const { materializar } = require(path.join(ROOT, "src/lib/optimizer/legacy/materializar.cjs"));
const { validarPlanIndustrial } = require(path.join(
  ROOT,
  "src/lib/optimizer/legacy/validador_industrial_v3.cjs",
));
const { computeHybridLowerBound } = require(path.join(
  ROOT,
  "src/lib/optimizer/experimental/hybrid-lower-bound.cjs",
));

const DEFAULT_IDS = [
  5445701, 5445716, 5447573, 5456195, 5456736, 5461999, 5464978, 5512349,
  5479171, 5438604, 5438566, 5462443, 5446507, 5464700,
];

const ALL_AUDIT_SERIAL_IDS = [
  5434851,5434857,5435640,5438546,5438566,5438604,5445701,5445716,5446475,5446507,
  5447573,5451829,5451833,5453022,5456195,5456736,5461999,5462443,5464700,5464978,
  5465420,5479071,5479171,5487382,5487390,5487407,5488363,5491218,5491245,5493233,
  5504219,5508513,5508515,5512349,5512836,5512875,5515391,5515421,5515728,5522069,
];

function envInt(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function parseIds() {
  if (process.env.SERIAL_ALL === "1") return new Set(ALL_AUDIT_SERIAL_IDS);
  if (process.env.SERIAL_IDS) {
    return new Set(process.env.SERIAL_IDS.split(",").map((value) => Number(value.trim())).filter(Number.isSafeInteger));
  }
  return new Set(DEFAULT_IDS);
}

function decodeFixture(targetIds) {
  const b64 = [0, 1, 2, 3].map((i) => fs.readFileSync(path.join(FIX, `part-0${i}.b64`), "utf8").trim()).join("");
  const b = zlib.brotliDecompressSync(Buffer.from(b64, "base64"));
  let p = 5;
  if (b.subarray(0, 5).toString() !== "MDFV1") throw new Error("bad fixture");
  function v() {
    let n = 0, s = 0;
    for (;;) {
      const x = b[p++];
      n += (x & 127) * 2 ** s;
      if (!(x & 128)) return n;
      s += 7;
    }
  }
  const n = v();
  const out = [];
  let last = 0;
  for (let k = 0; k < n; k++) {
    const id = last + v(); last = id;
    const width = v() / 10, height = v() / 10, saw = v() / 10, leptonBoards = v(), tc = v();
    const types = [];
    for (let j = 0; j < tc; j++) types.push({ w: v() / 10, h: v() / 10, q: v() });
    if (targetIds.has(id)) out.push({ id, width, height, saw, leptonBoards, types });
  }
  return out;
}

function linesFromCase(c) {
  return c.types.map((t, i) => ({
    base: t.w, altura: t.h, cant: t.q, veta: false, canRotate: true,
    ref: String(i), detalle: `SERIAL-${c.id}-${i}`, cantos: null,
  }));
}

function configFromCase(c) {
  return {
    placaBase: c.width, placaAltura: c.height, refiladoX: 0, refiladoY: 0, sierra: c.saw,
    etapas: 4, materialConVeta: false, descontarCanto: false, cantoEspesor: 0,
    restoMin: 250, restoMax: 400, material: "SERIAL-SHADOW", thickness: 18,
  };
}

function gcd2(a, b) { a = Math.abs(Math.trunc(a)); b = Math.abs(Math.trunc(b)); while (b) [a, b] = [b, a % b]; return a || 1; }
function gcdAll(values) { return values.reduce(gcd2, 0) || 1; }
function coverageMax(patterns, typeCount) {
  const max = new Array(typeCount).fill(0);
  for (const pattern of patterns) for (const [index, count] of pattern?.uso || []) if (index >= 0 && index < typeCount) max[index] = Math.max(max[index], count);
  return max;
}
function safeLowerBound(lines, config, incumbent) {
  const result = computeHybridLowerBound(lines, config, incumbent, { useRaster: false, claude: { usarRaster: false, usarDffFs0: true } });
  return { value: Math.max(1, Math.floor(Number(result?.cheapLowerBound ?? 0)), Math.floor(Number(result?.lowerBound ?? 0))), reason: result?.reason ?? null };
}
function nowMs() { return Number(process.hrtime.bigint()) / 1e6; }

const targetIds = parseIds();
const cases = decodeFixture(targetIds).sort((a, b) => a.id - b.id);
const missing = [...targetIds].filter((id) => !cases.some((c) => c.id === id));
if (missing.length) console.warn(`Fixture no contiene ${missing.length} IDs: ${missing.join(", ")}`);

const limits = {
  maxExpansions: envInt("SERIAL_MAX_EXPANSIONS", 250000),
  maxAndCombinations: envInt("SERIAL_MAX_AND_COMBINATIONS", 250000),
  maxFrontierEntries: envInt("SERIAL_MAX_FRONTIER", 100000),
  maxMaterializations: envInt("SERIAL_MAX_MATERIALIZATIONS", 10000),
};
const maxVariants = envInt("SERIAL_MAX_VARIANTS", 1);
const solverNodes = envInt("SERIAL_SOLVER_NODES", 1600000);
const solverWatchdogMs = envInt("SERIAL_SOLVER_WATCHDOG_MS", 12000);

const rows = [];
for (const c of cases) {
  const lines = linesFromCase(c);
  const config = configFromCase(c);
  const pieces = lines.reduce((sum, line) => sum + line.cant, 0);
  const quantityGcd = gcdAll(lines.map((line) => line.cant));
  const lb = safeLowerBound(lines, config, c.leptonBoards + 1);

  let generator = null, generatorError = null;
  const tg = nowMs();
  try {
    const context = createContext(lines, config);
    generator = generatePatternsRust(context, limits, { maxVariantsPerUsageVector: maxVariants, rootAxes: ["x", "y"] });
  } catch (error) { generatorError = String(error?.stack || error); }
  const generationMs = nowMs() - tg;
  const patterns = generator?.patterns || [];
  const maxCoverage = coverageMax(patterns, lines.length);
  const missingTypes = maxCoverage.map((value, index) => (value > 0 ? null : index)).filter((value) => value !== null);

  let solution = null, solverError = null, solveMs = null, plan = null, validation = null;
  if (!generatorError && patterns.length && !missingTypes.length) {
    const areaPlaca = c.width * c.height;
    const incumbent = c.leptonBoards + 1;
    const ts = nowMs();
    try {
      const solver = resolverCoberturaContada(patterns, lines.map((line) => line.cant), areaPlaca, incumbent, solverWatchdogMs, {
        maxNodos: solverNodes, watchdogMs: solverWatchdogMs, targetBoards: c.leptonBoards, expandPlan: true,
      });
      solution = solver?.resolver(lines.map((line) => line.base * line.altura)) || null;
      solveMs = nowMs() - ts;
      if (solution?.plan) {
        plan = materializar(solution.plan, lines, { ...config, anchoUtil: c.width, altoUtil: c.height });
        validation = plan ? validarPlanIndustrial(plan, pieces) : null;
      }
    } catch (error) { solveMs = nowMs() - ts; solverError = String(error?.stack || error); }
  }

  const boards = validation?.ok && plan?.resumen ? plan.resumen.placas : null;
  const row = {
    id: c.id, types: lines.length, pieces, quantityGcd, leptonBoards: c.leptonBoards,
    safeLowerBound: lb.value, lowerBoundReason: lb.reason,
    generatorStatus: generator?.status ?? null, generatorRestricted: generator?.searchRestricted ?? null,
    generatorPatterns: patterns.length, generatorRoots: generator?.roots?.length ?? 0,
    generatorFailures: generator?.failures?.length ?? 0, generationMs: +generationMs.toFixed(3), missingTypes,
    solverBoards: Number.isFinite(solution?.placas) ? solution.placas : null,
    solverNodes: solution?.nodos ?? null, multiplicityBranches: solution?.ramasMultiplicidad ?? null,
    solverExhausted: solution?.agotado ?? null, solverTargetReached: solution?.targetReached ?? null,
    solveMs: solveMs == null ? null : +solveMs.toFixed(3), materializedBoards: boards,
    valid: Boolean(validation?.ok), deltaVsLepton: boards == null ? null : boards - c.leptonBoards,
    reachedLepton: boards != null && boards <= c.leptonBoards,
    reachedSafeLowerBound: boards != null && boards <= lb.value,
    patternCounts: solution?.counts?.map((entry) => ({ count: entry.count, usage: lines.map((_, index) => entry.pattern.uso.get(index) || 0) })) ?? null,
    generatorError, solverError,
  };
  rows.push(row);
  console.log("CASE " + JSON.stringify({
    id: row.id, types: row.types, pieces: row.pieces, gcd: row.quantityGcd, lepton: row.leptonBoards,
    lb: row.safeLowerBound, patterns: row.generatorPatterns, genMs: row.generationMs,
    boards: row.materializedBoards, valid: row.valid, delta: row.deltaVsLepton,
    nodes: row.solverNodes, multBranches: row.multiplicityBranches, solveMs: row.solveMs,
    generatorStatus: row.generatorStatus, missingTypes: row.missingTypes,
  }));
}

const valid = rows.filter((r) => r.valid);
const summary = {
  schema: "optimizer-serial-counted-shadow-v1", generatedAt: new Date().toISOString(),
  targets: targetIds.size, fixtureCases: cases.length, missingFixtureIds: missing,
  limits, maxVariants, solverNodes, solverWatchdogMs,
  valid: valid.length, invalid: rows.length - valid.length,
  reachedLepton: valid.filter((r) => r.reachedLepton).length,
  betterThanLepton: valid.filter((r) => r.deltaVsLepton < 0).length,
  equalLepton: valid.filter((r) => r.deltaVsLepton === 0).length,
  worseThanLepton: valid.filter((r) => r.deltaVsLepton > 0).length,
  reachedSafeLowerBound: valid.filter((r) => r.reachedSafeLowerBound).length,
  totalGenerationMs: rows.reduce((sum, r) => sum + (r.generationMs || 0), 0),
  totalSolveMs: rows.reduce((sum, r) => sum + (r.solveMs || 0), 0),
};

const output = { summary, rows };
const outputPath = path.join(HERE, "SERIAL_COUNTED_SHADOW_RESULT.json");
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n");
console.log("SUMMARY " + JSON.stringify(summary));
console.log("RESULT " + outputPath);

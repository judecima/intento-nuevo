#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";


const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const FIX = path.resolve(HERE, "../holdout-v2-fixture");
const DEFAULT_XML_STAGE = path.resolve(ROOT, "validation-full/serial-production-audit/_extracted");

const { resolverCoberturaContada } = require(path.join(
  ROOT,
  "src/lib/optimizer/experimental/counted-coverage.cjs",
));
const { generateSerialDirectedPatterns } = require(path.join(
  ROOT,
  "src/lib/optimizer/experimental/serial-directed-pattern-generator.cjs",
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


function walkXml(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === ".extracted-ok") continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".xml") out.push(full);
    }
  }
  return out;
}

function physicalLeptonBoards(xml) {
  let total = 0, found = 0;
  for (const match of xml.matchAll(/<panel\d+\b([^>]*)>/gi)) {
    found++;
    const attrs = match[1] || "";
    const n = /\bnum\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const quantity = n ? Number(n[1]) : 1;
    total += Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
  }
  return found ? total : null;
}

async function loadCanonicalParser() {
  const bundlePath = path.join(
    ROOT,
    "node_modules/.cache/serial-counted-shadow/canonical-xml.mjs",
  );
  fs.mkdirSync(path.dirname(bundlePath), { recursive: true });
  await build({
    entryPoints: [path.join(ROOT, "src/lib/optimizer/canonical-xml.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    outfile: bundlePath,
    logLevel: "warning",
  });
  return import(pathToFileURL(bundlePath).href + "?v=" + Date.now());
}

async function loadMissingFromXml(targetIds, alreadyFound) {
  const missing = [...targetIds].filter((id) => !alreadyFound.some((c) => c.id === id));
  if (!missing.length) return { cases: [], unresolved: [], sourceDir: null };

  const sourceDir = path.resolve(process.env.SERIAL_SOURCE_DIR || DEFAULT_XML_STAGE);
  if (!fs.existsSync(sourceDir)) {
    return { cases: [], unresolved: missing, sourceDir };
  }

  const parser = await loadCanonicalParser();
  const byId = new Map();
  for (const xmlPath of walkXml(sourceDir)) {
    const name = path.basename(xmlPath);
    for (const id of missing) {
      if (!byId.has(id) && name.includes(String(id))) byId.set(id, xmlPath);
    }
    if (byId.size === missing.length) break;
  }

  const cases = [];
  for (const id of missing) {
    const xmlPath = byId.get(id);
    if (!xmlPath) continue;
    const xml = fs.readFileSync(xmlPath, "utf8");
    const parsed = parser.parseCanonicalXml(xml, {
      fileName: path.basename(xmlPath),
      defaultKerf: 4.5,
      defaultMinRemnant: 250,
      defaultMinCommercialRemnantLongSide: 400,
    });
    const canonical = parsed.case;
    const leptonBoards = physicalLeptonBoards(xml);
    if (!Number.isFinite(leptonBoards)) {
      throw new Error("No pude leer placas Lepton para " + id + " desde " + xmlPath);
    }
    cases.push({
      id,
      width: canonical.panel.width,
      height: canonical.panel.height,
      saw: canonical.kerf,
      leptonBoards,
      materialHasGrain: canonical.material.hasGrain ?? false,
      trimX: canonical.trim.x,
      trimY: canonical.trim.y,
      stages: canonical.constraints.stages ?? 4,
      minRemnant: canonical.constraints.minRemnant,
      minCommercialRemnantLongSide:
        canonical.constraints.minCommercialRemnantLongSide ??
        Math.max(canonical.constraints.minRemnant, 400),
      thickness: canonical.material.thickness ?? canonical.panel.thickness ?? 18,
      types: canonical.pieces.map((piece) => ({
        w: piece.width,
        h: piece.height,
        q: piece.quantity,
        grain: piece.grain ?? false,
        canRotate: piece.rotationAllowed,
        reference: piece.reference,
        description: piece.description,
        edges: piece.edges,
      })),
      source: "xml",
      sourcePath: xmlPath,
    });
  }

  return {
    cases,
    unresolved: missing.filter((id) => !cases.some((c) => c.id === id)),
    sourceDir,
  };
}

function linesFromCase(c) {
  return c.types.map((t, i) => ({
    base: t.w,
    altura: t.h,
    cant: t.q,
    veta: t.canRotate == null ? Boolean(t.grain) : t.canRotate === false,
    ref: i,
    detalle: t.description || t.reference || `SERIAL-${c.id}-${i}`,
    cantos: t.edges
      ? {
          arr: Boolean(t.edges.top),
          aba: Boolean(t.edges.bottom),
          izq: Boolean(t.edges.left),
          der: Boolean(t.edges.right),
        }
      : null,
  }));
}

function configFromCase(c) {
  const hasForcedNoRotate = c.types.some((t) => t.canRotate === false);
  return {
    placaBase: c.width,
    placaAltura: c.height,
    refiladoX: c.trimX ?? 0,
    refiladoY: c.trimY ?? 0,
    sierra: c.saw,
    etapas: c.stages ?? 4,
    materialConVeta: Boolean(c.materialHasGrain) || hasForcedNoRotate,
    descontarCanto: false,
    cantoEspesor: 0,
    restoMin: c.minRemnant ?? 250,
    restoMax: c.minCommercialRemnantLongSide ?? Math.max(c.minRemnant ?? 250, 400),
    material: "SERIAL-SHADOW",
    thickness: c.thickness ?? 18,
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
const fixtureCases = decodeFixture(targetIds).map((c) => ({ ...c, source: "holdout-v2-fixture" }));
const xmlRecovery = await loadMissingFromXml(targetIds, fixtureCases);
const cases = fixtureCases.concat(xmlRecovery.cases).sort((a, b) => a.id - b.id);
const missing = xmlRecovery.unresolved;
if (xmlRecovery.cases.length) {
  console.log(`Recuperados desde XML reales: ${xmlRecovery.cases.map((c) => c.id).join(", ")}`);
}
if (missing.length) {
  console.warn(
    `No pude resolver ${missing.length} IDs: ${missing.join(", ")}. ` +
    `Staging XML buscado: ${xmlRecovery.sourceDir || "n/a"}`,
  );
}

const limits = {
  maxExpansions: envInt("SERIAL_MAX_EXPANSIONS", 250000),
  maxAndCombinations: envInt("SERIAL_MAX_AND_COMBINATIONS", 250000),
  maxFrontierEntries: envInt("SERIAL_MAX_FRONTIER", 100000),
  maxMaterializations: envInt("SERIAL_MAX_MATERIALIZATIONS", 10000),
};
const maxVariants = envInt("SERIAL_MAX_VARIANTS", 1);
const solverNodes = envInt("SERIAL_SOLVER_NODES", 1600000);
const solverWatchdogMs = envInt("SERIAL_SOLVER_WATCHDOG_MS", 12000);
const maxPhysicalTests = envInt("SERIAL_MAX_PHYSICAL_TESTS", 96);
const maxBatchPieces = envInt("SERIAL_MAX_BATCH_PIECES", 96);

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
    generator = generateSerialDirectedPatterns(lines, config, {
      targetBoards: lb.value,
      maxPhysicalTests,
      maxBatchPieces,
    });
  } catch (error) { generatorError = String(error?.stack || error); }
  const generationMs = nowMs() - tg;
  const patterns = generator?.patterns || [];
  const maxCoverage = coverageMax(patterns, lines.length);
  const missingTypes = maxCoverage.map((value, index) => (value > 0 ? null : index)).filter((value) => value !== null);

  let solution = null, solverError = null, solveMs = null, plan = null, validation = null;
  if (!generatorError && patterns.length && !missingTypes.length) {
    const areaPlaca =
      (c.width - (config.refiladoX || 0)) *
      (c.height - (config.refiladoY || 0));
    const incumbent = generator?.telemetry?.upperBound ?? pieces;
    const ts = nowMs();
    try {
      const solver = resolverCoberturaContada(patterns, lines.map((line) => line.cant), areaPlaca, incumbent, solverWatchdogMs, {
        maxNodos: solverNodes, watchdogMs: solverWatchdogMs, targetBoards: lb.value, expandPlan: true,
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
    id: c.id, source: c.source ?? null, sourcePath: c.sourcePath ?? null, types: lines.length, pieces, quantityGcd, leptonBoards: c.leptonBoards,
    safeLowerBound: lb.value, lowerBoundReason: lb.reason,
    generatorStatus: generatorError ? "ERROR" : "DIRECTED",
    generatorRestricted: true,
    generatorPatterns: patterns.length,
    generatorRoots: null,
    generatorFailures: generator?.telemetry?.failedTests ?? 0,
    generatorTelemetry: generator?.telemetry ?? null,
    generationMs: +generationMs.toFixed(3),
    missingTypes,
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
    lb: row.safeLowerBound, patterns: row.generatorPatterns,
    tests: row.generatorTelemetry?.tests ?? null,
    upperBound: row.generatorTelemetry?.upperBound ?? null,
    genMs: row.generationMs,
    boards: row.materializedBoards, valid: row.valid, delta: row.deltaVsLepton,
    nodes: row.solverNodes, multBranches: row.multiplicityBranches, solveMs: row.solveMs,
    generatorStatus: row.generatorStatus, missingTypes: row.missingTypes,
  }));
}

const valid = rows.filter((r) => r.valid);
const summary = {
  schema: "optimizer-serial-counted-shadow-v1", generatedAt: new Date().toISOString(),
  targets: targetIds.size, fixtureCases: fixtureCases.length, xmlRecoveredCases: xmlRecovery.cases.length, unresolvedIds: missing,
  limits, maxVariants, solverNodes, solverWatchdogMs, maxPhysicalTests, maxBatchPieces,
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

#!/usr/bin/env node
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { generarPatrones, patronesMonotipo, claveVector } = require("../src/lib/optimizer/legacy/patrones.cjs");
const { resolverCobertura } = require("../src/lib/optimizer/legacy/cobertura.cjs");
const v10 = require("../src/lib/optimizer/legacy/v10.cjs");

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CORPUS = "D:/proyectos asistidos/lepton/data/lepton-xml";
const DEFAULT_FILE = "4058501__Marcos _Cumini Londero4058501.xml";
const args = parseArgs(process.argv.slice(2));
const corpus = resolve(String(args.corpus ?? DEFAULT_CORPUS));
const file = String(args.archivo ?? DEFAULT_FILE);
const rounds = positiveInt(args.rondas, 40);
const lateAfter = positiveInt(args.lateAfter, 20);
const generic = boolArg(args.generic);
const jsonOnly = boolArg(args.jsonOnly);
const xmlPath = join(corpus, file);

if (!existsSync(xmlPath)) {
  console.error(`no existe: ${xmlPath}`);
  process.exit(2);
}

const bundlePath = join(REPO, "node_modules", ".cache", "experience-benchmark", "optimizer.mjs");
if (!existsSync(bundlePath)) {
  console.error("falta el bundle; correr antes: node scripts/experience-benchmark.mjs report --rebuild");
  process.exit(2);
}

// Diagnostico del Master legacy: sin staged ni V20.
process.env.OPTIMIZER_V10_STAGED_EXPERIMENTAL = "0";
process.env.OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL = "0";

const optimizer = await import(pathToFileURL(bundlePath).href + `?v21c=${Date.now()}`);
const xml = readFileSync(xmlPath, "utf8");
const parsed = optimizer.parseCanonicalXml(xml, { fileName: file });
if (!parsed?.case) throw new Error("canonical case ausente");
const input = optimizer.benchmarkInputFromCanonicalCase(parsed.case, { strategy: "v10" });
const lineas = toLegacyLines(input);
const options = toLegacyOptions(input);
const demand = lineas.map((line) => +line.cant || 0);
const areaByType = lineas.map((line) => +line.base * +line.altura);
const areaPlate = (options.placaBase - options.refiladoX) * (options.placaAltura - options.refiladoY);

const preMaster = v10.optimizarV10(
  lineas,
  { ...options, usarMaster: false },
  v10.nuevasMetricas(),
);
const incumbent = preMaster.plan.resumen.placas;

const generationStarted = performance.now();
const randomPool = generarPatrones(
  lineas,
  { ...options, _instrumentarPatrones: true },
  rounds,
);
const generationMs = performance.now() - generationStarted;
const monoPool = patronesMonotipo(lineas, options).map((pattern, index) => ({
  ...pattern,
  _patternMeta: {
    origin: "monotype",
    firstSeenRound: null,
    sourceRound: null,
    monoTypeIndex: index,
  },
}));
const pool = randomPool.concat(monoPool);

const solveStarted = performance.now();
const solver = resolverCobertura(pool, demand, areaPlate, incumbent, options.msMaster || 8000);
const solution = solver ? solver.resolver(areaByType) : null;
const solveMs = performance.now() - solveStarted;

const sourceByPlate = new Map(pool.map((pattern) => [pattern.placa, pattern]));
const selected = (solution?.plan ?? []).map((pattern, index) => {
  const source = sourceByPlate.get(pattern.placa) ?? null;
  const meta = source?._patternMeta ?? null;
  const vector = claveVector(pattern.uso);
  const types = [...pattern.uso.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([typeIndex, quantity]) => {
      const line = lineas[typeIndex];
      return {
        typeIndex,
        quantity,
        reference: line?.ref ?? null,
        description: line?.detalle ?? null,
        width: line?.base ?? null,
        height: line?.altura ?? null,
        demand: line?.cant ?? null,
        grain: !!line?.veta,
      };
    });
  const placements = (pattern.placa?.colocadas ?? []).map((placement) => ({
    typeIndex: placement.pieza?.ref ?? null,
    width: placement.base,
    height: placement.altura,
    rotated: !!placement.rotada,
    x: placement.x,
    y: placement.y,
  }));
  const round = meta?.firstSeenRound;
  const commonDimension = findCommonDimension(types, 0.05);
  return {
    selectedIndex: index,
    vector,
    origin: meta?.origin ?? "unknown",
    firstSeenRound: round ?? null,
    sourceRound: meta?.sourceRound ?? null,
    late: Number.isInteger(round) ? round >= lateAfter : false,
    visibleTypeCount: meta?.visibleTypeCount ?? null,
    visibleTypes: meta?.visibleTypes ?? null,
    commonDimension,
    heterogeneous: types.length >= 2 && commonDimension === null,
    types,
    placements,
  };
});

const lateSelected = selected.filter((row) => row.late);
const lateHeterogeneous = lateSelected.filter((row) => row.heterogeneous);
const summary = {
  file,
  pieces: demand.reduce((a, b) => a + b, 0),
  types: lineas.length,
  board: `${options.placaBase}x${options.placaAltura}`,
  trim: [options.refiladoX, options.refiladoY],
  kerf: options.sierra,
  rounds,
  lateAfter,
  preMasterBoards: incumbent,
  solutionBoards: solution?.placas ?? incumbent,
  improved: Array.isArray(solution?.plan) && (solution?.placas ?? incumbent) < incumbent,
  randomPoolSize: randomPool.length,
  monotypePoolSize: monoPool.length,
  generationMs,
  solveMs,
  nodes: solution?.nodos ?? null,
  exhausted: solution?.agotado ?? null,
  selectedCount: selected.length,
  lateSelectedCount: lateSelected.length,
  lateHeterogeneousCount: lateHeterogeneous.length,
  lateHeterogeneousPct: lateSelected.length ? lateHeterogeneous.length / lateSelected.length * 100 : 0,
  selected,
};

console.log(jsonOnly ? JSON.stringify(summary) : JSON.stringify(summary, null, 2));

if (generic) {
  if (!summary.improved) {
    if (!jsonOnly) console.error(`V21c generic inconclusive: Master no mejora ${incumbent} placas`);
    process.exit(2);
  }
  if (!jsonOnly) console.log(`V21c generic OK: ${incumbent} -> ${summary.solutionBoards}; late=${lateSelected.length}; hetero=${lateHeterogeneous.length}`);
  process.exit(0);
}

if (incumbent !== 9 || summary.solutionBoards !== 8) {
  console.error(`V21c diagnostic inconclusive: esperaba preMaster=9 y Master=8, obtuvo ${incumbent} -> ${summary.solutionBoards}`);
  process.exit(2);
}
if (lateSelected.length === 0) {
  console.error(`V21c diagnostic FAIL: ninguna columna seleccionada aparece desde ronda ${lateAfter}`);
  process.exit(1);
}
if (!jsonOnly) console.log(`V21c diagnostic OK: ${lateSelected.length} columna(s) seleccionada(s) aparecen desde ronda ${lateAfter}`);

function findCommonDimension(types, tolerance) {
  if (!types.length) return null;
  const first = [Number(types[0].width), Number(types[0].height)].filter(Number.isFinite);
  for (const candidate of first) {
    if (types.every((type) => {
      const dims = [Number(type.width), Number(type.height)].filter(Number.isFinite);
      return dims.some((value) => Math.abs(value - candidate) <= tolerance);
    })) return candidate;
  }
  return null;
}

function toLegacyLines(input) {
  return input.pieces.map((piece, index) => ({
    ref: piece.reference || String(index + 1),
    detalle: piece.description || piece.reference || `Piece ${index + 1}`,
    cant: piece.quantity,
    base: piece.width,
    altura: piece.height,
    veta: Boolean(piece.grain || piece.canRotate === false),
    cantos: piece.edges
      ? {
          arr: Boolean(piece.edges.top),
          aba: Boolean(piece.edges.bottom),
          izq: Boolean(piece.edges.left),
          der: Boolean(piece.edges.right),
        }
      : null,
  }));
}

function toLegacyOptions(input) {
  const totalPieces = input.pieces.reduce((sum, piece) => sum + piece.quantity, 0);
  const cacheLimit = totalPieces <= 160 ? 160 : 0;
  return {
    placaBase: input.board.width,
    placaAltura: input.board.height,
    refiladoX: input.trim.x,
    refiladoY: input.trim.y,
    sierra: input.kerf,
    etapas: input.constraints.stages ?? 4,
    materialConVeta: input.material.hasGrain || input.pieces.some((piece) => piece.canRotate === false),
    descontarCanto: false,
    cantoEspesor: 0,
    restoMin: input.constraints.minRemnant,
    restoMax: input.constraints.minCommercialRemnantLongSide ?? Math.max(input.constraints.minRemnant, 400),
    usarOneBoard: input.constraints.allowOneBoard !== false,
    usarMaster: input.constraints.allowPatternMaster !== false,
    usarMultiSlice: input.constraints.allowMultiSlice !== false,
    usarCompactacion: input.constraints.allowDeadStripCompaction !== false,
    usarCache: cacheLimit > 0,
    maxPiezasCache: cacheLimit,
    rondasPatrones: 40,
    msMaster: 8000,
  };
}

function boolArg(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? ""));
}
function positiveInt(value, fallback) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else { out[key] = next; i += 1; }
  }
  return out;
}

#!/usr/bin/env node
import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { optimizar } = require("../src/lib/optimizer/legacy/motor.cjs");
const { patronesMonotipo, claveVector, generarPatrones } = require("../src/lib/optimizer/legacy/patrones.cjs");
const { resolverCobertura } = require("../src/lib/optimizer/legacy/cobertura.cjs");
const v10 = require("../src/lib/optimizer/legacy/v10.cjs");

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const corpus = resolve(String(args.corpus ?? "D:/proyectos asistidos/lepton/data/lepton-xml"));
const manifestPath = resolve(String(args.manifest ?? "experiencia/master-quality-sentinels.json"));
const filesPath = typeof args.files === "string" ? resolve(args.files) : null;
const outPath = typeof args.out === "string" ? resolve(args.out) : null;
const checkpoints = parseCheckpoints(args.checkpoints ?? "5,10,15,20,25,30,35,40");
const includeCandidates = boolArg(args.includeCandidates);
const oneFile = typeof args.archivo === "string" ? String(args.archivo) : null;

if (!existsSync(corpus)) throw new Error(`no existe corpus: ${corpus}`);
if (!oneFile && !filesPath && !existsSync(manifestPath)) throw new Error(`no existe manifest: ${manifestPath}`);
if (filesPath && !existsSync(filesPath)) throw new Error(`no existe files: ${filesPath}`);
const bundlePath = join(REPO, "node_modules", ".cache", "experience-benchmark", "optimizer.mjs");
if (!existsSync(bundlePath)) {
  console.error("falta el bundle; correr antes: node scripts/experience-benchmark.mjs report --rebuild");
  process.exit(2);
}

// Evidence only: reproduce the unchanged legacy Master path. No V20/V22 runtime policy.
process.env.OPTIMIZER_V10_STAGED_EXPERIMENTAL = "0";
process.env.OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL = "0";
delete process.env.OPTIMIZER_V22_MASTER_GAP1_EXPERIMENTAL;

const optimizer = await import(pathToFileURL(bundlePath).href + `?v22bprefix=${Date.now()}`);
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { sentinels: [], calibrationCandidates: [] };
const entries = oneFile
  ? [{ file: oneFile, sourceKind: "explicit" }]
  : filesPath
    ? readFileSync(filesPath, "utf8").split(/\r?\n/).map((x) => x.trim()).filter(Boolean).map((file) => ({ file, sourceKind: "files" }))
    : [
        ...(manifest.sentinels ?? []).map((x) => ({ ...x, sourceKind: "sentinel" })),
        ...(includeCandidates ? (manifest.calibrationCandidates ?? []).map((x) => ({ ...x, sourceKind: "candidate" })) : []),
      ];

const results = [];
for (const entry of entries) {
  const xmlPath = join(corpus, entry.file);
  if (!existsSync(xmlPath)) {
    results.push({ file: entry.file, ok: false, reason: "missing-xml" });
    console.error(`MISSING ${entry.file}`);
    continue;
  }
  const result = await profileCase(entry, xmlPath, optimizer, checkpoints);
  results.push(result);
  console.log(`${result.ok ? "OK" : "FAIL"} ${entry.file} pre=${result.preMasterBoards} checkpoints=${result.checkpoints?.map((x) => `${x.rounds}:${x.boards}`).join(" ") ?? "-"} lastNew=${result.saturation?.lastNewVectorRound ?? "-"} zeroTail=${result.saturation?.roundsSinceLastNewVector ?? "-"}`);
}

const summary = {
  manifest: existsSync(manifestPath) ? manifestPath : null,
  files: filesPath,
  corpus,
  checkpoints,
  cases: results.length,
  completed: results.filter((x) => x.ok).length,
  failed: results.filter((x) => !x.ok).length,
  results,
  interpretation: [
    "This is a diagnostic profile, not a stopping policy.",
    "A long plateau followed by a later board improvement falsifies simple patience-on-board-count stopping.",
    "newSelectedColumns reports selected patterns whose first appearance falls after the previous checkpoint; it is evidence about useful-column arrival, not a production-safe stopping rule by itself.",
    "Pool saturation is empirical, not proof that no unseen vector can appear later. No zero-growth streak authorizes a runtime cutoff in this phase.",
    "Exact per-round vector growth is recorded so saturation can be compared against actual canonical type count instead of being confused with small-order size."
  ],
};

console.log(JSON.stringify(summary, null, 2));
if (outPath) writeFileSync(outPath, JSON.stringify(summary, null, 2) + "\n");
process.exit(results.some((x) => !x.ok) ? 1 : 0);

async function profileCase(entry, xmlPath, optimizer, checkpoints) {
  try {
    const xml = readFileSync(xmlPath, "utf8");
    const parsed = optimizer.parseCanonicalXml(xml, { fileName: entry.file });
    if (!parsed?.case) throw new Error("canonical case ausente");
    const input = optimizer.benchmarkInputFromCanonicalCase(parsed.case, { strategy: "v10" });
    const lineas = toLegacyLines(input);
    const options = toLegacyOptions(input);
    const demand = lineas.map((line) => +line.cant || 0);
    const areaByType = lineas.map((line) => +line.base * +line.altura);
    const areaPlate = (options.placaBase - options.refiladoX) * (options.placaAltura - options.refiladoY);

    const pre = v10.optimizarV10(lineas, { ...options, usarMaster: false }, v10.nuevasMetricas());
    const incumbent = pre.plan.resumen.placas;
    const cota = pre.cota;
    const mono = patronesMonotipo(lineas, options);

    const generated = generatePrefixSnapshots(lineas, options, checkpoints);
    const reference40 = checkpoints.includes(40) ? generarPatrones(lineas, options, 40) : null;
    const parity40 = reference40
      ? vectorSet(reference40).size === vectorSet(generated.snapshots.get(40) ?? []).size &&
        setsEqual(vectorSet(reference40), vectorSet(generated.snapshots.get(40) ?? []))
      : null;

    let previousCheckpoint = 0;
    let previousPoolSize = 0;
    const profiles = [];
    for (const rounds of checkpoints) {
      const random = generated.snapshots.get(rounds) ?? [];
      const pool = random.concat(mono);
      const t0 = performance.now();
      const solver = resolverCobertura(pool, demand, areaPlate, incumbent, options.msMaster || 8000);
      const solution = solver ? solver.resolver(areaByType) : null;
      const solveMs = performance.now() - t0;
      const selected = (solution?.plan ?? []).map((p) => {
        const vector = claveVector(p.uso);
        const firstSeenRound0 = generated.firstSeen.get(vector) ?? null;
        return {
          vector,
          firstSeenRound: Number.isInteger(firstSeenRound0) ? firstSeenRound0 + 1 : null,
        };
      });
      const newSelectedColumns = selected.filter((x) => Number.isInteger(x.firstSeenRound) && x.firstSeenRound > previousCheckpoint).length;
      profiles.push({
        rounds,
        boards: solution?.placas ?? incumbent,
        improvedVsPreMaster: (solution?.placas ?? incumbent) < incumbent,
        randomPoolSize: random.length,
        poolAddedSincePrevious: random.length - previousPoolSize,
        selectedCount: selected.length,
        newSelectedColumns,
        latestSelectedFirstSeenRound: selected.reduce((m, x) => Number.isInteger(x.firstSeenRound) ? Math.max(m, x.firstSeenRound) : m, 0) || null,
        solveMs,
        nodes: solution?.nodos ?? null,
        exhausted: solution?.agotado ?? null,
        selected,
      });
      previousCheckpoint = rounds;
      previousPoolSize = random.length;
    }

    const firstImprovement = profiles.find((x) => x.improvedVsPreMaster) ?? null;
    const final = profiles.at(-1) ?? null;
    const expected = entry.expectedBoards ?? entry.expectedBoardsAt20 ?? null;
    return {
      file: entry.file,
      sourceKind: entry.sourceKind,
      pieces: demand.reduce((a, b) => a + b, 0),
      types: lineas.length,
      preMasterBoards: incumbent,
      cota,
      gap: incumbent - cota,
      expectedReferenceBoards: expected,
      firstImprovementCheckpoint: firstImprovement?.rounds ?? null,
      finalBoards: final?.boards ?? incumbent,
      parity40,
      generationMs: generated.generationMs,
      saturation: summarizeGrowth(generated.growth),
      poolGrowthByRound: generated.growth,
      checkpoints: profiles,
      ok: parity40 !== false,
    };
  } catch (error) {
    return { file: entry.file, sourceKind: entry.sourceKind, ok: false, reason: error?.message ?? String(error) };
  }
}

function generatePrefixSnapshots(lineas, O, checkpoints, semilla = 7) {
  const maxRounds = Math.max(...checkpoints);
  const wanted = new Set(checkpoints);
  let s = semilla >>> 0;
  const R = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return (s & 0x7fffffff) / 0x7fffffff; };
  const conRef = lineas.map((l, i) => ({ ...l, ref: i, _refOriginal: l.ref }));
  const porVector = new Map();
  const firstSeen = new Map();
  const snapshots = new Map();
  const growth = [];
  const t0 = performance.now();

  const registrar = (placa, round0) => {
    const uso = new Map();
    for (const c of placa.colocadas) {
      const t = c.pieza.ref;
      if (typeof t !== "number") return;
      uso.set(t, (uso.get(t) || 0) + 1);
    }
    if (!uso.size) return;
    const area = placa.colocadas.reduce((a, c) => a + c.base * c.altura, 0);
    const k = claveVector(uso);
    if (!firstSeen.has(k)) firstSeen.set(k, round0);
    const previo = porVector.get(k);
    if (!previo || area > previo.area) porVector.set(k, { uso, area, placa });
  };

  const warn = console.warn;
  console.warn = () => {};
  try {
    for (let r = 0; r < maxRounds; r++) {
      const before = porVector.size;
      const sub = r === 0 ? conRef : conRef.filter(() => R() > 0.45);
      if (sub.length) {
        try {
          const res = optimizar(sub.map((l) => ({ ...l })), { ...O, semilla: 1000 + r, pases: 2 });
          for (const p of res.placas) registrar(p, r);
        } catch (_) { /* same behavior as legacy generator */ }
      }
      const roundCount = r + 1;
      growth.push({ round: roundCount, newVectors: porVector.size - before, poolSize: porVector.size });
      if (wanted.has(roundCount)) snapshots.set(roundCount, [...porVector.values()]);
    }
  } finally {
    console.warn = warn;
  }
  return { snapshots, firstSeen, growth, generationMs: performance.now() - t0 };
}

function summarizeGrowth(growth) {
  let currentZero = 0;
  let maxZero = 0;
  let lastNewVectorRound = null;
  for (const row of growth) {
    if (row.newVectors > 0) {
      lastNewVectorRound = row.round;
      currentZero = 0;
    } else {
      currentZero++;
      if (currentZero > maxZero) maxZero = currentZero;
    }
  }
  const maxRound = growth.at(-1)?.round ?? 0;
  const totalVectors = growth.at(-1)?.poolSize ?? 0;
  const addedLast = (n) => growth.filter((x) => x.round > maxRound - n).reduce((sum, x) => sum + x.newVectors, 0);
  return {
    totalVectors,
    lastNewVectorRound,
    roundsSinceLastNewVector: lastNewVectorRound === null ? maxRound : maxRound - lastNewVectorRound,
    maxConsecutiveZeroGrowthRounds: maxZero,
    vectorsAddedLast5Rounds: addedLast(5),
    vectorsAddedLast10Rounds: addedLast(10),
    vectorsAddedLast20Rounds: addedLast(20),
    zeroGrowthRounds: growth.filter((x) => x.newVectors === 0).length,
    growthRounds: growth.filter((x) => x.newVectors > 0).length,
  };
}

function vectorSet(patterns) { return new Set(patterns.map((p) => claveVector(p.uso))); }
function setsEqual(a, b) { if (a.size !== b.size) return false; for (const x of a) if (!b.has(x)) return false; return true; }

function toLegacyLines(input) {
  return input.pieces.map((piece, index) => ({
    ref: piece.reference || String(index + 1),
    detalle: piece.description || piece.reference || `Piece ${index + 1}`,
    cant: piece.quantity,
    base: piece.width,
    altura: piece.height,
    veta: Boolean(piece.grain || piece.canRotate === false),
    cantos: piece.edges ? {
      arr: Boolean(piece.edges.top), aba: Boolean(piece.edges.bottom),
      izq: Boolean(piece.edges.left), der: Boolean(piece.edges.right),
    } : null,
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

function parseCheckpoints(value) {
  const xs = String(value).split(",").map((x) => Number.parseInt(x.trim(), 10)).filter((x) => Number.isFinite(x) && x > 0 && x <= 40);
  const unique = [...new Set(xs)].sort((a, b) => a - b);
  if (!unique.length) throw new Error("checkpoints vacios");
  return unique;
}
function boolArg(value) { return /^(1|true|yes|on)$/i.test(String(value ?? "")); }
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

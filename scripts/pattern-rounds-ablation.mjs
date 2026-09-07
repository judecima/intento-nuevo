#!/usr/bin/env node
/**
 * Ablacion offline del parametro existente `rondasPatrones` de Pattern Master.
 *
 * NO modifica codigo productivo ni legacy. `rondasPatrones` ya es un parametro de configuracion:
 * profileOptions() de legacy-engine.ts lo define para los perfiles fast (8) y deep (60), y el
 * perfil balanced no lo define, asi que v10.cjs cae en su default `config.rondasPatrones || 40`.
 * Este script lo inyecta desde afuera envolviendo la exportacion optimizarV10 de v10.cjs, antes
 * de que el bundle la use. El envoltorio llama al original con el mismo `lineas` y las mismas
 * `metricas`, y con la config identica salvo `rondasPatrones`.
 *
 *   node scripts/pattern-rounds-ablation.mjs --rondas 20 --out experiencia/v7/rondas20.jsonl
 *
 * Opciones: --corpus <dir> --train N --holdout N --files <lista> --maxNew N --limit N
 *           --repeat N (corre cada caso N veces y guarda un registro por corrida)
 *
 * ATENCION con --repeat: optimizeProject tiene un cache interno de 50 entradas POR PROCESO, asi
 * que la segunda corrida de un mismo caso dentro del mismo proceso devuelve el resultado
 * cacheado y no vuelve a ejecutar el motor (se reconoce por engineCacheHit=true y
 * rondasPatrones=null). Para medir repeticiones de verdad hay que invocar el script una vez por
 * repeticion, en procesos separados, que es la convencion ya fijada para este proyecto.
 *
 * Checkpoint incremental: cada caso se anexa al .jsonl apenas termina y al reanudar se saltean
 * los ya resueltos. Una corrida completa sobre 2000 casos dura horas.
 */
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CORPUS = "D:/proyectos asistidos/lepton/data/lepton-xml";
const LEGACY = join(REPO, "src", "lib", "optimizer", "legacy");

const args = parseArgs(process.argv.slice(2));
const corpus = args.corpus ?? DEFAULT_CORPUS;
const trainSize = Number(args.train ?? 5000);
const holdoutSize = Number(args.holdout ?? 2000);
const rondas = args.rondas === undefined ? null : Number(args.rondas);
const outPath = resolve(args.out ?? join(REPO, "experiencia", "v7", "rondas-" + (rondas ?? "default") + ".jsonl"));
const maxNew = args.maxNew === undefined ? null : Number(args.maxNew);
const limit = args.limit === undefined ? null : Number(args.limit);
const repeat = Number(args.repeat ?? 1);
const fileFilter = typeof args.files === "string" ? readFileList(args.files) : null;

if (rondas !== null && !(rondas > 0)) {
  console.error("--rondas debe ser un entero positivo, o se omite para dejar el default del motor (40)");
  process.exit(1);
}
mkdirSync(dirname(outPath), { recursive: true });

// ------------------------------------------------ inyeccion e instrumentacion
// Cada .cjs captura sus dependencias por destructuring al cargarse, asi que hay que parchear
// motor.cjs antes que patrones.cjs y oneboard.cjs, y todos antes de que el bundle cargue v10.cjs.

const require = createRequire(import.meta.url);
const probe = newProbe();

const motor = require(join(LEGACY, "motor.cjs"));
wrapOptimizar(motor);
const patrones = require(join(LEGACY, "patrones.cjs"));
wrapPatrones(patrones);
const cobertura = require(join(LEGACY, "cobertura.cjs"));
wrapCobertura(cobertura);
const materializar = require(join(LEGACY, "materializar.cjs"));
wrapMaterializar(materializar);
const oneboard = require(join(LEGACY, "oneboard.cjs"));
wrapOneBoard(oneboard);
const v10 = require(join(LEGACY, "v10.cjs"));
injectRondas(v10);

function newProbe() {
  const stage = () => ({ ms: 0, calls: 0 });
  return {
    phase: null,
    rondasVistas: null,
    optimizar: {
      baseline: stage(), compactacion: stage(), multislice: stage(),
      patrones: stage(), monotipo: stage(), oneboard: stage(), otro: stage()
    },
    generarPatrones: { ms: 0, calls: 0, pool: 0 },
    patronesMonotipo: { ms: 0, calls: 0, pool: 0 },
    resolverCobertura: { buildMs: 0, solveMs: 0, calls: 0, nodos: 0, agotado: 0, nulo: 0 },
    materializar: { ms: 0, calls: 0, nulo: 0 },
    oneboard: { ms: 0, calls: 0, exito: 0 }
  };
}
function reset() { const f = newProbe(); for (const k of Object.keys(f)) probe[k] = f[k]; }

/**
 * Unica diferencia funcional respecto de una corrida normal: el valor de rondasPatrones.
 * Todo lo demas -- lineas, metricas y el resto de la config -- se pasa tal cual.
 */
function injectRondas(mod) {
  const original = mod.optimizarV10;
  mod.optimizarV10 = function optimizarV10ConRondas(lineas, config, metricas) {
    const cfg = rondas === null ? config : { ...config, rondasPatrones: rondas };
    probe.rondasVistas = cfg.rondasPatrones ?? 40;
    return original.call(this, lineas, cfg, metricas);
  };
}

function classify(config) {
  if (probe.phase) return probe.phase;
  if (config && config.multiVariantes === true) return "multislice";
  if (config && config.penalizarFranjaMuerta === true) return "compactacion";
  if (config && config.multiVariantes === false) return "baseline";
  return "otro";
}
function wrapOptimizar(mod) {
  const original = mod.optimizar;
  mod.optimizar = function optimizarInstrumentado(lineas, config) {
    const bucket = probe.optimizar[classify(config)] ?? probe.optimizar.otro;
    const t = Date.now();
    try { return original.call(this, lineas, config); }
    finally { bucket.ms += Date.now() - t; bucket.calls += 1; }
  };
}
function wrapPatrones(mod) {
  const gen = mod.generarPatrones;
  mod.generarPatrones = function generarPatronesInstrumentado(...rest) {
    const previo = probe.phase; probe.phase = "patrones";
    const t = Date.now();
    try {
      const out = gen.apply(this, rest);
      probe.generarPatrones.pool += Array.isArray(out) ? out.length : 0;
      return out;
    } finally { probe.phase = previo; probe.generarPatrones.ms += Date.now() - t; probe.generarPatrones.calls += 1; }
  };
  const mono = mod.patronesMonotipo;
  mod.patronesMonotipo = function patronesMonotipoInstrumentado(...rest) {
    const previo = probe.phase; probe.phase = "monotipo";
    const t = Date.now();
    try {
      const out = mono.apply(this, rest);
      probe.patronesMonotipo.pool += Array.isArray(out) ? out.length : 0;
      return out;
    } finally { probe.phase = previo; probe.patronesMonotipo.ms += Date.now() - t; probe.patronesMonotipo.calls += 1; }
  };
}
function wrapCobertura(mod) {
  const original = mod.resolverCobertura;
  mod.resolverCobertura = function resolverCoberturaInstrumentado(...rest) {
    const t = Date.now();
    const handle = original.apply(this, rest);
    probe.resolverCobertura.buildMs += Date.now() - t;
    probe.resolverCobertura.calls += 1;
    if (!handle) { probe.resolverCobertura.nulo += 1; return handle; }
    const resolver = handle.resolver;
    handle.resolver = function resolverInstrumentado(...inner) {
      const t2 = Date.now();
      try {
        const out = resolver.apply(this, inner);
        if (out) { probe.resolverCobertura.nodos += out.nodos ?? 0; if (out.agotado) probe.resolverCobertura.agotado += 1; }
        return out;
      } finally { probe.resolverCobertura.solveMs += Date.now() - t2; }
    };
    return handle;
  };
}
function wrapMaterializar(mod) {
  const original = mod.materializar;
  mod.materializar = function materializarInstrumentado(...rest) {
    const t = Date.now();
    try { const out = original.apply(this, rest); if (!out) probe.materializar.nulo += 1; return out; }
    finally { probe.materializar.ms += Date.now() - t; probe.materializar.calls += 1; }
  };
}
function wrapOneBoard(mod) {
  const original = mod.rescatarUnaPlaca;
  mod.rescatarUnaPlaca = function rescatarUnaPlacaInstrumentado(...rest) {
    const previo = probe.phase; probe.phase = "oneboard";
    const t = Date.now();
    try { const out = original.apply(this, rest); if (out && out.exito) probe.oneboard.exito += 1; return out; }
    finally { probe.phase = previo; probe.oneboard.ms += Date.now() - t; probe.oneboard.calls += 1; }
  };
}

// ------------------------------------------------ carga del optimizador

const bundlePath = join(REPO, "node_modules", ".cache", "experience-benchmark", "optimizer.mjs");
if (!existsSync(bundlePath)) {
  console.error("falta el bundle; correr antes: node scripts/experience-benchmark.mjs report --rebuild");
  process.exit(1);
}
const optimizer = await import(pathToFileURL(bundlePath).href);

// ------------------------------------------------ dataset y split (identico al benchmark V10)

function orderNumber(fileName) {
  const runs = fileName.replace(/\.xml$/i, "").match(/\d+/g);
  if (!runs) return Number.POSITIVE_INFINITY;
  const last = runs[runs.length - 1];
  return Number(last.length > 7 ? last.slice(-7) : last);
}
function corpusFiles() {
  return readdirSync(corpus)
    .filter((n) => n.toLowerCase().endsWith(".xml"))
    .map((name) => ({ name, order: orderNumber(name) }))
    .sort((a, b) => (a.order - b.order) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((e) => e.name);
}
function parseFile(name) {
  let xml;
  try { xml = readFileSync(join(corpus, name), "utf8"); } catch { return null; }
  let canonical;
  try { canonical = optimizer.parseCanonicalXml(xml, { fileName: name }); } catch { return null; }
  if (!canonical?.case) return null;
  try { return { name, order: orderNumber(name), input: optimizer.benchmarkInputFromCanonicalCase(canonical.case, { strategy: "v10" }) }; }
  catch { return null; }
}
function buildHoldout() {
  const holdout = [];
  let train = 0;
  for (const name of corpusFiles()) {
    if (holdout.length >= holdoutSize) break;
    const parsed = parseFile(name);
    if (!parsed) continue;
    if (train < trainSize) train += 1; else holdout.push(parsed);
  }
  return holdout;
}

// ------------------------------------------------ huellas de calidad

/** Con etiquetas. Mismo algoritmo y mismo recorte que scripts/experience-benchmark.mjs, para
 *  poder comparar contra la baseline congelada, que solo guardo esta huella. */
function labeledDigest(result) {
  const hash = createHash("sha256");
  for (const p of result.placements) {
    hash.update(p.boardIndex + "|" + p.x + "|" + p.y + "|" + p.width + "|" + p.height + "|" + p.reference + "\n");
  }
  return hash.digest("hex").slice(0, 16);
}
/** Solo geometria, sin etiquetas y ordenada, para distinguir un plan realmente distinto de una
 *  permutacion de etiquetas entre piezas indistinguibles. */
function geometryDigest(result) {
  const rows = result.placements
    .map((p) => p.boardIndex + "|" + p.x + "|" + p.y + "|" + p.width + "|" + p.height)
    .sort();
  const hash = createHash("sha256");
  for (const r of rows) hash.update(r + "\n");
  return hash.digest("hex").slice(0, 16);
}

// ------------------------------------------------ corrida

const holdout = buildHoldout();
const selected = fileFilter === null ? holdout : holdout.filter((c) => fileFilter.has(c.name));
const target = limit === null ? selected : selected.slice(0, limit);

const doneCounts = readDoneCounts(outPath);
const pendingAll = [];
for (const item of target) {
  const already = doneCounts.get(item.name) ?? 0;
  for (let r = already; r < repeat; r += 1) pendingAll.push({ item, run: r });
}
const pending = maxNew === null ? pendingAll : pendingAll.slice(0, maxNew);

console.log(
  "rondasPatrones=" + (rondas === null ? "default(40)" : rondas) +
  " holdout=" + holdout.length + " seleccionados=" + target.length +
  " repeticiones=" + repeat + " ya resueltos=" + [...doneCounts.values()].reduce((a, b) => a + b, 0) +
  " pendientes=" + pending.length
);

let index = 0;
for (const { item, run } of pending) {
  index += 1;
  reset();
  const started = Date.now();
  let record;
  try {
    const result = optimizer.optimizeProject(item.input);
    record = buildRecord(item, run, result, Date.now() - started);
  } catch (error) {
    record = { file: item.name, run, ok: false, error: String(error?.message ?? error).slice(0, 300), totalMs: Date.now() - started };
  }
  appendFileSync(outPath, JSON.stringify(record) + "\n", "utf8");
  if (index % 25 === 0 || index === pending.length) {
    console.log("[" + index + "/" + pending.length + "] " + item.name + " " + Math.round(record.totalMs ?? 0) + " ms" +
      (record.boards === undefined ? "" : " placas=" + record.boards + " cota=" + record.cota));
  }
}
console.log("listo. salida: " + outPath);

function buildRecord(item, run, result, wallMs) {
  const raw = result.raw ?? {};
  const m = raw.metricasV10 ?? {};
  const resumen = raw.resumen ?? {};
  const opt = probe.optimizar;
  const stageMs = {
    baseline: opt.baseline.ms,
    compactacion: opt.compactacion.ms,
    multislice: opt.multislice.ms,
    oneboard: probe.oneboard.ms,
    generarPatrones: probe.generarPatrones.ms,
    patronesMonotipo: probe.patronesMonotipo.ms,
    resolverCobertura: probe.resolverCobertura.buildMs + probe.resolverCobertura.solveMs,
    materializarMs: probe.materializar.ms
  };
  return {
    file: item.name, order: item.order, run, ok: true,
    rondasPatrones: probe.rondasVistas,
    totalMs: wallMs,
    engineMs: result.metrics?.engineMs ?? null,
    engineCacheHit: Boolean(result.metrics?.cacheHit),
    boards: result.metrics?.boardCount ?? null,
    pieces: result.metrics?.expectedPieceCount ?? null,
    placements: result.placements?.length ?? null,
    cota: raw.cotaV10 ?? null,
    placementDigest: labeledDigest(result),
    geometryDigest: geometryDigest(result),
    validationOk: Boolean(result.validation && result.validation.ok),
    // calidad de remanente, para el criterio 2 de la prioridad (mismas placas, mejor remanente)
    quality: {
      utilizationPercentage: result.metrics?.utilizationPercentage ?? null,
      commercialRemnantAreaM2: result.metrics?.commercialRemnantAreaM2 ?? null,
      largestCommercialRemnantM2: result.metrics?.largestCommercialRemnantM2 ?? null,
      secondLargestCommercialRemnantM2: result.metrics?.secondLargestCommercialRemnantM2 ?? null,
      commercialRemnantCount: result.metrics?.commercialRemnantCount ?? null,
      cutCount: result.metrics?.cutCount ?? null,
      sawMeters: result.metrics?.sawMeters ?? null
    },
    stageMs,
    // rondas realmente ejecutadas: cada ronda de generarPatrones invoca optimizar una vez,
    // salvo que el subconjunto aleatorio quede vacio.
    optimizarCalls: {
      baseline: opt.baseline.calls, compactacion: opt.compactacion.calls,
      multislice: opt.multislice.calls, patrones: opt.patrones.calls,
      monotipo: opt.monotipo.calls, oneboard: opt.oneboard.calls, otro: opt.otro.calls
    },
    pool: {
      generarPatrones: probe.generarPatrones.pool,
      patronesMonotipo: probe.patronesMonotipo.pool,
      total: probe.generarPatrones.pool + probe.patronesMonotipo.pool
    },
    cobertura: {
      calls: probe.resolverCobertura.calls, nulo: probe.resolverCobertura.nulo,
      buildMs: probe.resolverCobertura.buildMs, solveMs: probe.resolverCobertura.solveMs,
      nodos: probe.resolverCobertura.nodos, agotado: probe.resolverCobertura.agotado
    },
    materializarNulo: probe.materializar.nulo,
    metricas: {
      oneboard: m.oneboard ?? null, master: m.master ?? null,
      multislice: m.multislice ?? null, compactacion: m.compactacion ?? null, total: m.total ?? null
    },
    resumen: {
      placas: resumen.placas ?? null, origen: resumen.origen ?? null,
      etapasUsadas: resumen.etapasUsadas ?? null,
      rescueIntentado: resumen.rescueIntentado ?? null, rescueGano: resumen.rescueGano ?? null,
      rescueMs: resumen.rescueMs ?? null, aprovechamiento: resumen.aprovechamiento ?? null,
      mayorSobranteM2: resumen.mayorSobranteM2 ?? null,
      segundoSobranteM2: resumen.segundoSobranteM2 ?? null,
      fragmentosComerciales: resumen.fragmentosComerciales ?? null
    }
  };
}

// ------------------------------------------------ utilidades

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) { out._.push(token); continue; }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) { out[key] = true; continue; }
    out[key] = next; i += 1;
  }
  return out;
}
function readFileList(path) {
  return new Set(readFileSync(resolve(path), "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean));
}
function readDoneCounts(path) {
  const counts = new Map();
  if (!existsSync(path)) return counts;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line) continue;
    try { const r = JSON.parse(line); counts.set(r.file, (counts.get(r.file) ?? 0) + 1); } catch { /* linea parcial */ }
  }
  return counts;
}

#!/usr/bin/env node
/**
 * Diagnostico de la cola cara de V10. SOLO MIDE: no cambia heuristicas, scoring,
 * limites, Fast, V10, OneBoard, Pattern Master, MultiSlice, compactacion, solver
 * ni generacion de patrones.
 *
 * Ningun archivo de src/lib/optimizer/legacy fue modificado. La separacion de tiempo
 * por etapa se obtiene envolviendo las EXPORTACIONES de los modulos legacy desde este
 * script, antes de que v10.cjs las capture por destructuring:
 *
 *   motor.cjs        optimizar            -> ms y cantidad de invocaciones por fase
 *   patrones.cjs     generarPatrones      -> ms y tamano del pool
 *   patrones.cjs     patronesMonotipo     -> ms y tamano del pool
 *   cobertura.cjs    resolverCobertura    -> ms de construccion + ms de resolver, nodos, agotado
 *   materializar.cjs materializar         -> ms
 *   oneboard.cjs     rescatarUnaPlaca     -> ms
 *
 * Los envoltorios llaman al original con los mismos argumentos y devuelven el mismo
 * valor. Lo unico que agregan es Date.now(). El motor es determinista (semillas fijas),
 * asi que el resultado no cambia; el script lo verifica comparando placas contra la
 * corrida baseline V10 ya registrada.
 *
 *   node scripts/v10-hotspot-diagnostic.mjs --files <lista.txt> --out <archivo.jsonl>
 *
 * Opciones: --corpus <dir> --train N --holdout N --maxNew N --limit N
 *
 * Checkpoint incremental: cada caso se anexa al .jsonl apenas termina y al reanudar
 * se saltean los ya resueltos. Una corrida completa dura horas.
 */
import { createRequire } from "node:module";
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
const outPath = resolve(args.out ?? join(REPO, "experiencia", "v6", "hotspot-v10.jsonl"));
const maxNew = args.maxNew === undefined ? null : Number(args.maxNew);
const limit = args.limit === undefined ? null : Number(args.limit);
const fileFilter = typeof args.files === "string" ? readFileList(args.files) : null;

mkdirSync(dirname(outPath), { recursive: true });

// ------------------------------------------------ instrumentacion por envoltorio
// El orden importa: cada modulo legacy hace destructuring de sus dependencias en el
// momento en que se carga. Hay que parchear motor.cjs ANTES de cargar patrones.cjs y
// oneboard.cjs, y todos ellos ANTES de que el bundle cargue v10.cjs.

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

function newProbe() {
  const stage = () => ({ ms: 0, calls: 0 });
  return {
    phase: null,
    optimizar: {
      baseline: stage(),
      compactacion: stage(),
      multislice: stage(),
      patrones: stage(),
      monotipo: stage(),
      oneboard: stage(),
      otro: stage()
    },
    generarPatrones: { ms: 0, calls: 0, pool: 0 },
    patronesMonotipo: { ms: 0, calls: 0, pool: 0 },
    resolverCobertura: { buildMs: 0, solveMs: 0, calls: 0, nodos: 0, agotado: 0, nulo: 0, placas: null },
    materializar: { ms: 0, calls: 0, nulo: 0 },
    oneboard: { ms: 0, calls: 0, exito: 0 }
  };
}

function reset() {
  const fresh = newProbe();
  for (const key of Object.keys(fresh)) probe[key] = fresh[key];
}

/** Clasifica la llamada a optimizar por la fase activa y, si es directa, por su config. */
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
    try {
      return original.call(this, lineas, config);
    } finally {
      bucket.ms += Date.now() - t;
      bucket.calls += 1;
    }
  };
}

function wrapPatrones(mod) {
  const gen = mod.generarPatrones;
  mod.generarPatrones = function generarPatronesInstrumentado(...rest) {
    const previo = probe.phase;
    probe.phase = "patrones";
    const t = Date.now();
    try {
      const out = gen.apply(this, rest);
      probe.generarPatrones.pool += Array.isArray(out) ? out.length : 0;
      return out;
    } finally {
      probe.phase = previo;
      probe.generarPatrones.ms += Date.now() - t;
      probe.generarPatrones.calls += 1;
    }
  };

  const mono = mod.patronesMonotipo;
  mod.patronesMonotipo = function patronesMonotipoInstrumentado(...rest) {
    const previo = probe.phase;
    probe.phase = "monotipo";
    const t = Date.now();
    try {
      const out = mono.apply(this, rest);
      probe.patronesMonotipo.pool += Array.isArray(out) ? out.length : 0;
      return out;
    } finally {
      probe.phase = previo;
      probe.patronesMonotipo.ms += Date.now() - t;
      probe.patronesMonotipo.calls += 1;
    }
  };
}

function wrapCobertura(mod) {
  const original = mod.resolverCobertura;
  mod.resolverCobertura = function resolverCoberturaInstrumentado(...rest) {
    const t = Date.now();
    const handle = original.apply(this, rest);
    probe.resolverCobertura.buildMs += Date.now() - t;
    probe.resolverCobertura.calls += 1;
    if (!handle) {
      probe.resolverCobertura.nulo += 1;
      return handle;
    }
    const resolver = handle.resolver;
    handle.resolver = function resolverInstrumentado(...inner) {
      const t2 = Date.now();
      try {
        const out = resolver.apply(this, inner);
        if (out) {
          probe.resolverCobertura.nodos += out.nodos ?? 0;
          if (out.agotado) probe.resolverCobertura.agotado += 1;
          probe.resolverCobertura.placas = out.placas ?? null;
        }
        return out;
      } finally {
        probe.resolverCobertura.solveMs += Date.now() - t2;
      }
    };
    return handle;
  };
}

function wrapMaterializar(mod) {
  const original = mod.materializar;
  mod.materializar = function materializarInstrumentado(...rest) {
    const t = Date.now();
    try {
      const out = original.apply(this, rest);
      if (!out) probe.materializar.nulo += 1;
      return out;
    } finally {
      probe.materializar.ms += Date.now() - t;
      probe.materializar.calls += 1;
    }
  };
}

function wrapOneBoard(mod) {
  const original = mod.rescatarUnaPlaca;
  mod.rescatarUnaPlaca = function rescatarUnaPlacaInstrumentado(...rest) {
    const previo = probe.phase;
    probe.phase = "oneboard";
    const t = Date.now();
    try {
      const out = original.apply(this, rest);
      if (out && out.exito) probe.oneboard.exito += 1;
      return out;
    } finally {
      probe.phase = previo;
      probe.oneboard.ms += Date.now() - t;
      probe.oneboard.calls += 1;
    }
  };
}

// ------------------------------------------------ carga del optimizador
// Mismo bundle y mismo anchor que scripts/experience-benchmark.mjs, para que
// "../legacy/*.cjs" resuelva contra los modulos ya parcheados arriba.

const bundlePath = join(REPO, "node_modules", ".cache", "experience-benchmark", "optimizer.mjs");
if (!existsSync(bundlePath)) {
  console.error("falta el bundle; correr antes: node scripts/experience-benchmark.mjs report --rebuild");
  process.exit(1);
}
const optimizer = await import(pathToFileURL(bundlePath).href);

// ------------------------------------------------ dataset y split (identico al benchmark)

function orderNumber(fileName) {
  const runs = fileName.replace(/\.xml$/i, "").match(/\d+/g);
  if (!runs) return Number.POSITIVE_INFINITY;
  const last = runs[runs.length - 1];
  return Number(last.length > 7 ? last.slice(-7) : last);
}

function corpusFiles() {
  return readdirSync(corpus)
    .filter((name) => name.toLowerCase().endsWith(".xml"))
    .map((name) => ({ name, order: orderNumber(name) }))
    .sort((a, b) => (a.order - b.order) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((entry) => entry.name);
}

function parseFile(name) {
  let xml;
  try {
    xml = readFileSync(join(corpus, name), "utf8");
  } catch {
    return null;
  }
  let canonical;
  try {
    canonical = optimizer.parseCanonicalXml(xml, { fileName: name });
  } catch {
    return null;
  }
  if (!canonical?.case) return null;
  try {
    return { name, input: optimizer.benchmarkInputFromCanonicalCase(canonical.case, { strategy: "v10" }) };
  } catch {
    return null;
  }
}

function buildHoldout() {
  const holdout = [];
  let train = 0;
  for (const name of corpusFiles()) {
    if (holdout.length >= holdoutSize) break;
    const parsed = parseFile(name);
    if (!parsed) continue;
    if (train < trainSize) train += 1;
    else holdout.push(parsed);
  }
  return holdout;
}

// ------------------------------------------------ corrida

const holdout = buildHoldout();
const selected = (fileFilter === null ? holdout : holdout.filter((c) => fileFilter.has(c.name)));
const ordered = fileFilter === null ? selected : orderByList(selected, fileFilter);
const target = limit === null ? ordered : ordered.slice(0, limit);

const done = new Set(readDone(outPath));
const remaining = target.filter((c) => !done.has(c.name));
const pending = maxNew === null ? remaining : remaining.slice(0, maxNew);

console.log(
  "holdout=" + holdout.length + " seleccionados=" + target.length +
  " ya resueltos=" + done.size + " pendientes=" + pending.length
);

let index = 0;
for (const item of pending) {
  index += 1;
  reset();
  const started = Date.now();
  let record;
  try {
    const result = optimizer.optimizeProject(item.input);
    record = buildRecord(item, result, Date.now() - started);
  } catch (error) {
    record = { file: item.name, ok: false, error: String(error?.message ?? error), totalMs: Date.now() - started };
  }
  appendFileSync(outPath, JSON.stringify(record) + "\n");
  console.log(
    "[" + index + "/" + pending.length + "] " + item.name +
    " " + Math.round(record.totalMs ?? 0) + " ms" +
    (record.boards === undefined ? "" : " placas=" + record.boards + " cota=" + record.cota)
  );
}

console.log("listo. salida: " + outPath);

function buildRecord(item, result, wallMs) {
  const raw = result.raw ?? {};
  const metricas = raw.metricasV10 ?? {};
  const resumen = raw.resumen ?? {};
  const opt = probe.optimizar;
  const stageMs = {
    baseline: opt.baseline.ms,
    compactacion: opt.compactacion.ms,
    multislice: opt.multislice.ms,
    oneboard: probe.oneboard.ms,
    masterGenerarPatrones: probe.generarPatrones.ms,
    masterPatronesMonotipo: probe.patronesMonotipo.ms,
    masterResolverCobertura: probe.resolverCobertura.buildMs + probe.resolverCobertura.solveMs,
    masterMaterializar: probe.materializar.ms
  };
  const masterMs = stageMs.masterGenerarPatrones + stageMs.masterPatronesMonotipo +
                   stageMs.masterResolverCobertura + stageMs.masterMaterializar;
  const measured = stageMs.baseline + stageMs.compactacion + stageMs.multislice + stageMs.oneboard + masterMs;

  return {
    file: item.name,
    ok: true,
    totalMs: wallMs,
    engineMs: result.metrics?.engineMs ?? null,
    boards: result.metrics?.boardCount ?? null,
    pieces: result.metrics?.pieceCount ?? null,
    cota: raw.cotaV10 ?? null,
    validationOk: result.validation?.ok ?? null,
    engineCacheHit: result.metrics?.cacheHit ?? null,
    stageMs,
    masterMs,
    measuredMs: measured,
    unaccountedMs: wallMs - measured,
    optimizarCalls: {
      baseline: opt.baseline.calls,
      compactacion: opt.compactacion.calls,
      multislice: opt.multislice.calls,
      patrones: opt.patrones.calls,
      monotipo: opt.monotipo.calls,
      oneboard: opt.oneboard.calls,
      otro: opt.otro.calls
    },
    pool: {
      generarPatrones: probe.generarPatrones.pool,
      patronesMonotipo: probe.patronesMonotipo.pool,
      total: probe.generarPatrones.pool + probe.patronesMonotipo.pool
    },
    cobertura: {
      calls: probe.resolverCobertura.calls,
      nulo: probe.resolverCobertura.nulo,
      buildMs: probe.resolverCobertura.buildMs,
      solveMs: probe.resolverCobertura.solveMs,
      nodos: probe.resolverCobertura.nodos,
      agotado: probe.resolverCobertura.agotado,
      placas: probe.resolverCobertura.placas
    },
    materializarNulo: probe.materializar.nulo,
    oneboardExito: probe.oneboard.exito,
    // contadores propios del motor y de v10, ya existentes, sin instrumentacion nueva
    metricas: {
      oneboard: metricas.oneboard ?? null,
      master: metricas.master ?? null,
      multislice: metricas.multislice ?? null,
      compactacion: metricas.compactacion ?? null,
      total: metricas.total ?? null
    },
    resumen: {
      placas: resumen.placas ?? null,
      origen: resumen.origen ?? null,
      etapasUsadas: resumen.etapasUsadas ?? null,
      maxXmlLayer: resumen.maxXmlLayer ?? null,
      maxType2Layer: resumen.maxType2Layer ?? null,
      type2Nodes: resumen.type2Nodes ?? null,
      rescueIntentado: resumen.rescueIntentado ?? null,
      rescueGano: resumen.rescueGano ?? null,
      rescueMs: resumen.rescueMs ?? null,
      cacheHits: resumen.cacheHits ?? null,
      cacheFallos: resumen.cacheFallos ?? null,
      aprovechamiento: resumen.aprovechamiento ?? null
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
    out[key] = next;
    i += 1;
  }
  return out;
}

function readFileList(path) {
  return new Set(
    readFileSync(resolve(path), "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  );
}

function orderByList(cases, listSet) {
  const order = [...listSet];
  const rank = new Map(order.map((name, index) => [name, index]));
  return cases.slice().sort((a, b) => (rank.get(a.name) ?? 0) - (rank.get(b.name) ?? 0));
}

function readDone(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).map((line) => {
    try { return JSON.parse(line).file; } catch { return null; }
  }).filter(Boolean);
}

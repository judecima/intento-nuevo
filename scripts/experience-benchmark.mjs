#!/usr/bin/env node
/**
 * Benchmark offline de Exact Memory (Etapas 3A/4A).
 *
 * No forma parte del flujo de la aplicacion. No modifica el motor ni sus heuristicas:
 * solo lee XML historicos, los convierte en casos canonicos y corre el optimizador
 * por dos caminos comparables, baseline y experience.
 *
 * Cada modo se corre en su PROPIO proceso a proposito. optimizeProject mantiene un cache
 * interno de 50 entradas por proceso; correr baseline y experience en el mismo proceso
 * contaminaria la comparacion.
 *
 *   node scripts/experience-benchmark.mjs train      --train 5000 --holdout 2000
 *   node scripts/experience-benchmark.mjs baseline   --train 5000 --holdout 2000
 *   node scripts/experience-benchmark.mjs experience --train 5000 --holdout 2000
 *   node scripts/experience-benchmark.mjs report     --train 5000 --holdout 2000
 *
 * Opciones: --corpus <dir> --strategy baseline|v10 --out <dir> --store <dir> --limit N
 *            --label <id> --files <lista.txt> --maxNew <N> --rebuild
 *
 * --maxNew corta la invocacion despues de N casos nuevos. Con el checkpoint incremental
 * eso permite avanzar en tandas cortas y reanudar, sin depender de que un proceso largo
 * sobreviva.
 *
 * Conviene correr baseline y experience mas de una vez, alternando el orden, porque el
 * ruido entre procesos es del mismo orden que el ahorro que se quiere medir. El reporte
 * toma por caso el MINIMO entre corridas del mismo modo y ademas informa cada corrida.
 */
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CORPUS = "D:/proyectos asistidos/lepton/data/lepton-xml";

const args = parseArgs(process.argv.slice(2));
const mode = args._[0];
if (!["train", "baseline", "experience", "report"].includes(mode)) {
  console.error("modo requerido: train | baseline | experience | report");
  process.exit(1);
}

const corpus = args.corpus ?? DEFAULT_CORPUS;
const trainSize = Number(args.train ?? 5000);
const holdoutSize = Number(args.holdout ?? 2000);
const strategy = args.strategy ?? "baseline";
const outDir = resolve(args.out ?? join(REPO, "experiencia", "v5"));
const limit = args.limit === undefined ? null : Number(args.limit);
const tag = strategy + "-" + trainSize + "-" + holdoutSize + (limit === null ? "" : "-limit" + limit);
const label = typeof args.label === "string" ? args.label : null;
const fileFilter = typeof args.files === "string" ? readFileList(args.files) : null;
const maxNew = args.maxNew === undefined ? null : Number(args.maxNew);

const storeDir = resolve(
  args.store ?? join(REPO, "node_modules", ".cache", "experience-benchmark", "store-" + strategy + "-" + trainSize)
);

mkdirSync(outDir, { recursive: true });

const optimizer = await loadOptimizer(Boolean(args.rebuild));

if (mode === "report") {
  report();
} else {
  await run();
}

// ---------------------------------------------------------------- carga del bundle

/**
 * El optimizador es TypeScript y carga los .cjs legacy con createRequire(import.meta.url).
 * Se bundlea con esbuild a un archivo temporal y se fija import.meta.url a un modulo real
 * del repo, para que "../legacy/*.cjs" siga resolviendo contra src/lib/optimizer/legacy.
 */
async function loadOptimizer(rebuild) {
  const bundlePath = join(REPO, "node_modules", ".cache", "experience-benchmark", "optimizer.mjs");
  const anchor = pathToFileURL(join(REPO, "src", "lib", "optimizer", "experience", "revalidate.ts")).href;

  if (rebuild || !existsSync(bundlePath)) {
    mkdirSync(dirname(bundlePath), { recursive: true });
    await build({
      entryPoints: [join(REPO, "src", "lib", "optimizer", "index.ts")],
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node22",
      outfile: bundlePath,
      define: { "import.meta.url": JSON.stringify(anchor) },
      logLevel: "warning"
    });
  }

  return import(pathToFileURL(bundlePath).href);
}

// ---------------------------------------------------------------- dataset y split

/**
 * Orden reproducible del corpus. No hay fecha real disponible, asi que se usa el numero
 * de pedido embebido en el nombre del archivo como PROXY de orden temporal: es la ultima
 * corrida de digitos del nombre, tomando sus ultimos 7 digitos cuando es mas larga.
 * Los archivos sin numero van al final, ordenados por nombre. Desempate siempre por nombre.
 */
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

/**
 * El split se define sobre CASOS CANONICOS, no sobre archivos: un XML corrupto o excluido
 * por stock mixto no consume cupo del train ni del holdout.
 */
function buildSplit() {
  const files = corpusFiles();
  const train = [];
  const holdout = [];
  const skipped = { parseError: 0, excluded: 0, adapterError: 0 };

  for (const name of files) {
    if (holdout.length >= holdoutSize) break;
    const parsed = parseFile(name);
    if (!parsed.ok) {
      skipped[parsed.kind] = (skipped[parsed.kind] ?? 0) + 1;
      continue;
    }
    (train.length < trainSize ? train : holdout).push(parsed);
  }

  return { train, holdout, skipped, files: files.length };
}

function parseFile(name) {
  const path = join(corpus, name);
  let xml;
  try {
    xml = readFileSync(path, "utf8");
  } catch {
    return { ok: false, kind: "parseError", name };
  }

  let canonical;
  try {
    canonical = optimizer.parseCanonicalXml(xml, { fileName: name });
  } catch (error) {
    const kind = error?.code === "mixed-board-formats" ? "excluded" : "parseError";
    return { ok: false, kind, name };
  }
  if (!canonical?.case) return { ok: false, kind: "excluded", name };

  let input;
  try {
    input = optimizer.benchmarkInputFromCanonicalCase(canonical.case, { strategy });
  } catch {
    return { ok: false, kind: "adapterError", name };
  }

  return { ok: true, name, order: orderNumber(name), input };
}

// ---------------------------------------------------------------- corridas

async function run() {
  const split = buildSplit();
  const cases = mode === "train" ? split.train : split.holdout;
  const filtered = fileFilter === null ? cases : cases.filter((item) => fileFilter.has(item.name));
  const selected = limit === null ? filtered : filtered.slice(0, limit);
  let store = null;
  if (mode === "train") {
    store = optimizer.createDirectoryExperienceStore(storeDir);
    store.clear();
  } else if (mode === "experience") {
    // Congelado: el holdout consulta la memoria del train pero no puede poblarla.
    store = optimizer.freezeExperienceStore(optimizer.createDirectoryExperienceStore(storeDir));
  }

  /**
   * Checkpoint incremental. Una corrida de V10 sobre el corpus dura horas y el resultado
   * se escribia recien al final, asi que cualquier corte perdia todo. Cada caso se anexa
   * a un .jsonl apenas termina, y al arrancar se saltean los casos ya resueltos.
   */
  const partialPath = join(outDir, mode + "-" + tag + (label === null ? "" : "-" + label) + ".partial.jsonl");
  const records = readPartial(partialPath);
  const done = new Set(records.map((record) => record.file));
  const remaining = selected.filter((item) => !done.has(item.name));
  const pending = maxNew === null ? remaining : remaining.slice(0, maxNew);
  if (done.size > 0) {
    console.log("reanudando: " + done.size + " casos ya resueltos, faltan " + remaining.length);
  }
  if (maxNew !== null && pending.length < remaining.length) {
    console.log("esta tanda procesa " + pending.length + " casos");
  }

  const stats = statsFromRecords(optimizer, records);
  const startedAt = Date.now();

  for (const [index, item] of pending.entries()) {
    const record = { file: item.name, order: item.order };
    try {
      const result = optimizer.optimizeProjectWithExperience(item.input, {
        enabled: mode !== "baseline",
        store: store ?? undefined,
        record: mode === "train",
        stats
      });
      Object.assign(record, {
        ok: true,
        fingerprint: result.experience.exactFingerprint ?? null,
        outcome: result.experience.outcome,
        boards: result.metrics.boardCount,
        pieces: result.metrics.expectedPieceCount,
        placements: result.placements.length,
        placementDigest: placementDigest(result, true),
        geometryDigest: placementDigest(result, false),
        validationOk: Boolean(result.validation && result.validation.ok),
        engineCacheHit: Boolean(result.metrics.cacheHit),
        originalEngineMs: result.experience.originalEngineMs ?? null,
        invalidReason: result.experience.invalidReason ?? null,
        recorded: result.experience.recorded,
        ...result.experience.timings
      });
    } catch (error) {
      Object.assign(record, { ok: false, error: String((error && error.message) || error).slice(0, 300) });
    }
    records.push(record);
    appendFileSync(partialPath, JSON.stringify(record) + "\n", "utf8");

    if ((index + 1) % 50 === 0) {
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(mode + " " + records.length + "/" + selected.length + " (" + elapsed + "s)");
    }
  }

  if (mode === "train") store.flush();

  // Tanda incompleta: queda el checkpoint y no se escribe el resultado final.
  if (records.length < selected.length) {
    console.log(
      mode + ": tanda parcial, " + records.length + "/" + selected.length +
        " casos resueltos en " + ((Date.now() - startedAt) / 1000).toFixed(1) + "s. Volver a ejecutar para continuar."
    );
    console.log(JSON.stringify(stats));
    return;
  }

  const payload = {
    mode,
    strategy,
    tag,
    corpus,
    generatedAt: new Date().toISOString(),
    split: {
      trainSize,
      holdoutSize,
      files: split.files,
      skipped: split.skipped,
      trainCases: split.train.length,
      holdoutCases: split.holdout.length
    },
    cases: selected.length,
    ...(fileFilter === null ? {} : { fileFilter: args.files, fileFilterSize: fileFilter.size }),
    wallClockMs: Date.now() - startedAt,
    stats,
    ...(mode === "train" ? { storeDir, storeEntries: store.size() } : {}),
    ...(mode === "experience" ? { storeDir, storeEntries: store.size() } : {}),
    records
  };

  const out = join(outDir, mode + "-" + tag + (label === null ? "" : "-" + label) + ".json");
  writeFileSync(out, JSON.stringify(payload), "utf8");
  rmSync(partialPath, { force: true });
  console.log(mode + ": " + selected.length + " casos, " + ((Date.now() - startedAt) / 1000).toFixed(1) + "s -> " + out);
  console.log(JSON.stringify(stats));
  if (mode === "train") {
    console.log("store: " + store.size() + " entradas en " + storeDir);
  }
}

/** Huella de la disposicion, para detectar si un hit devuelve un plano distinto al baseline. */
function placementDigest(result) {
  const hash = createHash("sha256");
  for (const placement of result.placements) {
    hash.update(
      placement.boardIndex + "|" + placement.x + "|" + placement.y + "|" + placement.width + "|" +
        placement.height + "|" + placement.reference + "\n"
    );
  }
  return hash.digest("hex").slice(0, 16);
}

// ---------------------------------------------------------------- reporte

function report() {
  const baselineRuns = readRuns("baseline");
  const experienceRuns = readRuns("experience");
  const baseline = readRun("baseline");
  const experience = readRun("experience");
  const train = readRun("train");

  const byFile = mergeRuns(baselineRuns);
  const expByFile = mergeRuns(experienceRuns);
  const pairs = [];
  for (const exp of expByFile.values()) {
    const base = byFile.get(exp.file);
    if (base) pairs.push({ base, exp });
  }

  const okPairs = pairs.filter((pair) => pair.base.ok && pair.exp.ok);
  const hits = okPairs.filter((pair) => pair.exp.outcome === "hit");

  /**
   * Modo muestreado: la corrida de experience se restringio a un subconjunto (todos los
   * hits mas una muestra de misses) porque recomputar 1971 misses que recorren el mismo
   * camino del motor que el baseline no aporta informacion nueva y cuesta horas.
   * El universo baseline sigue siendo completo, y el total de experience se DERIVA de
   * componentes medidos. Queda marcado como derivado en la salida.
   */
  const sampled = Boolean(experience.fileFilter);
  const baselineOk = [...byFile.values()].filter((record) => record.ok);
  const hitFiles = new Set(hits.map((pair) => pair.base.file));
  const sampledMisses = okPairs.filter((pair) => pair.exp.outcome !== "hit");
  const missOverheadAvg = avg(sampledMisses.map((pair) => pair.exp.fingerprintMs + pair.exp.lookupMs));

  const regressions = okPairs.filter((pair) => pair.exp.boards > pair.base.boards);
  const boardsBetter = okPairs.filter((pair) => pair.exp.boards < pair.base.boards);
  const pieceMismatch = okPairs.filter(
    (pair) => pair.exp.placements !== pair.base.placements || pair.exp.pieces !== pair.base.pieces
  );
  const layoutDiff = hits.filter((pair) => pair.exp.placementDigest !== pair.base.placementDigest);

  const engineAvoided = sum(hits.map((pair) => pair.base.totalMs));
  const overhead = sum(hits.map((pair) => pair.exp.totalMs));

  // Universo completo del holdout, tanto en modo completo como muestreado.
  const baselineTotal = sum(baselineOk.map((record) => record.totalMs));
  const experienceTotal = sampled
    ? baselineTotal - (engineAvoided - overhead) + missOverheadAvg * (baselineOk.length - hits.length)
    : sum(okPairs.map((pair) => pair.exp.totalMs));

  const buckets = [500, 1000, 3000, 5000, 10000].map((threshold) => {
    const bucket = hits.filter((pair) => pair.base.totalMs > threshold);
    const speedups = bucket.map((pair) => pair.base.totalMs / Math.max(pair.exp.totalMs, 0.001));
    return {
      thresholdMs: threshold,
      hits: bucket.length,
      baselineTotalMs: round(sum(bucket.map((pair) => pair.base.totalMs))),
      baselineAvgMs: round(avg(bucket.map((pair) => pair.base.totalMs))),
      experienceAvgMs: round(avg(bucket.map((pair) => pair.exp.totalMs))),
      msSaved: round(sum(bucket.map((pair) => pair.base.totalMs - pair.exp.totalMs))),
      speedupMedian: round(median(speedups)),
      speedupMax: round(speedups.length === 0 ? 0 : Math.max(...speedups)),
      boardsBaseline: sum(bucket.map((pair) => pair.base.boards)),
      boardsExperience: sum(bucket.map((pair) => pair.exp.boards))
    };
  });

  /** Los 10 hits que mas tiempo absoluto ahorraron. */
  const topSavings = hits
    .slice()
    .sort((a, b) => (b.base.totalMs - b.exp.totalMs) - (a.base.totalMs - a.exp.totalMs))
    .slice(0, 10)
    .map((pair) => ({
      case: pair.base.file,
      boards: pair.exp.boards,
      boardsBaseline: pair.base.boards,
      baselineMs: round(pair.base.totalMs),
      experienceMs: round(pair.exp.totalMs),
      fingerprintMs: round(pair.exp.fingerprintMs),
      lookupMs: round(pair.exp.lookupMs),
      deserializeMs: round(pair.exp.deserializeMs),
      validationMs: round(pair.exp.validationMs),
      speedup: round(pair.base.totalMs / Math.max(pair.exp.totalMs, 0.001)),
      msSaved: round(pair.base.totalMs - pair.exp.totalMs)
    }));

  /**
   * Cola cara sin hit: cuanto tiempo se sigue perdiendo porque Exact Memory no puede
   * ayudar. Es la evidencia para decidir si vale la pena Structural/Router/Rescue.
   */
  const noHit = baselineOk.filter((record) => !hitFiles.has(record.file));
  const expensiveWithoutHit = noHit
    .slice()
    .sort((a, b) => b.totalMs - a.totalMs)
    .slice(0, 20)
    .map((record) => ({
      case: record.file,
      baselineMs: round(record.totalMs),
      boards: record.boards,
      pieces: record.pieces
    }));

  const noHitTotal = sum(noHit.map((record) => record.totalMs));
  const noHitTop20 = sum(expensiveWithoutHit.map((entry) => entry.baselineMs));

  const summary = {
    generatedAt: new Date().toISOString(),
    strategy,
    tag,
    corpus,
    dataset: {
      files: baseline.split.files,
      skipped: baseline.split.skipped,
      trainCases: train ? train.cases : baseline.split.trainCases,
      holdoutCases: baseline.cases,
      pairedCases: pairs.length,
      okPairs: okPairs.length,
      trainStoreEntries: train ? train.storeEntries : null,
      orderCriterion:
        "numero de pedido del nombre de archivo como proxy de orden temporal; sin fecha real"
    },
    runs: {
      criterion: "por caso se toma el menor totalMs entre corridas del mismo modo",
      baseline: baselineRuns.map((run) => ({ file: run.file, cases: run.data.cases, wallClockMs: run.data.wallClockMs })),
      experience: experienceRuns.map((run) => ({ file: run.file, cases: run.data.cases, wallClockMs: run.data.wallClockMs })),
      baselineRunToRunSpreadPercent: spreadPercent(baselineRuns),
      experienceRunToRunSpreadPercent: spreadPercent(experienceRuns)
    },
    measurement: {
      mode: sampled ? "experience muestreado, baseline completo" : "completo",
      experienceFileFilter: experience.fileFilter ?? null,
      experienceCasesMeasured: okPairs.length,
      baselineCases: baselineOk.length,
      derived: sampled
        ? ["cpu.globalExperienceMs", "cpu.globalSavingMs", "cpu.globalSavingPercent"]
        : []
    },
    counters: {
      cases: baselineOk.length,
      errors: baseline.records.filter((record) => !record.ok).length + experience.records.filter((record) => !record.ok).length,
      exactHits: hits.length,
      exactHitRate: round((hits.length / Math.max(baselineOk.length, 1)) * 100),
      misses: baselineOk.length - hits.length,
      missesMeasured: sampledMisses.length,
      invalidCacheEntries: experience.stats.invalidCacheEntries,
      fallbacks: experience.stats.fallbacks,
      invalidReasons: countBy(pairs.filter((pair) => pair.exp.invalidReason).map((pair) => pair.exp.invalidReason)),
      baselineEngineCacheHits: baseline.records.filter((record) => record.engineCacheHit).length,
      experienceEngineCacheHits: experience.records.filter((record) => record.engineCacheHit).length,
      errorsBaseline: baseline.records.filter((record) => !record.ok).length,
      errorsExperience: experience.records.filter((record) => !record.ok).length,
      errors: baseline.records.filter((record) => !record.ok).length + experience.records.filter((record) => !record.ok).length
    },
    latency: {
      baseline: distribution(baselineOk.map((record) => record.totalMs)),
      experienceMeasured: distribution(okPairs.map((pair) => pair.exp.totalMs)),
      baselineHitsOnly: distribution(hits.map((pair) => pair.base.totalMs)),
      experienceHitsOnly: distribution(hits.map((pair) => pair.exp.totalMs))
    },
    experienceOverhead: {
      fingerprintMs: distribution(okPairs.map((pair) => pair.exp.fingerprintMs)),
      lookupMs: distribution(okPairs.map((pair) => pair.exp.lookupMs)),
      deserializeMs: distribution(hits.map((pair) => pair.exp.deserializeMs)),
      validationMs: distribution(hits.map((pair) => pair.exp.validationMs)),
      missPairedDeltaAvgMs: round(
        avg(
          okPairs
            .filter((pair) => pair.exp.outcome === "miss")
            .map((pair) => pair.exp.totalMs - pair.base.totalMs)
        )
      ),
      missPairedDeltaMedianMs: round(
        median(
          okPairs
            .filter((pair) => pair.exp.outcome === "miss")
            .map((pair) => pair.exp.totalMs - pair.base.totalMs)
        )
      ),
      missOverheadAvgMs: round(
        avg(
          okPairs
            .filter((pair) => pair.exp.outcome === "miss")
            .map((pair) => pair.exp.fingerprintMs + pair.exp.lookupMs)
        )
      )
    },
    cpu: {
      measured: {
        baselineTotalMs: round(baselineTotal),
        baselineMsExactHits: round(engineAvoided),
        experienceMsExactHits: round(overhead),
        netSavingOnHits: round(engineAvoided - overhead),
        savingPercentOnHits: round(((engineAvoided - overhead) / Math.max(engineAvoided, 0.001)) * 100),
        ...(sampled
          ? {}
          : {
              globalExperienceMs: round(experienceTotal),
              globalSavingMs: round(baselineTotal - experienceTotal),
              globalSavingPercent: round(((baselineTotal - experienceTotal) / Math.max(baselineTotal, 0.001)) * 100)
            })
      },
      derived: sampled
        ? {
            aviso:
              "globalExperienceMsDerived NO es una corrida experience completa: se calcula de componentes medidos.",
            formula:
              "globalExperienceMsDerived = baselineTotalMs - baselineMsExactHits + experienceMsExactHits + estimatedMissOverheadMs",
            meanMissOverheadMeasured: round(missOverheadAvg),
            missOverheadSampleSize: sampledMisses.length,
            missOverheadDispersion: distribution(
              sampledMisses.map((pair) => pair.exp.fingerprintMs + pair.exp.lookupMs)
            ),
            totalMisses: baselineOk.length - hits.length,
            estimatedMissOverheadMs: round(missOverheadAvg * (baselineOk.length - hits.length)),
            globalExperienceMsDerived: round(experienceTotal),
            globalSavingMsDerived: round(baselineTotal - experienceTotal),
            globalSavingPercentDerived: round(((baselineTotal - experienceTotal) / Math.max(baselineTotal, 0.001)) * 100)
          }
        : null
    },
    expensiveCases: {
      bands: buckets,
      topSavings
    },
    expensiveWithoutHit: {
      cases: noHit.length,
      totalMs: round(noHitTotal),
      shareOfGlobalBaselinePercent: round((noHitTotal / Math.max(baselineTotal, 0.001)) * 100),
      top20TotalMs: round(noHitTop20),
      top20ShareOfGlobalBaselinePercent: round((noHitTop20 / Math.max(baselineTotal, 0.001)) * 100),
      top20: expensiveWithoutHit
    },
    quality: {
      // Una permutacion de etiquetas entre piezas identicas no es una regresion: no cambia
      // ni las placas, ni las piezas, ni un solo corte. Se informa aparte.
      qualityRegressions:
        regressions.length + pieceMismatch.length + hits.filter((pair) => !pair.exp.validationOk).length,
      boardsRegressions: regressions.length,
      regressionFiles: regressions
        .slice(0, 20)
        .map((pair) => ({ file: pair.base.file, baseline: pair.base.boards, experience: pair.exp.boards })),
      pieceCountDifferences: pieceMismatch.length,
      placementDifferences: layoutDiff.length,
      geometryDifferences: hits.filter(
        (pair) => pair.exp.geometryDigest !== undefined && pair.base.geometryDigest !== undefined &&
          pair.exp.geometryDigest !== pair.base.geometryDigest
      ).length,
      placementDifferenceFiles: layoutDiff.slice(0, 10).map((pair) => pair.base.file),
      invalidPlans: hits.filter((pair) => !pair.exp.validationOk).length,
      sampledMissesBoardsEqual: sampledMisses.filter((pair) => pair.base.boards === pair.exp.boards).length,
      sampledMissesLayoutEqual: sampledMisses.filter((pair) => pair.base.placementDigest === pair.exp.placementDigest).length,
      sampledMisses: sampledMisses.length,
      boardsBetterThanBaseline: boardsBetter.length,
      totalBoardsBaseline: sum(okPairs.map((pair) => pair.base.boards)),
      totalBoardsExperience: sum(okPairs.map((pair) => pair.exp.boards))
    }
  };

  const out = join(outDir, "summary-" + tag + ".json");
  writeFileSync(out, JSON.stringify(summary, null, 2), "utf8");
  console.log(JSON.stringify(summary, null, 2));
  console.log("\n-> " + out);
}

/** Todas las corridas de un modo para este tag, en orden de nombre. */
function readRuns(name) {
  const prefix = name + "-" + tag;
  const files = readdirSync(outDir)
    .filter((file) => file === prefix + ".json" || file.startsWith(prefix + "-"))
    .filter((file) => file.endsWith(".json"))
    .sort();
  return files.map((file) => ({ file, data: JSON.parse(readFileSync(join(outDir, file), "utf8")) }));
}

function readRun(name) {
  const runs = readRuns(name);
  if (runs.length === 0) {
    if (name === "train") return null;
    throw new Error("faltan corridas " + name + "-" + tag + "*.json en " + outDir);
  }
  return runs[0].data;
}

/**
 * Une varias corridas del mismo modo quedandose, por caso, con el menor totalMs.
 * El minimo entre repeticiones es la estimacion mas limpia del costo real de CPU: descarta
 * interrupciones del sistema operativo sin poder inventar un tiempo mas bajo que el medido.
 */
function mergeRuns(runs) {
  const merged = new Map();
  for (const run of runs) {
    for (const record of run.data.records) {
      const previous = merged.get(record.file);
      if (!previous || (record.ok && (!previous.ok || record.totalMs < previous.totalMs))) {
        merged.set(record.file, record);
      }
    }
  }
  return merged;
}

// ---------------------------------------------------------------- utilidades

function distribution(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).slice().sort((a, b) => a - b);
  if (sorted.length === 0) return { count: 0 };
  return {
    count: sorted.length,
    avg: round(sum(sorted) / sorted.length),
    p50: round(percentile(sorted, 50)),
    p90: round(percentile(sorted, 90)),
    p95: round(percentile(sorted, 95)),
    p99: round(percentile(sorted, 99)),
    max: round(sorted[sorted.length - 1]),
    totalMs: round(sum(sorted))
  };
}

function percentile(sorted, p) {
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1];
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function avg(values) {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/** Dispersion entre corridas del mismo modo: cuanto se mueve el total solo por el proceso. */
function spreadPercent(runs) {
  if (runs.length < 2) return null;
  const totals = runs.map((run) => sum(run.data.records.filter((record) => record.ok).map((record) => record.totalMs)));
  const low = Math.min(...totals);
  const high = Math.max(...totals);
  return round(((high - low) / Math.max(low, 0.001)) * 100);
}

function countBy(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

/**
 * Lista de archivos a los que restringir la corrida, uno por linea. Se usa para entrenar
 * solo los casos que la memoria del holdout va a consultar de verdad.
 */
/** Casos ya resueltos en una corrida interrumpida. Una linea corrupta corta la lectura ahi. */
function readPartial(path) {
  if (!existsSync(path)) return [];
  const records = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.trim().length === 0) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      break;
    }
  }
  return records;
}

/** Reconstruye los contadores desde los registros ya resueltos, para poder reanudar. */
function statsFromRecords(optimizer, records) {
  const stats = optimizer.createExperienceStats();
  for (const record of records) {
    stats.cases++;
    if (!record.ok) continue;
    if (record.outcome === "hit") stats.exactHits++;
    else if (record.outcome === "miss") stats.misses++;
    else if (record.outcome === "fallback") {
      stats.invalidCacheEntries++;
      stats.fallbacks++;
    }
    if (record.recorded) stats.recorded++;
  }
  return stats;
}

function readFileList(path) {
  return new Set(
    readFileSync(path, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"))
  );
}

function parseArgs(argv) {
  const parsed = { _: [] };
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      parsed._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index++;
    }
  }
  return parsed;
}

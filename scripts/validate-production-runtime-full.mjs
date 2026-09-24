#!/usr/bin/env node

import { build } from "esbuild";
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { cpus, hostname, platform, release, totalmem } from "node:os";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));

if (args.help || args.inputs.length === 0) {
  printHelp();
  process.exit(args.help ? 0 : 2);
}

const outputDir = resolve(args.output);
mkdirSync(outputDir, { recursive: true });

const requestedSearchBudgets = {
  maxBeamExpansions: process.env.OPTIMIZER_MAX_BEAM_EXPANSIONS ?? null,
  beamWatchdogMs: process.env.OPTIMIZER_BEAM_WATCHDOG_MS ?? null,
  maxMasterNodes: process.env.OPTIMIZER_MAX_MASTER_NODES ?? null,
  masterWatchdogMs: process.env.OPTIMIZER_MASTER_WATCHDOG_MS ?? null,
  maxRescueAttempts: process.env.OPTIMIZER_MAX_RESCUE_ATTEMPTS ?? null,
  rescueWatchdogMs: process.env.OPTIMIZER_RESCUE_WATCHDOG_MS ?? null,
};

sanitizeOptimizerEnvironment();

const git = gitInfo();
const metadataPath = join(outputDir, "FULL_RUNTIME_VALIDATION_META.json");
const rowsPath = join(outputDir, "FULL_RUNTIME_VALIDATION_ROWS.jsonl");
const rowsGzipPath = join(outputDir, "FULL_RUNTIME_VALIDATION_ROWS.jsonl.gz");
const failuresPath = join(outputDir, "FULL_RUNTIME_VALIDATION_FAILURES.jsonl");
const reviewPath = join(outputDir, "FULL_RUNTIME_VALIDATION_REVIEW.jsonl");
const summaryPath = join(outputDir, "FULL_RUNTIME_VALIDATION_SUMMARY.json");
const summaryMdPath = join(outputDir, "FULL_RUNTIME_VALIDATION_SUMMARY.md");

const existingMeta = existsSync(metadataPath)
  ? JSON.parse(readFileSync(metadataPath, "utf8"))
  : null;

if (
  existingMeta &&
  existingMeta.git?.head &&
  git.head &&
  existingMeta.git.head !== git.head &&
  !args.forceResume
) {
  throw new Error(
    `El checkpoint pertenece a ${existingMeta.git.head} y el checkout actual es ${git.head}. ` +
    "Usa otro --output o --force-resume si realmente quieres mezclar commits."
  );
}

if (git.dirty) {
  console.warn("ADVERTENCIA: el working tree tiene cambios locales. Quedaran registrados en META.");
}

const bundlePath = join(REPO, "node_modules", ".cache", "full-runtime-validation", "optimizer.mjs");
mkdirSync(dirname(bundlePath), { recursive: true });
const anchor = pathToFileURL(
  join(REPO, "src", "lib", "optimizer", "experience", "revalidate.ts")
).href;

console.log("Compilando runtime del optimizador...");
await build({
  entryPoints: [join(REPO, "src", "lib", "optimizer", "index.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: bundlePath,
  define: { "import.meta.url": JSON.stringify(anchor) },
  logLevel: "warning",
});

const optimizer = await import(pathToFileURL(bundlePath).href + "?v=" + Date.now());
const rustAddon = join(
  REPO,
  "native",
  "optimizer-pattern-generator",
  "optimizer_pattern_generator.node"
);
if (!existsSync(rustAddon)) {
  throw new Error(
    "No esta instalado el addon Rust. Ejecuta primero: npm run optimizer:rust:build"
  );
}

const inputDescriptors = prepareInputs(args.inputs, outputDir);
const files = collectXmlFiles(inputDescriptors);
if (files.length === 0) throw new Error("No se encontraron archivos .xml.");

const resume = loadCheckpointRows(rowsPath);
const completedKeys = new Set(resume.rows.map((row) => row.caseKey));
const allRows = [...resume.rows];

const meta = {
  schema: "optimizer-full-runtime-validation-meta-v1",
  startedAt: existingMeta?.startedAt ?? new Date().toISOString(),
  resumedAt: existingMeta ? new Date().toISOString() : null,
  git,
  environment: {
    node: process.version,
    platform: platform(),
    release: release(),
    hostname: hostname(),
    cpuModel: cpus()[0]?.model ?? null,
    cpuCount: cpus().length,
    totalMemoryBytes: totalmem(),
    rustAddon,
    searchBudgets: {
      requestedBeforeSanitize: requestedSearchBudgets,
      effectiveCandidateBalanced: {
        beamBudgetMs: 1500,
        maxBeamExpansions: null,
        beamWatchdogMs: null,
        rescueBudgetMs: 300,
        maxRescueAttempts: null,
        rescueWatchdogMs: null,
        masterRounds: 40,
        masterTimeBudgetMs: 8000,
        maxMasterNodes: 1600000,
        masterWatchdogMs: 12000,
      },
      note:
        "Candidate V2/Auto defaults are resolved in legacy-engine.ts after experimental env vars are sanitized. " +
        "Null requested values therefore do not mean unlimited Master search.",
    },
  },
  runtime: {
    baseline: args.candidateOnly
      ? null
      : { motorVersion: "v1", effortMode: "fixed", patternGenerator: "rust" },
    candidate: { motorVersion: "v2", effortMode: "auto", patternGenerator: "rust", remnantPolish: true },
    advanced: args.advanced
      ? { motorVersion: "v2", effortMode: "advanced", patternGenerator: "rust", remnantPolish: true }
      : null,
  },
  inputs: inputDescriptors.map((item) => ({
    source: item.source,
    root: item.root,
    kind: item.kind,
    fingerprint: item.fingerprint,
  })),
  xmlFiles: files.length,
  options: {
    candidateOnly: args.candidateOnly,
    advanced: args.advanced,
    limit: args.limit,
    progressEvery: args.progressEvery,
  },
};
writeJson(metadataPath, meta);

if (resume.repaired) {
  writeFileSync(rowsPath, allRows.map((row) => JSON.stringify(row)).join("\n") + (allRows.length ? "\n" : ""));
}

const pending = files.filter((file) => !completedKeys.has(file.caseKey));
const selected = Number.isFinite(args.limit) ? pending.slice(0, args.limit) : pending;
console.log(
  `XML detectados: ${files.length}. Ya procesados: ${completedKeys.size}. ` +
  `A ejecutar ahora: ${selected.length}.`
);

let stopRequested = false;
process.on("SIGINT", () => {
  stopRequested = true;
  console.log("\nSIGINT recibido: terminare el caso actual y guardare el checkpoint.");
});

const sessionStarted = performance.now();
let sessionDone = 0;
let fatalRustError = null;

for (const file of selected) {
  const rowStarted = performance.now();
  let row;

  try {
    const xml = readFileSync(file.path, "utf8");
    const xmlSha256 = sha256Text(xml);
    const parsed = optimizer.parseCanonicalXml(xml, {
      fileName: file.displayName,
      defaultKerf: 4.5,
      defaultMinRemnant: 250,
      defaultMinCommercialRemnantLongSide: 400,
    });

    const input = optimizer.benchmarkInputFromCanonicalCase(parsed.case, {
      strategy: "v10",
      profile: "balanced",
    });
    input.projectId = `full-validation-${safeId(file.caseKey)}`;

    const leptonBoards = parsed.format === "project" ? physicalLeptonBoards(xml) : null;
    const typeCount = parsed.stats.pieceTypes;
    const pieceCount = parsed.stats.pieceQuantity;

    let baseline;
    let candidate;
    let advanced;

    if (args.candidateOnly) {
      candidate = timed(() =>
        optimizer.optimizeProject(input, {
          motorVersion: "v2",
          effortMode: "auto",
          patternGenerator: "rust",
        })
      );
    } else if (hashParity(xmlSha256) === 0) {
      baseline = timed(() =>
        optimizer.optimizeProject(input, {
          motorVersion: "v1",
          effortMode: "fixed",
          patternGenerator: "rust",
        })
      );
      candidate = timed(() =>
        optimizer.optimizeProject(input, {
          motorVersion: "v2",
          effortMode: "auto",
          patternGenerator: "rust",
        })
      );
    } else {
      candidate = timed(() =>
        optimizer.optimizeProject(input, {
          motorVersion: "v2",
          effortMode: "auto",
          patternGenerator: "rust",
        })
      );
      baseline = timed(() =>
        optimizer.optimizeProject(input, {
          motorVersion: "v1",
          effortMode: "fixed",
          patternGenerator: "rust",
        })
      );
    }

    if (args.advanced && !args.candidateOnly) {
      advanced = timed(() =>
        optimizer.optimizeProject(input, {
          motorVersion: "v2",
          effortMode: "advanced",
          patternGenerator: "rust",
        })
      );
    }

    if (baseline) assertRust("baseline", baseline);
    assertRust("candidate", candidate);
    if (advanced) assertRust("advanced", advanced);

    const baselineBoards = baseline?.result?.metrics?.boardCount ?? null;
    const candidateBoards = candidate.result.metrics.boardCount;
    const advancedBoards = advanced?.result.metrics.boardCount ?? null;
    const baselineValid = baseline ? baseline.result.validation.ok === true : null;
    const candidateValid = candidate.result.validation.ok === true;
    const advancedValid = advanced ? advanced.result.validation.ok === true : null;

    const candidateVsBaselineBoards =
      baselineValid && candidateValid ? cmp(candidateBoards, baselineBoards) : null;
    const candidateVsBaselineRemnant =
      baselineValid && candidateValid && candidateVsBaselineBoards === 0
        ? compareRemnant(candidate.result, baseline.result)
        : null;

    const autoVsAdvancedBoards =
      advanced && candidateValid && advancedValid
        ? cmp(candidateBoards, advancedBoards)
        : null;
    const autoVsAdvancedRemnant =
      advanced &&
      candidateValid &&
      advancedValid &&
      autoVsAdvancedBoards === 0
        ? compareRemnant(candidate.result, advanced.result)
        : null;

    const failures = [];
    if (baseline && (!baseline.ok || !baselineValid)) failures.push("baseline_invalid");
    if (!candidate.ok || !candidateValid) failures.push("candidate_invalid");
    if (candidateVsBaselineBoards > 0) failures.push("candidate_board_regression");
    if (candidateVsBaselineBoards === 0 && candidateVsBaselineRemnant < 0) {
      failures.push("candidate_remnant_regression");
    }
    if (advanced) {
      if (!advanced.ok || !advancedValid) failures.push("advanced_invalid");
      if (autoVsAdvancedBoards > 0) failures.push("auto_board_loss_vs_advanced");
      if (autoVsAdvancedBoards === 0 && autoVsAdvancedRemnant < 0) {
        failures.push("auto_remnant_loss_vs_advanced");
      }
    }

    const effort = candidate.result.raw?.metricasV10?.effortController ?? null;
    const polish = candidate.result.raw?.metricasV10?.remnantPolish ?? null;

    row = {
      schema: "optimizer-full-runtime-validation-row-v1",
      status: failures.length ? "FAIL" : "OK",
      failures,
      caseKey: file.caseKey,
      source: file.source,
      relativePath: file.relativePath,
      fileName: file.displayName,
      caseId: idFromFileName(file.displayName),
      xmlSha256,
      format: parsed.format,
      warnings: parsed.warnings,
      typeCount,
      pieceCount,
      panel: parsed.case.panel,
      kerf: parsed.case.kerf,
      leptonBoards,
      baseline: baseline ? armRow(baseline) : null,
      candidate: armRow(candidate),
      advanced: advanced ? armRow(advanced) : null,
      comparisons: {
        candidateVsBaselineBoards,
        candidateVsBaselineRemnant,
        candidateVsLepton:
          Number.isFinite(leptonBoards) ? cmp(candidateBoards, leptonBoards) : null,
        baselineVsLepton:
          baseline && Number.isFinite(leptonBoards) ? cmp(baselineBoards, leptonBoards) : null,
        advancedVsLepton:
          advanced && Number.isFinite(leptonBoards)
            ? cmp(advancedBoards, leptonBoards)
            : null,
        autoVsAdvancedBoards,
        autoVsAdvancedRemnant,
      },
      auto: {
        enteredMaster: effort?.enteredMaster === true,
        preMasterBoards: finiteOrNull(effort?.preMasterBoards),
        finalBoards: finiteOrNull(effort?.finalBoards),
        roundsExecuted: finiteOrNull(effort?.roundsExecuted),
        stopReason: effort?.stopReason ?? null,
        safeLowerBound: finiteOrNull(effort?.safeLowerBound),
        blocks: Array.isArray(effort?.blocks) ? effort.blocks.length : null,
      },
      remnantPolish: polish
        ? {
            runs: finiteOrNull(polish.runs),
            attemptedBoards: finiteOrNull(polish.attemptedBoards),
            improvedBoards: finiteOrNull(polish.improvedBoards),
            rejectedBoards: finiteOrNull(polish.rejectedBoards),
            invalidFinal: finiteOrNull(polish.invalidFinal),
            ms: finiteOrNull(polish.ms),
          }
        : null,
      rowWallMs: +(performance.now() - rowStarted).toFixed(3),
    };
  } catch (error) {
    const message = String(error?.stack || error);
    const parseError =
      error?.name === "CanonicalXmlParseError" ||
      error instanceof optimizer.CanonicalXmlParseError;
    if (message.includes("RUST_REQUIRED_FOR_CERTIFICATION")) {
      fatalRustError = message;
    }
    row = {
      schema: "optimizer-full-runtime-validation-row-v1",
      status: parseError ? "SKIP" : "FAIL",
      failures: parseError ? [] : [fatalRustError ? "rust_not_active" : "exception"],
      skipReason: parseError ? "canonical_parse_error" : null,
      parseErrorCode: parseError ? (error?.code ?? null) : null,
      caseKey: file.caseKey,
      source: file.source,
      relativePath: file.relativePath,
      fileName: file.displayName,
      caseId: idFromFileName(file.displayName),
      error: message,
      rowWallMs: +(performance.now() - rowStarted).toFixed(3),
    };
  }

  appendFileSync(rowsPath, JSON.stringify(row) + "\n");
  allRows.push(row);
  completedKeys.add(file.caseKey);
  sessionDone++;

  if (
    sessionDone === 1 ||
    sessionDone % args.progressEvery === 0 ||
    sessionDone === selected.length ||
    row.status === "FAIL"
  ) {
    const elapsed = performance.now() - sessionStarted;
    const rate = sessionDone > 0 ? elapsed / sessionDone : 0;
    const remaining = selected.length - sessionDone;
    const etaMs = rate * remaining;
    const currentSummary = summarize(allRows);
    writeJson(summaryPath, buildSummary(meta, allRows, files.length, false));
    writeReviewFile(reviewPath, allRows);
    console.log(
      `[${completedKeys.size}/${files.length}] ` +
      `sesion ${sessionDone}/${selected.length} | ` +
      `FAIL=${currentSummary.failures} | ` +
      `cand vs base M/E/P=${currentSummary.candidateVsBaseline.better}/` +
      `${currentSummary.candidateVsBaseline.equal}/${currentSummary.candidateVsBaseline.worse} | ` +
      `vs Lepton M/E/P=${currentSummary.candidateVsLepton.better}/` +
      `${currentSummary.candidateVsLepton.equal}/${currentSummary.candidateVsLepton.worse} | ` +
      `reviewV1=${allRows.filter((r) => baselineReviewReasons(r).length > 0).length} | ` +
      `ETA ${formatDuration(etaMs)}`
    );
  }

  if (fatalRustError || stopRequested) break;
}

const finalSummary = buildSummary(meta, allRows, files.length, !stopRequested && !fatalRustError && completedKeys.size >= files.length);
writeJson(summaryPath, finalSummary);
writeFileSync(summaryMdPath, renderSummaryMarkdown(finalSummary));
writeFailureFile(failuresPath, allRows);
writeReviewFile(reviewPath, allRows);
writeFileSync(rowsGzipPath, gzipSync(readFileSync(rowsPath), { level: 9 }));

meta.completedAt = new Date().toISOString();
meta.complete = finalSummary.complete;
meta.processedRows = allRows.length;
meta.fatalRustError = fatalRustError;
writeJson(metadataPath, meta);

console.log("\nResultado:");
console.log(summaryPath);
console.log(rowsGzipPath);
console.log(failuresPath);
console.log(reviewPath);
console.log(summaryMdPath);

if (fatalRustError) {
  console.error("\nLa certificacion se detuvo porque Rust no estuvo activo:");
  console.error(fatalRustError);
  process.exitCode = 3;
} else if (finalSummary.failures > 0) {
  console.error(`\nLa corrida contiene ${finalSummary.failures} casos FAIL. Revisa FULL_RUNTIME_VALIDATION_FAILURES.jsonl.`);
  process.exitCode = 2;
} else if (stopRequested) {
  console.log("\nCheckpoint guardado. Ejecuta el mismo comando para continuar.");
} else if (!finalSummary.complete) {
  console.log(
    `\nLOTE COMPLETADO: ${allRows.length}/${files.length} XML registrados. ` +
    "La certificacion completa sigue pendiente."
  );
} else {
  console.log("\nVALIDACION COMPLETA.");
}

function parseArgs(argv) {
  const out = {
    inputs: [],
    output: join(REPO, "validation-full"),
    candidateOnly: false,
    advanced: true,
    forceResume: false,
    limit: Infinity,
    progressEvery: 10,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--input") out.inputs.push(argv[++i]);
    else if (arg === "--output") out.output = argv[++i];
    else if (arg === "--candidate-only") {
      out.candidateOnly = true;
      out.advanced = false;
    }
    else if (arg === "--no-advanced") out.advanced = false;
    else if (arg === "--force-resume") out.forceResume = true;
    else if (arg === "--limit") out.limit = Number(argv[++i]);
    else if (arg === "--progress-every") out.progressEvery = Math.max(1, Number(argv[++i]) || 10);
    else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`Argumento desconocido: ${arg}`);
  }
  out.inputs = out.inputs.filter(Boolean).map((inputPath) => resolve(inputPath));
  return out;
}

function printHelp() {
  console.log(`
Uso:
  node scripts/validate-production-runtime-full.mjs \\
    --input "D:\\validacion_v2_1.zip" \\
    --input "D:\\validacion_v2_2.zip" \\
    --input "D:\\validacion_v2_3.zip" \\
    --input "D:\\validacion_v2_4.zip" \\
    --output ".\\validation-full"

Tambien acepta carpetas ya extraidas:
  node scripts/validate-production-runtime-full.mjs --input "D:\\validacion_v2" --output ".\\validation-full"

Opciones:
  --candidate-only    ejecuta solo V2 Auto; genera FULL_RUNTIME_VALIDATION_REVIEW.jsonl
                      con los casos que requieren contraste selectivo contra V1
  --no-advanced       no ejecuta V2 Advanced/Full40
  --limit N           procesa como maximo N casos pendientes (util para smoke)
  --progress-every N  imprime progreso cada N casos (default 10)
  --force-resume      permite continuar un output creado con otro commit
  --help              muestra esta ayuda

La corrida es reanudable. Si se interrumpe, repite exactamente el mismo comando.
`);
}

function sanitizeOptimizerEnvironment() {
  for (const key of Object.keys(process.env)) {
    if (
      key.startsWith("OPTIMIZER_") &&
      (
        key.endsWith("_EXPERIMENTAL") ||
        key === "OPTIMIZER_V10_STAGED_EXPERIMENTAL" ||
        key === "OPTIMIZER_MAX_BEAM_EXPANSIONS" ||
        key === "OPTIMIZER_BEAM_WATCHDOG_MS" ||
        key === "OPTIMIZER_MAX_MASTER_NODES" ||
        key === "OPTIMIZER_MASTER_WATCHDOG_MS" ||
        key === "OPTIMIZER_MAX_RESCUE_ATTEMPTS" ||
        key === "OPTIMIZER_RESCUE_WATCHDOG_MS"
      )
    ) {
      delete process.env[key];
    }
  }
  process.env.OPTIMIZER_V2_REMNANT_POLISH = "1";
}

function prepareInputs(inputs, output) {
  const staging = join(output, "_extracted");
  mkdirSync(staging, { recursive: true });
  return inputs.map((source, index) => {
    if (!existsSync(source)) throw new Error(`No existe --input: ${source}`);
    const stat = statSync(source);
    if (stat.isDirectory()) {
      return { source, root: source, kind: "directory", fingerprint: null, index };
    }
    if (extname(source).toLowerCase() !== ".zip") {
      throw new Error(`El input debe ser una carpeta o .zip: ${source}`);
    }
    const fingerprint = sha256File(source);
    const target = join(staging, `${String(index + 1).padStart(2, "0")}-${safeId(basename(source))}-${fingerprint.slice(0, 10)}`);
    const marker = join(target, ".extracted-ok");
    if (!existsSync(marker)) {
      rmSync(target, { recursive: true, force: true });
      mkdirSync(target, { recursive: true });
      extractZip(source, target);
      writeFileSync(marker, fingerprint + "\n");
    }
    return { source, root: target, kind: "zip", fingerprint, index };
  });
}

function extractZip(source, target) {
  console.log(`Extrayendo ${source} ...`);
  let result = spawnSync("tar", ["-xf", source, "-C", target], {
    cwd: REPO,
    stdio: "inherit",
  });
  if (result.status === 0) return;

  if (process.platform === "win32") {
    const ps = (value) => "'" + String(value).replaceAll("'", "''") + "'";
    result = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -LiteralPath ${ps(source)} -DestinationPath ${ps(target)} -Force`,
      ],
      { cwd: REPO, stdio: "inherit" }
    );
    if (result.status === 0) return;
  }

  throw new Error(
    `No pude extraer ${source}. Extrae el ZIP manualmente y pasa la carpeta con --input.`
  );
}

function collectXmlFiles(descriptors) {
  const out = [];
  for (const item of descriptors) {
    const paths = walkXml(item.root).sort((a, b) => a.localeCompare(b));
    for (const path of paths) {
      const rel = relative(item.root, path).replaceAll("\\", "/");
      out.push({
        path,
        source: item.source,
        relativePath: rel,
        displayName: basename(path),
        caseKey: `${item.index}:${rel}`,
      });
    }
  }
  out.sort((a, b) => a.caseKey.localeCompare(b.caseKey));
  return out;
}

function walkXml(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".extracted-ok") continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && extname(entry.name).toLowerCase() === ".xml") out.push(full);
    }
  }
  return out;
}

function loadCheckpointRows(path) {
  if (!existsSync(path)) return { rows: [], repaired: false };
  const text = readFileSync(path, "utf8");
  const lines = text.split(/\r?\n/);
  const rows = [];
  let repaired = false;
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      repaired = true;
      console.warn("Checkpoint contenia una linea incompleta; se descarta y se repara.");
    }
  }
  const dedup = new Map();
  for (const row of rows) {
    if (row.failures?.includes("rust_not_active")) {
      repaired = true;
      continue;
    }
    dedup.set(row.caseKey, row);
  }
  if (dedup.size !== rows.length) repaired = true;
  return { rows: [...dedup.values()], repaired };
}

function timed(fn) {
  const started = performance.now();
  const cpu0 = process.cpuUsage();
  try {
    const result = fn();
    const cpu = process.cpuUsage(cpu0);
    return {
      ok: true,
      result,
      wallMs: +(performance.now() - started).toFixed(3),
      cpuMs: +((cpu.user + cpu.system) / 1000).toFixed(3),
      error: null,
    };
  } catch (error) {
    const cpu = process.cpuUsage(cpu0);
    return {
      ok: false,
      result: null,
      wallMs: +(performance.now() - started).toFixed(3),
      cpuMs: +((cpu.user + cpu.system) / 1000).toFixed(3),
      error: String(error?.stack || error),
    };
  }
}

function assertRust(name, arm) {
  if (!arm.ok) return;
  if (arm.result?.metrics?.patternGenerator !== "rust") {
    throw new Error(
      `RUST_REQUIRED_FOR_CERTIFICATION: ${name} uso ${arm.result?.metrics?.patternGenerator ?? "unknown"}`
    );
  }
}

function armRow(arm) {
  if (!arm?.ok || !arm.result) {
    return {
      ok: false,
      valid: false,
      error: arm?.error ?? "unknown",
      wallMs: arm?.wallMs ?? null,
      cpuMs: arm?.cpuMs ?? null,
    };
  }
  const result = arm.result;
  return {
    ok: true,
    valid: result.validation.ok === true,
    algorithmVersion: result.algorithmVersion,
    boards: result.metrics.boardCount,
    pieces: result.metrics.pieceCount,
    wallMs: arm.wallMs,
    cpuMs: arm.cpuMs,
    engineMs: result.metrics.engineMs ?? null,
    patternGenerator: result.metrics.patternGenerator ?? null,
    effortMode: result.metrics.effortMode ?? null,
    cacheHit: result.metrics.cacheHit ?? null,
    lowerBound: result.raw?.cotaV10 ?? null,
    remnant: remnantQuality(result),
  };
}

function remnantQuality(result) {
  return {
    largestM2: result.metrics.largestCommercialRemnantM2,
    secondM2: result.metrics.secondLargestCommercialRemnantM2,
    fragments: result.metrics.commercialRemnantCount,
    totalM2: result.metrics.commercialRemnantAreaM2,
  };
}

function compareRemnant(a, b) {
  const A = remnantQuality(a);
  const B = remnantQuality(b);
  const eps = 1e-9;
  if (A.largestM2 > B.largestM2 + eps) return 1;
  if (B.largestM2 > A.largestM2 + eps) return -1;
  if (A.secondM2 > B.secondM2 + eps) return 1;
  if (B.secondM2 > A.secondM2 + eps) return -1;
  if (A.fragments !== B.fragments) return A.fragments < B.fragments ? 1 : -1;
  if (A.totalM2 > B.totalM2 + eps) return 1;
  if (B.totalM2 > A.totalM2 + eps) return -1;
  return 0;
}

function physicalLeptonBoards(xml) {
  let total = 0;
  let found = 0;
  for (const match of xml.matchAll(/<panel\d+\b([^>]*)>/gi)) {
    found++;
    const attrs = match[1] || "";
    const n = /\bnum\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const quantity = n ? Number(n[1]) : 1;
    total += Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
  }
  return found ? total : null;
}

function summarize(rows) {
  // A safety FAIL is still a valid comparison row. Excluding FAIL rows here
  // hid exactly the regressions this report exists to surface.
  const candidateRows = rows.filter((row) => row.candidate?.valid);
  const comparable = candidateRows.filter((row) => row.baseline?.valid);
  const lepton = candidateRows.filter((row) => Number.isFinite(row.leptonBoards));
  const advanced = candidateRows.filter((row) => row.advanced?.valid);

  const candidateVsBaseline = triplet(
    comparable.map((row) => row.comparisons.candidateVsBaselineBoards)
  );
  const candidateVsLepton = triplet(
    lepton.map((row) => row.comparisons.candidateVsLepton)
  );
  const autoVsAdvanced = triplet(
    advanced.map((row) => row.comparisons.autoVsAdvancedBoards)
  );

  return {
    rows: rows.length,
    ok: rows.filter((row) => row.status === "OK").length,
    skipped: rows.filter((row) => row.status === "SKIP").length,
    parseErrors: rows.filter((row) => row.skipReason === "canonical_parse_error").length,
    failures: rows.filter((row) => row.status === "FAIL").length,
    runtimeExceptions: rows.filter((row) => row.failures?.includes("exception")).length,
    candidateVsBaseline,
    candidateVsLepton,
    autoVsAdvanced,
  };
}

function buildSummary(meta, rows, discoveredXml, complete) {
  const base = summarize(rows);
  const validCandidate = rows.filter((row) => row.candidate?.valid);
  const validBaseline = rows.filter((row) => row.baseline?.valid);
  const validAdvanced = rows.filter((row) => row.advanced?.valid);

  return {
    schema: "optimizer-full-runtime-validation-summary-v1",
    status: !complete ? "INCOMPLETE" : base.failures > 0 ? "FAIL" : "PASS",
    complete,
    generatedAt: new Date().toISOString(),
    git: meta.git,
    discoveredXml,
    processedRows: rows.length,
    canonicalValidRows: rows.filter((row) => row.status !== "SKIP").length,
    ...base,
    safety: {
      candidateInvalid: rows.filter((r) => r.candidate && !r.candidate.valid).length,
      candidateBoardRegressions: rows.filter((r) => r.failures?.includes("candidate_board_regression")).length,
      candidateRemnantRegressions: rows.filter((r) => r.failures?.includes("candidate_remnant_regression")).length,
      autoBoardLossesVsAdvanced: rows.filter((r) => r.failures?.includes("auto_board_loss_vs_advanced")).length,
      autoRemnantLossesVsAdvanced: rows.filter((r) => r.failures?.includes("auto_remnant_loss_vs_advanced")).length,
      rustNotActive: rows.filter((r) => r.failures?.includes("rust_not_active")).length,
    },
    candidateVsBaseline: {
      ...base.candidateVsBaseline,
      boardsNetSaved: rows.reduce((sum, row) => {
        const a = row.baseline?.boards;
        const b = row.candidate?.boards;
        return Number.isFinite(a) && Number.isFinite(b) ? sum + (a - b) : sum;
      }, 0),
      remnant: remnantTriplet(rows, "candidateVsBaselineRemnant"),
    },
    candidateVsLepton: {
      ...base.candidateVsLepton,
      boardsNetSaved: rows.reduce((sum, row) => {
        const l = row.leptonBoards;
        const b = row.candidate?.boards;
        return Number.isFinite(l) && Number.isFinite(b) ? sum + (l - b) : sum;
      }, 0),
    },
    autoVsAdvanced: {
      ...base.autoVsAdvanced,
      remnant: remnantTriplet(rows, "autoVsAdvancedRemnant"),
    },
    performance: {
      baseline: timingSummary(validBaseline.map((r) => r.baseline)),
      candidate: timingSummary(validCandidate.map((r) => r.candidate)),
      advanced: timingSummary(validAdvanced.map((r) => r.advanced)),
    },
    auto: {
      enteredMaster: rows.filter((r) => r.auto?.enteredMaster).length,
      full40: rows.filter((r) => Number(r.auto?.roundsExecuted) >= 40).length,
      earlyMasterStops: rows.filter(
        (r) => r.auto?.enteredMaster && Number.isFinite(r.auto?.roundsExecuted) && r.auto.roundsExecuted < 40
      ).length,
      stopReasons: countBy(rows, (r) => r.auto?.stopReason),
    },
    remnantPolish: {
      runs: sum(rows.map((r) => r.remnantPolish?.runs)),
      attemptedBoards: sum(rows.map((r) => r.remnantPolish?.attemptedBoards)),
      improvedBoards: sum(rows.map((r) => r.remnantPolish?.improvedBoards)),
      invalidFinal: sum(rows.map((r) => r.remnantPolish?.invalidFinal)),
      totalMs: sum(rows.map((r) => r.remnantPolish?.ms)),
    },
    segments: {
      byTypes: segment(rows, [
        ["1", (r) => r.typeCount === 1],
        ["2-3", (r) => r.typeCount >= 2 && r.typeCount <= 3],
        ["4-10", (r) => r.typeCount >= 4 && r.typeCount <= 10],
        ["11-20", (r) => r.typeCount >= 11 && r.typeCount <= 20],
        ["21-40", (r) => r.typeCount >= 21 && r.typeCount <= 40],
        [">40", (r) => r.typeCount > 40],
      ]),
      byPieces: segment(rows, [
        ["<=50", (r) => r.pieceCount <= 50],
        ["51-120", (r) => r.pieceCount >= 51 && r.pieceCount <= 120],
        [">120", (r) => r.pieceCount > 120],
      ]),
      byLeptonBoards: segment(rows, [
        ["1-5", (r) => r.leptonBoards >= 1 && r.leptonBoards <= 5],
        ["6-15", (r) => r.leptonBoards >= 6 && r.leptonBoards <= 15],
        [">15", (r) => r.leptonBoards > 15],
      ]),
    },
    topCandidateSlow: validCandidate
      .slice()
      .sort((a, b) => b.candidate.wallMs - a.candidate.wallMs)
      .slice(0, 25)
      .map(compactRow),
    baselineReview: {
      cases: rows.filter((r) => baselineReviewReasons(r).length > 0).length,
      reasons: countReviewReasons(rows),
    },
    failuresPreview: rows.filter((r) => r.status === "FAIL").slice(0, 50).map(compactRow),
  };
}

function segment(rows, definitions) {
  return Object.fromEntries(
    definitions.map(([name, predicate]) => {
      const selected = rows.filter((row) => Number.isFinite(row.typeCount) && predicate(row));
      const s = summarize(selected);
      return [
        name,
        {
          cases: selected.length,
          failures: s.failures,
          candidateVsBaseline: s.candidateVsBaseline,
          candidateVsLepton: s.candidateVsLepton,
          autoVsAdvanced: s.autoVsAdvanced,
          candidateTiming: timingSummary(
            selected.filter((r) => r.candidate?.valid).map((r) => r.candidate)
          ),
        },
      ];
    })
  );
}

function timingSummary(arms) {
  const wall = arms.map((a) => a?.wallMs).filter(Number.isFinite);
  const cpu = arms.map((a) => a?.cpuMs).filter(Number.isFinite);
  return {
    cases: arms.length,
    totalWallMs: sum(wall),
    p50WallMs: quantile(wall, 0.5),
    p90WallMs: quantile(wall, 0.9),
    p95WallMs: quantile(wall, 0.95),
    p99WallMs: quantile(wall, 0.99),
    maxWallMs: wall.length ? Math.max(...wall) : null,
    totalCpuMs: sum(cpu),
    p50CpuMs: quantile(cpu, 0.5),
    p95CpuMs: quantile(cpu, 0.95),
    p99CpuMs: quantile(cpu, 0.99),
  };
}

function remnantTriplet(rows, key) {
  const values = rows.map((row) => row.comparisons?.[key]).filter(Number.isFinite);
  return {
    better: values.filter((v) => v > 0).length,
    equal: values.filter((v) => v === 0).length,
    worse: values.filter((v) => v < 0).length,
  };
}

function triplet(values) {
  return {
    better: values.filter((v) => v < 0).length,
    equal: values.filter((v) => v === 0).length,
    worse: values.filter((v) => v > 0).length,
  };
}

function compactRow(row) {
  return {
    caseKey: row.caseKey,
    caseId: row.caseId,
    fileName: row.fileName,
    typeCount: row.typeCount,
    pieceCount: row.pieceCount,
    leptonBoards: row.leptonBoards,
    baselineBoards: row.baseline?.boards ?? null,
    candidateBoards: row.candidate?.boards ?? null,
    advancedBoards: row.advanced?.boards ?? null,
    candidateWallMs: row.candidate?.wallMs ?? null,
    failures: row.failures,
    error: row.error ?? null,
  };
}

function renderSummaryMarkdown(summary) {
  const p = summary.performance;
  return `# FULL RUNTIME VALIDATION

- Complete: **${summary.complete}**
- Git: \`${summary.git?.head ?? "unknown"}\`
- XML discovered: **${summary.discoveredXml}**
- Rows processed: **${summary.processedRows}**
- Canonical valid rows: **${summary.canonicalValidRows}**
- Parse errors skipped: **${summary.parseErrors}**
- FAIL: **${summary.failures}**

## Candidate vs frozen V1
- Better / equal / worse boards: **${summary.candidateVsBaseline.better} / ${summary.candidateVsBaseline.equal} / ${summary.candidateVsBaseline.worse}**
- Net boards saved: **${summary.candidateVsBaseline.boardsNetSaved}**
- Remnant better / equal / worse: **${summary.candidateVsBaseline.remnant.better} / ${summary.candidateVsBaseline.remnant.equal} / ${summary.candidateVsBaseline.remnant.worse}**

## Candidate vs Lepton
- Better / equal / worse: **${summary.candidateVsLepton.better} / ${summary.candidateVsLepton.equal} / ${summary.candidateVsLepton.worse}**
- Net boards saved: **${summary.candidateVsLepton.boardsNetSaved}**

## Auto vs Advanced
- Better / equal / worse boards: **${summary.autoVsAdvanced.better} / ${summary.autoVsAdvanced.equal} / ${summary.autoVsAdvanced.worse}**
- Remnant better / equal / worse: **${summary.autoVsAdvanced.remnant.better} / ${summary.autoVsAdvanced.remnant.equal} / ${summary.autoVsAdvanced.remnant.worse}**

## V1 selective review
- Cases requiring V1 review: **${summary.baselineReview?.cases ?? 0}**

## Candidate timing
- total: **${formatNumber(p.candidate.totalWallMs)} ms**
- p50: **${formatNumber(p.candidate.p50WallMs)} ms**
- p90: **${formatNumber(p.candidate.p90WallMs)} ms**
- p95: **${formatNumber(p.candidate.p95WallMs)} ms**
- p99: **${formatNumber(p.candidate.p99WallMs)} ms**
- max: **${formatNumber(p.candidate.maxWallMs)} ms**

## Safety
- candidate invalid: **${summary.safety.candidateInvalid}**
- board regressions vs V1: **${summary.safety.candidateBoardRegressions}**
- remnant regressions vs V1: **${summary.safety.candidateRemnantRegressions}**
- Auto board losses vs Advanced: **${summary.safety.autoBoardLossesVsAdvanced}**
- Auto remnant losses vs Advanced: **${summary.safety.autoRemnantLossesVsAdvanced}**
- Rust not active: **${summary.safety.rustNotActive}**

## Remnant polish
- runs: **${summary.remnantPolish.runs}**
- attempted boards: **${summary.remnantPolish.attemptedBoards}**
- improved boards: **${summary.remnantPolish.improvedBoards}**
- invalid final: **${summary.remnantPolish.invalidFinal}**
- total ms: **${formatNumber(summary.remnantPolish.totalMs)}**
`;
}

function baselineReviewReasons(row) {
  const reasons = [];
  if (row.status === "SKIP") return reasons;
  if (!row.candidate?.valid) {
    reasons.push("candidate_invalid_or_exception");
    return reasons;
  }

  const candidateBoards = row.candidate?.boards;
  const lowerBound = row.candidate?.lowerBound;
  const leptonBoards = row.leptonBoards;

  if (Number.isFinite(leptonBoards) && Number.isFinite(candidateBoards) && candidateBoards > leptonBoards) {
    reasons.push("worse_than_lepton");
  }
  if (!Number.isFinite(lowerBound)) {
    reasons.push("no_safe_lower_bound");
  } else if (Number.isFinite(candidateBoards) && candidateBoards > lowerBound) {
    reasons.push("above_safe_lower_bound");
  }

  // A global safeLB certifies board count, not remnant quality. If Master
  // reduced the pre-Master incumbent, V1 can in principle reach the same board
  // count through a different physical plan. Review those cases with V1 so the
  // equal-board remnant contract is still tested without running V1 everywhere.
  const preMasterBoards = row.auto?.preMasterBoards;
  if (
    row.auto?.enteredMaster === true &&
    Number.isFinite(preMasterBoards) &&
    Number.isFinite(candidateBoards) &&
    candidateBoards < preMasterBoards
  ) {
    reasons.push("master_reduced_boards_remnant_review");
  }
  return reasons;
}

function countReviewReasons(rows) {
  const out = {};
  for (const row of rows) {
    for (const reason of baselineReviewReasons(row)) {
      out[reason] = (out[reason] || 0) + 1;
    }
  }
  return out;
}

function writeReviewFile(path, rows) {
  const selected = rows
    .map((row) => ({ row, reasons: baselineReviewReasons(row) }))
    .filter((entry) => entry.reasons.length > 0)
    .map(({ row, reasons }) => JSON.stringify({
      caseKey: row.caseKey,
      caseId: row.caseId,
      fileName: row.fileName,
      source: row.source,
      relativePath: row.relativePath,
      typeCount: row.typeCount,
      pieceCount: row.pieceCount,
      leptonBoards: row.leptonBoards,
      candidateBoards: row.candidate?.boards ?? null,
      safeLowerBound: row.candidate?.lowerBound ?? null,
      candidateRemnant: row.candidate?.remnant ?? null,
      auto: row.auto ?? null,
      reasons,
    }));
  writeFileSync(path, selected.join("\n") + (selected.length ? "\n" : ""));
}

function writeFailureFile(path, rows) {
  const failures = rows.filter((row) => row.status === "FAIL");
  writeFileSync(path, failures.map((row) => JSON.stringify(row)).join("\n") + (failures.length ? "\n" : ""));
}

function countBy(rows, getter) {
  const out = {};
  for (const row of rows) {
    const value = getter(row);
    if (value == null || value === "") continue;
    out[value] = (out[value] || 0) + 1;
  }
  return out;
}

function quantile(values, q) {
  if (!values.length) return null;
  const a = values.slice().sort((x, y) => x - y);
  const pos = (a.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (pos - lo);
}

function cmp(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sum(values) {
  return values.filter(Number.isFinite).reduce((a, b) => a + b, 0);
}

function finiteOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function hashParity(hash) {
  return parseInt(hash.slice(-2), 16) % 2;
}

function sha256Text(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sha256File(path) {
  const hash = createHash("sha256");
  const fd = openSync(path, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    for (;;) {
      const bytes = readSync(fd, buffer, 0, buffer.length, null);
      if (!bytes) break;
      hash.update(buffer.subarray(0, bytes));
    }
  } finally {
    closeSync(fd);
  }
  return hash.digest("hex");
}

function idFromFileName(name) {
  const matches = [...String(name).matchAll(/\d+/g)].map((m) => m[0]);
  if (!matches.length) return null;
  matches.sort((a, b) => b.length - a.length);
  const n = Number(matches[0]);
  return Number.isSafeInteger(n) ? n : matches[0];
}

function safeId(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}

function gitInfo() {
  const head = gitCommand(["rev-parse", "HEAD"]);
  const branch = gitCommand(["branch", "--show-current"]);
  const dirtyText = gitCommand(["status", "--porcelain"]);
  return {
    head: head || null,
    branch: branch || null,
    dirty: Boolean(dirtyText),
    dirtyStatus: dirtyText || "",
  };
}

function gitCommand(args) {
  const r = spawnSync("git", args, { cwd: REPO, encoding: "utf8" });
  return r.status === 0 ? String(r.stdout || "").trim() : "";
}

function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return "?";
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

function formatNumber(value) {
  return Number.isFinite(value) ? Number(value).toFixed(3) : "n/a";
}

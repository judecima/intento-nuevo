#!/usr/bin/env node

import { build } from "esbuild";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { cpus, hostname, platform, release, totalmem } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { prepareValidationSelection } from "./prepare-production-runtime-v1-selection.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const outputDir = resolve(args.output);
const metaPath = join(outputDir, "FULL_RUNTIME_VALIDATION_META.json");
const selectionPath = join(outputDir, "FULL_RUNTIME_VALIDATION_SELECTION.jsonl");
const queuePath = join(outputDir, "FULL_RUNTIME_VALIDATION_V1_QUEUE.jsonl");
const evidencePath = join(outputDir, "FULL_RUNTIME_VALIDATION_EVIDENCE.jsonl");
const resultsPath = join(outputDir, "FULL_RUNTIME_VALIDATION_V1_REVIEW_RESULTS.jsonl");
const failuresPath = join(outputDir, "FULL_RUNTIME_VALIDATION_V1_REVIEW_FAILURES.jsonl");
const summaryPath = join(outputDir, "FULL_RUNTIME_VALIDATION_V1_REVIEW_SUMMARY.json");

if (!existsSync(metaPath)) {
  throw new Error(
    "Falta FULL_RUNTIME_VALIDATION_META.json. Ejecuta primero la pasada --candidate-only."
  );
}

sanitizeOptimizerEnvironment();

const sourceMeta = JSON.parse(readFileSync(metaPath, "utf8"));
const currentGit = gitCommand(["rev-parse", "HEAD"]) || null;
if (
  sourceMeta.git?.head &&
  currentGit &&
  sourceMeta.git.head !== currentGit
) {
  if (args.forceCrossCommit) {
    console.warn("ADVERTENCIA: --force-cross-commit activo; la comparacion cruza commits deliberadamente.");
  } else if (validatorOnlyCompatible(sourceMeta.git.head, currentGit)) {
    console.warn(
      "INFO: la pasada Auto pertenece a " + sourceMeta.git.head +
      " y el validator corre en " + currentGit +
      "; solo cambiaron archivos de validacion permitidos, el runtime del optimizador es identico."
    );
  } else {
    throw new Error(
      "La pasada Auto pertenece a " + sourceMeta.git.head +
      " y V1 se ejecutaria sobre " + currentGit +
      ". Usa el mismo runtime o --force-cross-commit para una auditoria deliberada."
    );
  }
}

const preparedSelection = prepareValidationSelection(outputDir, {
  controlSize: args.controlSize,
  tailSize: args.tailSize,
});
const reviewRows = preparedSelection.queue;
const existing = existsSync(resultsPath) ? readJsonl(resultsPath) : [];
const done = new Set(existing.map((row) => row.caseKey));
const selectedReview = Number.isFinite(args.limit)
  ? reviewRows.filter((row) => !done.has(row.caseKey)).slice(0, args.limit)
  : reviewRows.filter((row) => !done.has(row.caseKey));

const fileMap = buildFileMap(sourceMeta.inputs || []);
for (const row of reviewRows) {
  if (!fileMap.has(row.caseKey)) {
    throw new Error(`No encuentro XML para ${row.caseKey}. Revisa los roots guardados en META.`);
  }
}

console.log(
  `Cola V1: ${reviewRows.length} (REVIEW_REQUIRED + CONTROL_SAMPLE). ` +
  `Ya comparados: ${done.size}. A ejecutar: ${selectedReview.length}.`
);

const bundlePath = join(REPO, "node_modules", ".cache", "full-runtime-validation", "optimizer-v1-review.mjs");
mkdirSync(dirname(bundlePath), { recursive: true });
const anchor = pathToFileURL(
  join(REPO, "src", "lib", "optimizer", "experience", "revalidate.ts")
).href;

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
const allRows = [...existing];
let sessionDone = 0;
const started = performance.now();

for (const review of selectedReview) {
  const path = fileMap.get(review.caseKey);
  const rowStarted = performance.now();
  let out;

  try {
    const xml = readFileSync(path, "utf8");
    const parsed = optimizer.parseCanonicalXml(xml, {
      fileName: review.fileName,
      defaultKerf: 4.5,
      defaultMinRemnant: 250,
      defaultMinCommercialRemnantLongSide: 400,
    });
    const input = optimizer.benchmarkInputFromCanonicalCase(parsed.case, {
      strategy: "v10",
      profile: "balanced",
    });
    input.projectId = `v1-review-${safeId(review.caseKey)}`;

    const baseline = timed(() =>
      optimizer.optimizeProject(input, {
        motorVersion: "v1",
        effortMode: "fixed",
        patternGenerator: "rust",
      })
    );
    assertRust(baseline);

    if (!baseline?.ok || !baseline.result) {
      throw new Error("V1_RUNTIME_ERROR: " + (baseline?.error ?? "V1 returned no result"));
    }

    const baselineValid = baseline.result.validation.ok === true;
    const baselineBoards = baseline.result.metrics.boardCount;
    const candidateBoards = review.candidateBoards;
    const candidateAvailable = Number.isFinite(candidateBoards);
    const boardsCmp =
      candidateAvailable && Number.isFinite(baselineBoards)
        ? cmp(candidateBoards, baselineBoards)
        : null;

    const baselineRemnant = remnantQuality(baseline.result);
    const remnantCmp =
      boardsCmp === 0 && review.candidateRemnant
        ? compareRemnantObjects(review.candidateRemnant, baselineRemnant)
        : null;

    const failures = [];
    if (!baseline.ok || !baselineValid) failures.push("baseline_invalid");
    if (!candidateAvailable) failures.push("candidate_unavailable");
    if (boardsCmp > 0) failures.push("candidate_board_regression");
    if (boardsCmp === 0 && remnantCmp < 0) failures.push("candidate_remnant_regression");
    const comparisonStatus = !candidateAvailable
      ? "NOT_COMPARABLE"
      : failures.length
        ? "FAILED"
        : "COMPARED";

    out = {
      schema: "optimizer-v1-selective-review-row-v1",
      status: failures.length ? "FAIL" : "OK",
      failures,
      caseKey: review.caseKey,
      caseId: review.caseId,
      fileName: review.fileName,
      selectionReason: review.selectionReason,
      comparisonStatus,
      proofScope: review.proofScope,
      reasonCodes: review.reasonCodes,
      route: review.route,
      stratum: review.stratum,
      typeCount: review.typeCount,
      pieceCount: review.pieceCount,
      leptonBoards: review.leptonBoards,
      safeLowerBound: review.globalLowerBound,
      candidateBoards,
      baselineBoards,
      candidateVsBaselineBoards: boardsCmp,
      candidateRemnant: review.candidateRemnant,
      baselineRemnant,
      candidateVsBaselineRemnant: remnantCmp,
      baseline: armRow(baseline),
      rowWallMs: +(performance.now() - rowStarted).toFixed(3),
    };
  } catch (error) {
    out = {
      schema: "optimizer-v1-selective-review-row-v1",
      status: "FAIL",
      failures: ["exception"],
      caseKey: review.caseKey,
      caseId: review.caseId,
      fileName: review.fileName,
      selectionReason: review.selectionReason,
      comparisonStatus: "FAILED",
      proofScope: review.proofScope,
      reasonCodes: review.reasonCodes,
      route: review.route,
      stratum: review.stratum,
      error: String(error?.stack || error),
      rowWallMs: +(performance.now() - rowStarted).toFixed(3),
    };
  }

  appendFileSync(resultsPath, JSON.stringify(out) + "\n");
  allRows.push(out);
  done.add(out.caseKey);
  sessionDone++;

  if (
    sessionDone === 1 ||
    sessionDone % args.progressEvery === 0 ||
    sessionDone === selectedReview.length ||
    out.status === "FAIL"
  ) {
    const s = summarize(allRows, reviewRows.length);
    writeJson(summaryPath, s);
    writeFailures(failuresPath, allRows);
    writeEvidence(evidencePath, preparedSelection.entries, allRows);
    const elapsed = performance.now() - started;
    const eta = sessionDone ? (elapsed / sessionDone) * (selectedReview.length - sessionDone) : 0;
    console.log(
      `[${done.size}/${reviewRows.length}] FAIL=${s.failures} | Auto vs V1 M/E/P=` +
      `${s.candidateVsBaseline.better}/${s.candidateVsBaseline.equal}/${s.candidateVsBaseline.worse} | ` +
      `ETA ${formatDuration(eta)}`
    );
  }
}

const summary = summarize(allRows, reviewRows.length);
writeJson(summaryPath, summary);
writeFailures(failuresPath, allRows);
writeEvidence(evidencePath, preparedSelection.entries, allRows);

console.log("\nResultado V1 selectivo:");
console.log(resultsPath);
console.log(summaryPath);
console.log(failuresPath);
console.log(selectionPath);
console.log(queuePath);
console.log(evidencePath);

if (summary.failures > 0) process.exitCode = 2;

function parseArgs(argv) {
  const out = {
    output: join(REPO, "validation-full"),
    limit: Infinity,
    progressEvery: 10,
    controlSize: 300,
    tailSize: 50,
    forceCrossCommit: false,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--output") out.output = argv[++i];
    else if (argv[i] === "--limit") out.limit = Number(argv[++i]);
    else if (argv[i] === "--progress-every") out.progressEvery = Math.max(1, Number(argv[++i]) || 10);
    else if (argv[i] === "--control-size") out.controlSize = Math.max(0, Number(argv[++i]) || 0);
    else if (argv[i] === "--tail-size") out.tailSize = Math.max(0, Number(argv[++i]) || 0);
    else if (argv[i] === "--force-cross-commit") out.forceCrossCommit = true;
    else throw new Error(`Argumento desconocido: ${argv[i]}`);
  }
  return out;
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
    ) delete process.env[key];
  }
  process.env.OPTIMIZER_V2_REMNANT_POLISH = "1";
}

function buildFileMap(inputs) {
  const map = new Map();
  inputs.forEach((item, index) => {
    const root = item.root;
    if (!root || !existsSync(root)) {
      throw new Error(`No existe root de input guardado en META: ${root}`);
    }
    for (const path of walkXml(root)) {
      const rel = relative(root, path).replaceAll("\\", "/");
      map.set(`${index}:${rel}`, path);
    }
  });
  return map;
}

function walkXml(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === ".extracted-ok") continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".xml")) out.push(full);
    }
  }
  return out;
}

function timed(fn) {
  const cpu = process.cpuUsage();
  const wall = performance.now();
  try {
    const result = fn();
    const used = process.cpuUsage(cpu);
    return {
      ok: true,
      result,
      wallMs: +(performance.now() - wall).toFixed(3),
      cpuMs: +((used.user + used.system) / 1000).toFixed(3),
    };
  } catch (error) {
    const used = process.cpuUsage(cpu);
    return {
      ok: false,
      error: String(error?.stack || error),
      wallMs: +(performance.now() - wall).toFixed(3),
      cpuMs: +((used.user + used.system) / 1000).toFixed(3),
    };
  }
}

function assertRust(arm) {
  if (!arm?.ok || !arm.result) return;
  if (arm.result.metrics.patternGenerator !== "rust") {
    throw new Error(
      `RUST_REQUIRED_FOR_CERTIFICATION: V1 devolvio patternGenerator=${arm.result.metrics.patternGenerator}`
    );
  }
}

function armRow(arm) {
  if (!arm?.ok || !arm.result) {
    return { ok: false, valid: false, error: arm?.error ?? "unknown", wallMs: arm?.wallMs ?? null };
  }
  return {
    ok: true,
    valid: arm.result.validation.ok === true,
    algorithmVersion: arm.result.algorithmVersion,
    boards: arm.result.metrics.boardCount,
    wallMs: arm.wallMs,
    cpuMs: arm.cpuMs,
    engineMs: arm.result.metrics.engineMs ?? null,
    patternGenerator: arm.result.metrics.patternGenerator ?? null,
    lowerBound: arm.result.raw?.cotaV10 ?? null,
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

function compareRemnantObjects(a, b) {
  const eps = 1e-9;
  if (a.largestM2 > b.largestM2 + eps) return 1;
  if (b.largestM2 > a.largestM2 + eps) return -1;
  if (a.secondM2 > b.secondM2 + eps) return 1;
  if (b.secondM2 > a.secondM2 + eps) return -1;
  if (a.fragments !== b.fragments) return a.fragments < b.fragments ? 1 : -1;
  if (a.totalM2 > b.totalM2 + eps) return 1;
  if (b.totalM2 > a.totalM2 + eps) return -1;
  return 0;
}

function summarize(rows, expected) {
  const values = rows.map((r) => r.candidateVsBaselineBoards).filter(Number.isFinite);
  const remnant = rows.map((r) => r.candidateVsBaselineRemnant).filter(Number.isFinite);
  const walls = rows.map((r) => r.baseline?.wallMs).filter(Number.isFinite).sort((a,b)=>a-b);
  return {
    schema: "optimizer-v1-selective-review-summary-v1",
    generatedAt: new Date().toISOString(),
    sourceCandidateGit: sourceMeta.git?.head ?? null,
    reviewGit: gitCommand(["rev-parse", "HEAD"]) || null,
    expectedCases: expected,
    processedCases: rows.length,
    complete: rows.length >= expected,
    failures: rows.filter((r) => r.status === "FAIL").length,
    evidence: {
      reviewRequiredCompared: rows.filter((r) => r.selectionReason === "REVIEW_REQUIRED" && r.comparisonStatus === "COMPARED").length,
      controlSampleCompared: rows.filter((r) => r.selectionReason === "CONTROL_SAMPLE" && r.comparisonStatus === "COMPARED").length,
      comparisonFailed: rows.filter((r) => r.comparisonStatus === "FAILED").length,
      notComparable: rows.filter((r) => r.comparisonStatus === "NOT_COMPARABLE").length,
    },
    candidateVsBaseline: {
      better: values.filter((v) => v < 0).length,
      equal: values.filter((v) => v === 0).length,
      worse: values.filter((v) => v > 0).length,
      remnantBetter: remnant.filter((v) => v > 0).length,
      remnantEqual: remnant.filter((v) => v === 0).length,
      remnantWorse: remnant.filter((v) => v < 0).length,
    },
    performance: {
      cases: walls.length,
      totalWallMs: walls.reduce((a,b)=>a+b,0),
      p50WallMs: quantile(walls, 0.5),
      p95WallMs: quantile(walls, 0.95),
      p99WallMs: quantile(walls, 0.99),
      maxWallMs: walls.length ? walls[walls.length - 1] : null,
    },
    environment: {
      node: process.version,
      platform: platform(),
      release: release(),
      hostname: hostname(),
      cpuModel: cpus()[0]?.model ?? null,
      cpuCount: cpus().length,
      totalMemoryBytes: totalmem(),
    },
  };
}

function quantile(a, q) {
  if (!a.length) return null;
  const pos = (a.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (pos - lo);
}

function writeFailures(path, rows) {
  const f = rows.filter((r) => r.status === "FAIL");
  writeFileSync(path, f.map((r) => JSON.stringify(r)).join("\n") + (f.length ? "\n" : ""));
}

function writeEvidence(path, selectionEntries, comparisonRows) {
  const comparisons = new Map(comparisonRows.map((row) => [row.caseKey, row]));
  const evidence = selectionEntries.map((entry) => {
    const comparison = comparisons.get(entry.caseKey);
    if (!comparison) return entry;
    return {
      ...entry,
      comparisonStatus: comparison.comparisonStatus,
      v1: {
        status: comparison.status,
        failures: comparison.failures,
        boards: comparison.baselineBoards ?? null,
        remnant: comparison.baselineRemnant ?? null,
        wallMs: comparison.baseline?.wallMs ?? null,
      },
      comparison: {
        candidateVsV1Boards: comparison.candidateVsBaselineBoards ?? null,
        candidateVsV1Remnant: comparison.candidateVsBaselineRemnant ?? null,
      },
    };
  });
  writeFileSync(
    path,
    evidence.map((row) => JSON.stringify(row)).join("\n") + (evidence.length ? "\n" : "")
  );
}

function readJsonl(path) {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function cmp(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function safeId(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}

function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

function validatorOnlyCompatible(sourceGit, currentGit) {
  const allowed = new Set([
    "scripts/validate-production-runtime-full.mjs",
    "scripts/validate-production-runtime-v1-review.mjs",
    "scripts/prepare-production-runtime-v1-selection.mjs",
    "scripts/replay-production-runtime-attribution.mjs",
    "package.json",
    ".github/workflows/optimizer-saas-hardening.yml",
    "research/optimizer/RUNTIME_ATTRIBUTION_MILESTONE_2026-09-24.md",
  ]);
  const diff = gitCommand(["diff", "--name-only", sourceGit + ".." + currentGit]);
  if (!diff) return true;
  const paths = diff.split(/\r?\n/).filter(Boolean);
  return paths.length > 0 && paths.every((path) => allowed.has(path));
}

function gitCommand(args) {
  const r = spawnSync("git", args, { cwd: REPO, encoding: "utf8" });
  return r.status === 0 ? String(r.stdout || "").trim() : "";
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return "?";
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h,m,sec].map((n)=>String(n).padStart(2,"0")).join(":");
}

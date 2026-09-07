#!/usr/bin/env node
import { createHash } from "node:crypto";
import { fork } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT = fileURLToPath(import.meta.url);
const REPO = resolve(dirname(SCRIPT), "../..");
const EXPECTED_ACCEPTED_HASH = "36d005421ae79b01867e0bba377c1bf526801bcd4dcfa2b0180e12cf354458f3";
const FREEZE_DIR = join(REPO, "research/optimizer/freeze");
const AUDIT_PATH = join(FREEZE_DIR, "KERNEL_V1_RESTO_ARCHIVE_AUDIT_2026-09-07.json");
const POLICY_PATH = join(FREEZE_DIR, "KERNEL_V1_FORMAL_CERTIFICATION_POLICY.json");
const EMBEDDED_PATH = join(REPO, "experiencia/canonical_cases.json");
const HOTSPOT_PATH = join(REPO, "experiencia/v6/hotspot-all.jsonl");

const args = parseArgs(process.argv.slice(2));
if (args.child) await childRun(args);
else await main(args);

async function main(args) {
  const corpus = resolve(String(args.corpus ?? ""));
  if (!args.corpus || !existsSync(corpus)) fail("--corpus <extracted-resto> required");

  const out = resolve(args.out ?? join(REPO, "test-results/kernel-v1-formal-certification"));
  mkdirSync(out, { recursive: true });

  const maxNew = args.maxNew == null ? Infinity : positiveInt(args.maxNew, "--maxNew");
  const timeoutMs = args.timeout == null ? 7_200_000 : positiveInt(args.timeout, "--timeout");
  const policy = readJson(POLICY_PATH);
  if (policy.correctnessPredicate?.id !== "HISTORICAL_VALIDITY_V1") {
    fail("correctness contract not recovered");
  }

  const bundle = await buildBundle(out);
  const state = await preparePhysicalCorpus(bundle, corpus, out);
  const hints = readHistoricalTimingHints();
  const ordered = orderCalibration(
    state.feasible,
    hints,
    policy.execution?.knownExtremeTailOrders ?? [],
  );

  const checkpoint = join(out, "calibration.partial.jsonl");
  const done = new Set(readJsonl(checkpoint).filter((row) => row.ok).map((row) => row.file));
  const env = cleanOptimizerEnv();
  env.OPTIMIZER_V10_STAGED_EXPERIMENTAL = "0";
  env.OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL = "0";
  env.OPTIMIZER_STEP0_TELEMETRY = "1";

  let added = 0;
  for (const item of ordered) {
    if (done.has(item.file) || added >= maxNew) continue;

    const result = await runCase({ bundle, item, env, timeoutMs, out });
    const row = {
      phase: "calibration",
      file: item.file,
      referencePanels: item.referencePanels,
      historicalEngineMs: hints.get(item.file) ?? null,
      ...result,
    };
    appendFileSync(checkpoint, JSON.stringify(row) + "\n", "utf8");
    added++;

    if (
      !result.ok ||
      !result.validationOk ||
      result.cacheHit ||
      result.pieces !== result.expectedPieces ||
      !result.demandMultisetOk
    ) {
      writeCalibrationSummary(checkpoint, state, hints, out);
      fail(`calibration validity failed: ${item.file}`);
    }

    writeCalibrationSummary(checkpoint, state, hints, out);
    console.log(JSON.stringify({
      phase: "calibration",
      file: item.file,
      wallMs: result.wallMs,
      beamExpansions: result.step0?.beam?.expansionsTotal ?? 0,
      beamCalls: result.step0?.beam?.calls ?? 0,
      masterNodes: result.step0?.master?.nodesTotal ?? 0,
      masterRuns: result.step0?.master?.runs ?? 0,
      oneboardAttempts: result.step0?.oneboard?.attemptsTotal ?? 0,
      oneboardRuns: result.step0?.oneboard?.runs ?? 0,
    }));
  }

  writeCalibrationSummary(checkpoint, state, hints, out);
}

async function preparePhysicalCorpus(bundle, corpus, out) {
  const optimizer = await import(pathToFileURL(bundle).href);
  const audit = readJson(AUDIT_PATH);
  const embedded = readJson(EMBEDDED_PATH);
  if (!Array.isArray(embedded)) fail("canonical_cases.json must be an array");

  const rejections = audit?.currentParser?.rejections ?? [];
  if (!Array.isArray(rejections) || rejections.length !== 19) {
    fail(`audit rejection manifest must contain 19 entries, got ${rejections.length}`);
  }
  for (const entry of rejections) {
    if (typeof entry?.file !== "string" || !/\.xml$/i.test(entry.file)) {
      fail(`audit rejection entry lacks literal file identity: ${JSON.stringify(entry)}`);
    }
  }
  if (new Set(rejections.map((entry) => entry.file)).size !== 19) {
    fail("audit rejection filenames are not unique");
  }

  const restoRecords = embedded.filter((record) => partition(record.source_path) === "resto");
  const restoIds = [...new Set(restoRecords.map(identity).filter(Boolean))].sort(cmp);
  if (restoIds.length !== 8663) fail(`embedded resto distinct XML ${restoIds.length}, expected 8663`);

  const mixed = rejections.filter((entry) => entry.code === "mixed-board-formats");
  const strict = rejections.filter((entry) => entry.code !== "mixed-board-formats");
  if (mixed.length !== 13 || strict.length !== 6) {
    fail(`audit rejection partition ${mixed.length}/${strict.length}, expected 13/6`);
  }

  const restoSet = new Set(restoIds);
  for (const entry of mixed) {
    if (!restoSet.has(entry.file)) fail(`mixed-board literal identity absent from embedded resto: ${entry.file}`);
  }
  for (const entry of strict) {
    if (restoSet.has(entry.file)) fail(`strict malformed identity unexpectedly present in embedded resto: ${entry.file}`);
  }

  const mixedSet = new Set(mixed.map((entry) => entry.file));
  const comparableEmbeddedRecords = restoRecords.filter((record) => !mixedSet.has(identity(record)));
  const referenceByFile = new Map();
  for (const record of comparableEmbeddedRecords) {
    const file = identity(record);
    if (!file) continue;
    if (referenceByFile.has(file)) fail(`multiple comparable embedded records for ${file}`);
    referenceByFile.set(
      file,
      Number.isFinite(Number(record.reference_panels)) ? Number(record.reference_panels) : null,
    );
  }
  if (referenceByFile.size !== 8650) {
    fail(`comparable embedded identity count ${referenceByFile.size}, expected 8650`);
  }

  const names = readdirSync(corpus)
    .filter((name) => name.toLowerCase().endsWith(".xml"))
    .sort(cmp);
  if (names.length !== 8669 || new Set(names).size !== 8669) {
    fail(`physical corpus ${names.length}, expected 8669 unique XML`);
  }

  // Exact physical archive identity = all 8,663 identities preserved by the embedded
  // resto projection + the six literal malformed filenames that never entered it.
  // No filename is reconstructed from audit stems.
  const expectedArchive = [...new Set([
    ...restoIds,
    ...strict.map((entry) => entry.file),
  ])].sort(cmp);
  if (expectedArchive.length !== 8669) {
    fail(`expected archive identity cardinality ${expectedArchive.length}, expected 8669`);
  }
  sameSet(names, expectedArchive, "archive identity");

  const rejectExpected = new Map(rejections.map((entry) => [entry.file, String(entry.code)]));
  const accepted = [];
  const rejected = [];

  for (const file of names) {
    try {
      const parsed = optimizer.parseCanonicalXml(
        readFileSync(join(corpus, file), "utf8"),
        { fileName: file },
      );
      accepted.push({
        file,
        case: parsed.case,
        referencePanels: referenceByFile.get(file) ?? null,
      });
    } catch (error) {
      rejected.push({
        file,
        code: String(error?.code ?? "unknown"),
      });
    }
  }

  if (accepted.length !== 8650 || rejected.length !== 19) {
    fail(`parser classification ${accepted.length}/${rejected.length}, expected 8650/19`);
  }

  const actualReject = new Map(rejected.map((entry) => [entry.file, entry.code]));
  if (actualReject.size !== rejectExpected.size) {
    fail(`rejection cardinality drift ${actualReject.size}/${rejectExpected.size}`);
  }
  for (const [file, code] of rejectExpected) {
    const actual = actualReject.get(file);
    if (actual !== code) fail(`rejection drift ${file}: ${actual ?? "missing"} != ${code}`);
  }
  for (const file of actualReject.keys()) {
    if (!rejectExpected.has(file)) fail(`unexpected rejected identity: ${file}`);
  }

  const acceptedIds = accepted.map((entry) => entry.file).sort(cmp);
  const acceptedHash = hashList(acceptedIds);
  if (acceptedHash !== EXPECTED_ACCEPTED_HASH) {
    fail(`accepted identity hash drift ${acceptedHash}`);
  }
  sameSet(acceptedIds, [...referenceByFile.keys()], "accepted/comparable identity");

  const feasible = [];
  const infeasible = [];
  for (const item of accepted) {
    const impossible = impossiblePieces(item.case);
    if (impossible.length) infeasible.push({ ...item, impossible });
    else feasible.push(item);
  }

  writeJson(join(out, "expected-infeasible.json"), {
    schemaVersion: "kernel-v1-expected-infeasible-v2",
    generatedAt: new Date().toISOString(),
    predicate: "HISTORICAL_VALIDITY_V1",
    acceptedCanonicalCases: 8650,
    feasibleCases: feasible.length,
    expectedInfeasibleCases: infeasible.length,
    cases: infeasible.map((item) => ({
      file: item.file,
      referencePanels: item.referencePanels,
      impossible: item.impossible,
    })),
  });

  writeJson(join(out, "corpus-preflight.json"), {
    schemaVersion: "kernel-v1-physical-corpus-preflight-v2",
    generatedAt: new Date().toISOString(),
    archiveXml: names.length,
    archiveUniqueNames: new Set(names).size,
    identityBinding: "literal-filenames-only",
    rejectionManifestEntries: rejections.length,
    rejectionManifestExact: true,
    parserAccepted: accepted.length,
    parserRejected: rejected.length,
    acceptedIdentitySetSha256: acceptedHash,
    feasibleCases: feasible.length,
    expectedInfeasibleCases: infeasible.length,
  });

  return { feasible, infeasible };
}

async function buildBundle(out) {
  const { build } = await import("esbuild");
  const file = join(out, "kernel-v1-candidate.mjs");
  const anchor = pathToFileURL(join(REPO, "src/lib/optimizer/engine/legacy-engine.ts")).href;
  await build({
    entryPoints: [join(REPO, "src/lib/optimizer/index.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    outfile: file,
    define: { "import.meta.url": JSON.stringify(anchor) },
    logLevel: "warning",
  });
  return file;
}

async function runCase({ bundle, item, env, timeoutMs, out }) {
  const dir = join(out, ".cases");
  mkdirSync(dir, { recursive: true });
  const id = sha256(item.file).slice(0, 16);
  const inputPath = join(dir, `${id}.json`);
  const resultPath = join(dir, `${id}.result.json`);
  writeJson(inputPath, item.case);

  return new Promise((resolvePromise, rejectPromise) => {
    const child = fork(
      SCRIPT,
      ["--child", bundle, "--case-json", inputPath, "--result", resultPath],
      { env, stdio: ["ignore", "ignore", "inherit", "ipc"] },
    );
    let record = null;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.on("message", (message) => { record = message; });
    child.on("error", (error) => {
      clearTimeout(timer);
      rejectPromise(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (timedOut) rejectPromise(new Error(`operational watchdog ${timeoutMs}ms`));
      else if (code !== 0 || !record) rejectPromise(new Error(`worker ${code}`));
      else resolvePromise(record);
    });
  });
}

async function childRun(args) {
  const optimizer = await import(pathToFileURL(resolve(args.child)).href);
  const canonical = readJson(resolve(args["case-json"]));
  const input = optimizer.benchmarkInputFromCanonicalCase(canonical, { strategy: "v10" });

  const cpuStart = process.cpuUsage();
  const started = performance.now();
  const result = optimizer.optimizeProject(input);
  const wallMs = performance.now() - started;
  const cpu = process.cpuUsage(cpuStart);
  const step0 = result.raw?.metricasV10?.step0 ?? null;
  const demand = compareDemand(canonical, result.placements);

  const record = {
    ok: true,
    wallMs,
    cpuMs: (cpu.user + cpu.system) / 1000,
    engineMs: result.metrics.engineMs,
    cacheHit: Boolean(result.metrics.cacheHit),
    boards: result.metrics.boardCount,
    pieces: result.placements.length,
    expectedPieces: result.metrics.expectedPieceCount,
    validationOk: Boolean(result.validation?.ok),
    demandMultisetOk: demand.ok,
    demandMultiset: demand,
    step0,
  };

  writeJson(resolve(args.result), record);
  process.send?.(record);
}

function impossiblePieces(canonical) {
  const usableWidth = Number(canonical.panel.width) - Number(canonical.trim?.x ?? 0);
  const usableHeight = Number(canonical.panel.height) - Number(canonical.trim?.y ?? 0);
  const eps = 0.001;
  const impossible = [];

  for (const piece of canonical.pieces ?? []) {
    const width = Number(piece.width);
    const height = Number(piece.height);
    const direct = width <= usableWidth + eps && height <= usableHeight + eps;
    const rotationAllowed = piece.rotationAllowed !== false;
    const rotated = rotationAllowed && height <= usableWidth + eps && width <= usableHeight + eps;
    if (!direct && !rotated) {
      impossible.push({
        reference: piece.reference,
        width,
        height,
        quantity: piece.quantity,
        rotationAllowed,
        usableWidth,
        usableHeight,
      });
    }
  }
  return impossible;
}

function compareDemand(canonical, placements) {
  const expected = new Map();
  const actual = new Map();

  for (const piece of canonical.pieces ?? []) {
    const key = demandKey(piece);
    expected.set(key, (expected.get(key) ?? 0) + Number(piece.quantity ?? 0));
  }
  for (const placement of placements ?? []) {
    const key = demandKey({
      reference: placement.reference,
      width: placement.sourceWidth,
      height: placement.sourceHeight,
      edges: placement.edges,
      edgeType: placement.edgeType,
    });
    actual.set(key, (actual.get(key) ?? 0) + 1);
  }

  const keys = [...new Set([...expected.keys(), ...actual.keys()])];
  const differences = keys
    .map((key) => ({ key, expected: expected.get(key) ?? 0, actual: actual.get(key) ?? 0 }))
    .filter((row) => row.expected !== row.actual);
  return { ok: differences.length === 0, differences };
}

function demandKey(piece) {
  const edges = piece.edges ?? {};
  return JSON.stringify({
    reference: String(piece.reference ?? ""),
    width: normalizedNumber(piece.width),
    height: normalizedNumber(piece.height),
    edges: {
      top: Boolean(edges.top),
      bottom: Boolean(edges.bottom),
      left: Boolean(edges.left),
      right: Boolean(edges.right),
    },
    edgeType: String(piece.edgeType ?? "none"),
  });
}

function writeCalibrationSummary(path, state, hints, out) {
  const rows = uniqueByFile(readJsonl(path).filter((row) => row.ok));
  const values = (getter) => distribution(rows.map((row) => Number(getter(row) ?? 0)));
  const totalHistoricalMs = [...hints.values()].reduce((sum, value) => sum + value, 0);
  const completedHistoricalMs = rows.reduce((sum, row) => sum + (hints.get(row.file) ?? 0), 0);

  writeJson(join(out, "calibration.summary.json"), {
    schemaVersion: "kernel-v1-calibration-summary-v3",
    updatedAt: new Date().toISOString(),
    status: rows.length === state.feasible.length ? "COMPLETE" : "PARTIAL",
    feasibleCasesCompleted: rows.length,
    feasibleCasesTotal: state.feasible.length,
    expectedInfeasibleCases: state.infeasible.length,
    aggregatePerOrderDistributions: {
      wallMs: values((row) => row.wallMs),
      cpuMs: values((row) => row.cpuMs),
      beamExpansionsTotal: values((row) => row.step0?.beam?.expansionsTotal),
      beamCalls: values((row) => row.step0?.beam?.calls),
      masterNodesTotal: values((row) => row.step0?.master?.nodesTotal),
      masterRuns: values((row) => row.step0?.master?.runs),
      oneboardAttemptsTotal: values((row) => row.step0?.oneboard?.attemptsTotal),
      oneboardRuns: values((row) => row.step0?.oneboard?.runs),
    },
    historicalHotspotTimingMass: {
      completedMs: completedHistoricalMs,
      totalMs: totalHistoricalMs,
      coveragePct: pct(completedHistoricalMs, totalHistoricalMs),
    },
    rule: "Calibrate from aggregate per-order work. Do not translate the legacy Beam 1500ms per-call budget into an expansion count.",
    aggregateStopCondition: "Not added during Kernel V1 freeze; adding it requires a new candidate.",
  });
}

function readHistoricalTimingHints() {
  const map = new Map();
  if (!existsSync(HOTSPOT_PATH)) return map;

  for (const line of readFileSync(HOTSPOT_PATH, "utf8").split(/\r?\n/).filter(Boolean)) {
    const row = JSON.parse(line);
    if (row.ok === false || row.engineCacheHit) continue;
    if (typeof row.file === "string" && Number.isFinite(row.engineMs)) {
      map.set(row.file, Number(row.engineMs));
    }
  }
  return map;
}

function orderCalibration(items, hints, tailOrders) {
  const tails = new Set(tailOrders.map(String));
  return [...items].sort((a, b) => {
    const aTail = [...tails].some((order) => a.file.includes(order));
    const bTail = [...tails].some((order) => b.file.includes(order));
    if (aTail !== bTail) return aTail ? 1 : -1;

    const aHint = hints.get(a.file);
    const bHint = hints.get(b.file);
    if (Number.isFinite(aHint) && Number.isFinite(bHint) && aHint !== bHint) return aHint - bHint;
    if (Number.isFinite(aHint) !== Number.isFinite(bHint)) return Number.isFinite(aHint) ? -1 : 1;

    const quantityDelta = pieceQuantity(a.case) - pieceQuantity(b.case);
    return quantityDelta || cmp(a.file, b.file);
  });
}

function cleanOptimizerEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("OPTIMIZER_")) delete env[key];
  }
  return env;
}

function partition(sourcePath) {
  const segments = String(sourcePath ?? "").replace(/\\/g, "/").split("/").filter(Boolean);
  const index = segments.lastIndexOf("xml_experience");
  return index >= 0 ? (segments[index + 1] ?? "(root)") : "(outside)";
}

function identity(record) {
  const source = String(record?.source_path ?? "").replace(/\\/g, "/");
  return source ? basename(source) : null;
}

function sameSet(actual, expected, label) {
  const a = [...actual].sort(cmp);
  const b = [...expected].sort(cmp);
  if (a.length !== b.length) fail(`${label} cardinality ${a.length} != ${b.length}`);
  for (let index = 0; index < a.length; index++) {
    if (a[index] !== b[index]) fail(`${label} ${index}: ${a[index]} != ${b[index]}`);
  }
}

function hashList(values) {
  return sha256([...values].sort(cmp).join("\n") + "\n");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function uniqueByFile(rows) {
  return [...new Map(rows.map((row) => [row.file, row])).values()];
}

function distribution(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const quantile = (fraction) => sorted[
    Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))
  ] ?? 0;
  return {
    count: sorted.length,
    p50: quantile(0.5),
    p90: quantile(0.9),
    p95: quantile(0.95),
    p99: quantile(0.99),
    max: sorted.at(-1) ?? 0,
  };
}

function pct(numerator, denominator) {
  return denominator ? Number((100 * numerator / denominator).toFixed(4)) : 0;
}

function pieceQuantity(canonical) {
  return (canonical.pieces ?? []).reduce((sum, piece) => sum + Number(piece.quantity ?? 0), 0);
}

function normalizedNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(Math.round(number * 1e6) / 1e6) : String(number);
}

function cmp(a, b) {
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

function positiveInt(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) fail(`${label} must be a positive integer`);
  return number;
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next != null && !next.startsWith("--")) {
      out[key] = next;
      index++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function fail(message) {
  throw new Error(message);
}

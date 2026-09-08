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
const EXECUTION_BINDING_ID = "physical-xml-historical-validity-v1";
const TELEMETRY_CONTRACT_ID = "step0-work-telemetry-v2";
const FREEZE_DIR = join(REPO, "research/optimizer/freeze");
const AUDIT_PATH = join(FREEZE_DIR, "KERNEL_V1_RESTO_ARCHIVE_AUDIT_2026-09-07.json");
const POLICY_PATH = join(FREEZE_DIR, "KERNEL_V1_FORMAL_CERTIFICATION_POLICY.json");
const SEMANTICS_PATH = join(FREEZE_DIR, "KERNEL_V1_CORRECTNESS_EXECUTION_SEMANTICS.json");
const EMBEDDED_PATH = join(REPO, "experiencia/canonical_cases.json");
const HOTSPOT_PATH = join(REPO, "experiencia/v6/hotspot-all.jsonl");
const HISTORICAL_CSV_PATH = join(REPO, "benchmark_project_v10.csv");

const args = parseArgs(process.argv.slice(2));
if (args.child) await childRun(args);
else await main(args);

async function main(args) {
  const corpus = resolve(String(args.corpus ?? ""));
  const historicalCorpus = resolve(String(args.historicalCorpus ?? ""));
  if (!args.corpus || !existsSync(corpus)) fail("--corpus <extracted-resto> required");
  if (!args.historicalCorpus || !existsSync(historicalCorpus)) fail("--historicalCorpus <extracted-parte1> required");

  const out = resolve(args.out ?? join(REPO, "test-results/kernel-v1-formal-certification"));
  mkdirSync(out, { recursive: true });

  const maxNew = args.maxNew == null ? Infinity : positiveInt(args.maxNew, "--maxNew");
  const timeoutMs = args.timeout == null ? 7_200_000 : positiveInt(args.timeout, "--timeout");
  const calibrationOrder = String(args.order ?? "work-first");
  if (!new Set(["work-first", "cheap-first"]).has(calibrationOrder)) fail("--order must be work-first or cheap-first");
  const oneboardScanLimit = args.oneboardScanLimit == null
    ? (args.oneboardQuota == null ? 48 : nonNegativeInt(args.oneboardQuota, "--oneboardQuota"))
    : nonNegativeInt(args.oneboardScanLimit, "--oneboardScanLimit");
  const policy = readJson(POLICY_PATH);
  const semantics = readJson(SEMANTICS_PATH);
  if (policy.correctnessPredicate?.id !== "HISTORICAL_VALIDITY_V1") fail("correctness contract not recovered");
  if (semantics?.status !== "RECOVERED") fail("correctness execution semantics not recovered");

  const bundle = await buildBundle(out);
  const historicalReplay = await validateHistoricalInfeasibleReplay({ bundle, historicalCorpus, out });
  const state = await preparePhysicalCorpus(bundle, corpus, out, historicalReplay);
  const staticOneboardCandidates = state.feasible
    .filter((item) => staticAreaLowerBound(item.case) === 1)
    .sort(compareStaticOneboardCandidates);
  writeJson(join(out, "oneboard-static-candidates-v4.json"), {
    schemaVersion: "kernel-v1-oneboard-static-candidates-v4",
    generatedAt: new Date().toISOString(),
    executionBindingId: EXECUTION_BINDING_ID,
    rule: "Static candidates satisfy V10 cotaArea: ceil(sum(piece width*height*quantity) / historically usable board area) == 1. Current OneBoard activation still requires mejor.placas > 1 and is proven only by fresh oneboard telemetry.",
    feasibleCases: state.feasible.length,
    candidates: staticOneboardCandidates.length,
    likelyPackingHardByReferencePanelsGt1: staticOneboardCandidates.filter((item) => Number(item.referencePanels ?? 0) > 1).length,
    scanLimit: oneboardScanLimit,
    cases: staticOneboardCandidates.map((item) => ({ file: item.file, referencePanels: item.referencePanels, pieces: quantity(item.case), staticAreaLowerBound: 1 })),
  });
  const hints = readHistoricalTimingHints();
  const activationHints = readHistoricalBudgetedPathHints();
  const env = calibrationEnv();

  await ensureTelemetryProbe({ state, hints, bundle, env, timeoutMs, out });

  const ordered = orderCalibration(
    state.feasible,
    hints,
    policy.execution?.knownExtremeTailOrders ?? [],
    activationHints,
    calibrationOrder,
    oneboardScanLimit,
  );
  const checkpoint = join(out, "calibration-v4.partial.jsonl");
  const prior = readJsonl(checkpoint);
  const done = new Set(
    prior
      .filter((row) => row.pass === true && row.executionBindingId === EXECUTION_BINDING_ID && row.telemetryContractId === TELEMETRY_CONTRACT_ID)
      .map((row) => row.file),
  );

  let added = 0;
  for (const item of ordered) {
    if (done.has(item.file) || added >= maxNew) continue;

    const result = await runCase({ bundle, item, env, timeoutMs, out, label: "calibration-v4" });
    const telemetryWired = hasCompositionTelemetry(result.step0);
    const beamAccounting = beamAccountingStatus(result.step0);
    const beamFallbackWarning = hasBeamFallbackWarning(result.stderrTail);
    const pass = Boolean(
      result.ok &&
      result.validationOk &&
      !result.cacheHit &&
      result.pieces === result.expectedPieces &&
      result.demandMultisetOk &&
      telemetryWired &&
      beamAccounting.ok &&
      !beamFallbackWarning
    );
    const row = {
      phase: "calibration",
      executionBindingId: EXECUTION_BINDING_ID,
      telemetryContractId: TELEMETRY_CONTRACT_ID,
      calibrationOrder,
      calibrationOneboardScanLimit: oneboardScanLimit,
      calibrationOneboardSelection: "resto-static-area-lb1",
      staticAreaLowerBound: staticAreaLowerBound(item.case),
      file: item.file,
      format: item.format,
      executionTrim: item.case.trim,
      referencePanels: item.referencePanels,
      historicalEngineMs: hints.get(item.file) ?? null,
      ...result,
      telemetryWired,
      beamAccounting,
      beamFallbackWarning,
      pass,
    };
    appendFileSync(checkpoint, JSON.stringify(row) + "\n", "utf8");
    added++;

    writeCalibrationSummary(checkpoint, state, hints, out);
    if (!pass) fail(`calibration validity/work-telemetry failed: ${item.file}; beamAccounting=${JSON.stringify(beamAccounting)}; beamFallbackWarning=${beamFallbackWarning}; stderr=${result.stderrTail ?? ""}`);

    console.log(JSON.stringify({
      phase: "calibration",
      file: item.file,
      wallMs: result.wallMs,
      optimizarCalls: result.step0?.composition?.optimizarCalls ?? 0,
      armarPlacasCalls: result.step0?.composition?.armarPlacasCalls ?? 0,
      stageCalls: result.step0?.composition?.stageCalls ?? 0,
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

async function preparePhysicalCorpus(bundle, corpus, out, historicalReplay) {
  const optimizer = await import(pathToFileURL(bundle).href);
  const audit = readJson(AUDIT_PATH);
  const embedded = readJson(EMBEDDED_PATH);
  if (!Array.isArray(embedded)) fail("canonical_cases.json must be an array");

  const rejections = audit?.currentParser?.rejections ?? [];
  if (!Array.isArray(rejections) || rejections.length !== 19) fail(`audit rejection manifest must contain 19 entries, got ${rejections.length}`);
  for (const entry of rejections) {
    if (typeof entry?.file !== "string" || !/\.xml$/i.test(entry.file)) fail(`audit rejection entry lacks literal file identity: ${JSON.stringify(entry)}`);
  }
  if (new Set(rejections.map((entry) => entry.file)).size !== 19) fail("audit rejection filenames are not unique");

  const restoRecords = embedded.filter((record) => partition(record.source_path) === "resto");
  const restoIds = [...new Set(restoRecords.map(identity).filter(Boolean))].sort(cmp);
  if (restoIds.length !== 8663) fail(`embedded resto distinct XML ${restoIds.length}, expected 8663`);

  const mixed = rejections.filter((entry) => entry.code === "mixed-board-formats");
  const strict = rejections.filter((entry) => entry.code !== "mixed-board-formats");
  if (mixed.length !== 13 || strict.length !== 6) fail(`audit rejection partition ${mixed.length}/${strict.length}, expected 13/6`);

  const restoSet = new Set(restoIds);
  for (const entry of mixed) if (!restoSet.has(entry.file)) fail(`mixed-board literal identity absent from embedded resto: ${entry.file}`);
  for (const entry of strict) if (restoSet.has(entry.file)) fail(`strict malformed identity unexpectedly present in embedded resto: ${entry.file}`);

  const mixedSet = new Set(mixed.map((entry) => entry.file));
  const comparableEmbeddedRecords = restoRecords.filter((record) => !mixedSet.has(identity(record)));
  const referenceByFile = new Map();
  for (const record of comparableEmbeddedRecords) {
    const file = identity(record);
    if (!file) continue;
    if (referenceByFile.has(file)) fail(`multiple comparable embedded records for ${file}`);
    referenceByFile.set(file, Number.isFinite(Number(record.reference_panels)) ? Number(record.reference_panels) : null);
  }
  if (referenceByFile.size !== 8650) fail(`comparable embedded identity count ${referenceByFile.size}, expected 8650`);

  const names = readdirSync(corpus).filter((name) => name.toLowerCase().endsWith(".xml")).sort(cmp);
  if (names.length !== 8669 || new Set(names).size !== 8669) fail(`physical corpus ${names.length}, expected 8669 unique XML`);

  const expectedArchive = [...new Set([...restoIds, ...strict.map((entry) => entry.file)])].sort(cmp);
  if (expectedArchive.length !== 8669) fail(`expected archive identity cardinality ${expectedArchive.length}, expected 8669`);
  sameSet(names, expectedArchive, "archive identity");

  const rejectExpected = new Map(rejections.map((entry) => [entry.file, String(entry.code)]));
  const accepted = [];
  const rejected = [];

  for (const file of names) {
    const xml = readFileSync(join(corpus, file), "utf8");
    try {
      const parsed = optimizer.parseCanonicalXml(xml, { fileName: file });
      const bound = bindHistoricalExecutionCase(parsed);
      accepted.push({
        file,
        format: parsed.format,
        case: bound.case,
        canonicalTrim: parsed.case.trim,
        executionTrimSource: bound.trimSource,
        referencePanels: referenceByFile.get(file) ?? null,
      });
    } catch (error) {
      rejected.push({ file, code: String(error?.code ?? "unknown") });
    }
  }

  if (accepted.length !== 8650 || rejected.length !== 19) fail(`parser classification ${accepted.length}/${rejected.length}, expected 8650/19`);
  const actualReject = new Map(rejected.map((entry) => [entry.file, entry.code]));
  if (actualReject.size !== rejectExpected.size) fail(`rejection cardinality drift ${actualReject.size}/${rejectExpected.size}`);
  for (const [file, code] of rejectExpected) if (actualReject.get(file) !== code) fail(`rejection drift ${file}: ${actualReject.get(file) ?? "missing"} != ${code}`);
  for (const file of actualReject.keys()) if (!rejectExpected.has(file)) fail(`unexpected rejected identity: ${file}`);

  const acceptedIds = accepted.map((entry) => entry.file).sort(cmp);
  const acceptedHash = hashList(acceptedIds);
  if (acceptedHash !== EXPECTED_ACCEPTED_HASH) fail(`accepted identity hash drift ${acceptedHash}`);
  sameSet(acceptedIds, [...referenceByFile.keys()], "accepted/comparable identity");

  const feasible = [];
  const infeasible = [];
  for (const item of accepted) {
    const impossible = impossiblePieces(item.case);
    if (impossible.length) infeasible.push({ ...item, impossible });
    else feasible.push(item);
  }

  writeJson(join(out, "expected-infeasible-v3.json"), {
    schemaVersion: "kernel-v1-expected-infeasible-v3",
    generatedAt: new Date().toISOString(),
    predicate: "HISTORICAL_VALIDITY_V1",
    executionBindingId: EXECUTION_BINDING_ID,
    acceptedCanonicalCases: 8650,
    feasibleCases: feasible.length,
    expectedInfeasibleCases: infeasible.length,
    historicalBenchmarkReplay: historicalReplay,
    note: "The 60 historical infeasible cases validate the classifier on parte1; they do not constrain the number of expected-infeasible cases in resto.",
    cases: infeasible.map((item) => ({
      file: item.file,
      format: item.format,
      executionTrim: item.case.trim,
      executionTrimSource: item.executionTrimSource,
      referencePanels: item.referencePanels,
      impossible: item.impossible,
    })),
  });

  writeJson(join(out, "corpus-preflight-v3.json"), {
    schemaVersion: "kernel-v1-physical-corpus-preflight-v3",
    generatedAt: new Date().toISOString(),
    archiveXml: names.length,
    archiveUniqueNames: new Set(names).size,
    identityBinding: "literal-filenames-only",
    executionBindingId: EXECUTION_BINDING_ID,
    certificationCorpusRole: "resto exact 8,650 accepted cohort",
    historicalReplayCorpusRole: "separate parte1 corpus validated before resto classification",
    projectExecutionTrim: "first parsed root trim reference, historical default 10; applied to x/y",
    orderExecutionTrim: "canonical Order trim unchanged",
    demandMultiset: "rotation-normalized terminal dimensions only (min x max)",
    rejectionManifestEntries: rejections.length,
    rejectionManifestExact: true,
    parserAccepted: accepted.length,
    parserRejected: rejected.length,
    acceptedIdentitySetSha256: acceptedHash,
    feasibleCases: feasible.length,
    expectedInfeasibleCases: infeasible.length,
    historicalBenchmarkReplay: historicalReplay,
  });

  return { feasible, infeasible, historicalReplay };
}

function bindHistoricalExecutionCase(parsed) {
  if (parsed.format !== "project") {
    return { case: parsed.case, trimSource: "canonical-order" };
  }
  const candidate = Number(parsed.stats?.trimReference?.[0]);
  const trim = Number.isFinite(candidate) ? candidate : 10;
  return {
    case: { ...parsed.case, trim: { x: trim, y: trim } },
    trimSource: Number.isFinite(candidate) ? "project-first-root-trim" : "project-historical-default-10",
  };
}

async function validateHistoricalInfeasibleReplay({ bundle, historicalCorpus, out }) {
  const optimizer = await import(pathToFileURL(bundle).href);
  const rows = parseCsv(readFileSync(HISTORICAL_CSV_PATH, "utf8"));
  if (rows.length < 2) fail("historical benchmark CSV is empty");
  const header = rows[0];
  const index = Object.fromEntries(header.map((name, i) => [name, i]));
  for (const required of ["archivo", "estado", "detalle"]) if (!(required in index)) fail(`historical CSV missing ${required}`);

  const data = rows.slice(1).filter((row) => row.some((value) => value !== ""));
  const benchmarkFiles = new Set();
  const attempted = new Set();
  const expected = new Set();
  for (const row of data) {
    const file = String(row[index.archivo] ?? "").trim();
    const estado = String(row[index.estado] ?? "").trim();
    const detalle = String(row[index.detalle] ?? "").trim();
    benchmarkFiles.add(file);
    if (estado !== "SKIP") attempted.add(file);
    if (estado === "ERROR" && /no entra en una placa útil/i.test(detalle)) expected.add(file);
  }
  if (data.length !== 2000 || benchmarkFiles.size !== 2000) fail(`historical benchmark identity source ${data.length}/${benchmarkFiles.size}, expected 2000/2000`);
  if (attempted.size !== 1550 || expected.size !== 60) fail(`historical infeasible replay source ${attempted.size}/${expected.size}, expected 1550/60`);

  const embedded = readJson(EMBEDDED_PATH);
  if (!Array.isArray(embedded)) fail("canonical_cases.json must be an array");
  const parte1Records = embedded.filter((record) => partition(record.source_path) === "parte1");
  const parte1Ids = [...new Set(parte1Records.map(identity).filter(Boolean))].sort(cmp);
  const embeddedCounts = new Map();
  for (const record of parte1Records) {
    const file = identity(record);
    if (file) embeddedCounts.set(file, (embeddedCounts.get(file) ?? 0) + 1);
  }
  const duplicateEmbeddedIdentities = [...embeddedCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([file, count]) => ({ file, count }))
    .sort((a, b) => cmp(a.file, b.file));
  if (parte1Records.length !== 2001 || parte1Ids.length !== 2000) {
    fail(`embedded parte1 cardinality ${parte1Records.length} records / ${parte1Ids.length} distinct XML, expected 2001/2000`);
  }
  if (
    duplicateEmbeddedIdentities.length !== 1 ||
    duplicateEmbeddedIdentities[0]?.file !== "4011957__Maximiliano_Santoro4011957.xml" ||
    duplicateEmbeddedIdentities[0]?.count !== 2
  ) {
    fail(`embedded parte1 duplicate identity drift: ${JSON.stringify(duplicateEmbeddedIdentities)}`);
  }
  sameSet(parte1Ids, [...benchmarkFiles], "embedded parte1/benchmark identity");

  const names = readdirSync(historicalCorpus).filter((name) => name.toLowerCase().endsWith(".xml")).sort(cmp);
  const nameSet = new Set(names);
  if (names.length !== 2000 || nameSet.size !== 2000) fail(`historical parte1 corpus ${names.length}/${nameSet.size}, expected 2000/2000 unique XML`);
  sameSet(names, parte1Ids, "physical parte1/embedded identity");
  sameSet(names, [...benchmarkFiles], "physical parte1/benchmark identity");
  const missing = [...benchmarkFiles].filter((file) => !nameSet.has(file)).sort(cmp);
  if (missing.length) fail(`historical parte1 is missing ${missing.length} benchmark files; first=${missing[0]}`);

  const detected = new Set();
  const parseFailures = [];
  for (const file of [...attempted].sort(cmp)) {
    const xml = readFileSync(join(historicalCorpus, file), "utf8");
    try {
      const parsed = optimizer.parseCanonicalXml(xml, { fileName: file });
      if (parsed.format !== "project") fail(`historical attempted benchmark case is not project: ${file} (${parsed.format})`);
      const bound = bindHistoricalExecutionCase(parsed);
      if (impossiblePieces(bound.case).length) detected.add(file);
    } catch (error) {
      parseFailures.push({ file, code: String(error?.code ?? "unknown"), message: String(error?.message ?? error) });
    }
  }
  if (parseFailures.length) fail(`historical replay parser/binding failures ${parseFailures.length}; first=${parseFailures[0].file}: ${parseFailures[0].message}`);
  sameSet([...detected], [...expected], "historical infeasible replay");

  const report = {
    schemaVersion: "kernel-v1-historical-infeasible-replay-v2",
    generatedAt: new Date().toISOString(),
    executionBindingId: EXECUTION_BINDING_ID,
    sourcePartition: "parte1",
    certificationPartition: "resto",
    embeddedParte1Records: parte1Records.length,
    embeddedParte1DistinctXml: parte1Ids.length,
    embeddedDuplicateIdentities: duplicateEmbeddedIdentities,
    historicalCorpusXml: names.length,
    historicalCorpusUniqueNames: nameSet.size,
    benchmarkRows: data.length,
    benchmarkUniqueFiles: benchmarkFiles.size,
    benchmarkFilesPresent: benchmarkFiles.size - missing.length,
    extraHistoricalCorpusXml: names.length - benchmarkFiles.size,
    fileAggregation: "parseCanonicalXml returns one CanonicalOptimizationCase per physical XML and aggregates all project panels into that case; a file is infeasible when any demanded piece in the aggregated case is impossible",
    attemptedProjectCases: attempted.size,
    historicalExpectedInfeasible: expected.size,
    detectedInHistoricalSample: detected.size,
    exactSetMatch: true,
    inferenceBoundary: "This replay validates the infeasible classifier on parte1 only. It does not impose an expected infeasible count on resto.",
  };
  writeJson(join(out, "historical-infeasible-replay-v3.json"), report);
  return report;
}

async function ensureTelemetryProbe({ state, hints, bundle, env, timeoutMs, out }) {
  const path = join(out, "telemetry-probe-v4.json");
  if (existsSync(path)) {
    const prior = readJson(path);
    if (prior?.executionBindingId === EXECUTION_BINDING_ID && prior?.telemetryContractId === TELEMETRY_CONTRACT_ID && prior?.status === "PASS" && prior?.budgetedWorkMeasured === true) return;
  }

  const activationHints = readHistoricalBudgetedPathHints();
  const candidates = state.feasible
    .map((item) => ({ item, hint: activationHints.get(item.file) }))
    .filter((entry) => entry.hint && (entry.hint.masterActivations > 0 || entry.hint.oneboardActivations > 0))
    .sort((a, b) => a.hint.engineMs - b.hint.engineMs || cmp(a.item.file, b.item.file))
    .slice(0, 8);
  if (!candidates.length) fail("no historically activated Master/OneBoard candidates available for Step 0 telemetry probe");

  const attempts = [];
  let budgetedPathExercised = false;
  for (const { item, hint } of candidates) {
    const historicalMs = hint.engineMs;
    const result = await runCase({ bundle, item, env, timeoutMs, out, label: "telemetry-probe-v4" });
    const telemetryWired = hasCompositionTelemetry(result.step0);
    const beamWork = Number(result.step0?.beam?.expansionsTotal ?? 0) > 0;
    const masterWork = Number(result.step0?.master?.nodesTotal ?? 0) > 0;
    const oneboardWork = Number(result.step0?.oneboard?.attemptsTotal ?? 0) > 0;
    const budgeted = beamWork || masterWork || oneboardWork;
    const beamAccounting = beamAccountingStatus(result.step0);
    const beamFallbackWarning = hasBeamFallbackWarning(result.stderrTail);
    const valid = result.ok && result.validationOk && !result.cacheHit && result.pieces === result.expectedPieces && result.demandMultisetOk && telemetryWired && beamAccounting.ok && !beamFallbackWarning;
    attempts.push({
      file: item.file,
      historicalMs,
      historicalMasterActivations: hint.masterActivations,
      historicalOneboardActivations: hint.oneboardActivations,
      selectionReason: "versioned hotspot evidence exercised Master or OneBoard; cheapest known activated candidates first",
      wallMs: result.wallMs,
      valid,
      telemetryWired,
      budgetedPathExercised: budgeted,
      budgetedWorkMeasured: budgeted,
      beamWorkMeasured: beamWork,
      masterWorkMeasured: masterWork,
      oneboardWorkMeasured: oneboardWork,
      beamAccounting,
      beamFallbackWarning,
      stderrTail: result.stderrTail ?? null,
      composition: result.step0?.composition ?? null,
      beam: result.step0?.beam ?? null,
      master: result.step0?.master ?? null,
      oneboard: result.step0?.oneboard ?? null,
    });
    if (!valid) break;
    if (budgeted) {
      budgetedPathExercised = true;
      break;
    }
  }

  const status = attempts.length > 0 && attempts.every((attempt) => attempt.valid) && budgetedPathExercised ? "PASS" : "FAIL";
  writeJson(path, {
    schemaVersion: "kernel-v1-step0-telemetry-probe-v2",
    generatedAt: new Date().toISOString(),
    executionBindingId: EXECUTION_BINDING_ID,
    telemetryContractId: TELEMETRY_CONTRACT_ID,
    status,
    budgetedPathExercised,
    budgetedWorkMeasured: budgetedPathExercised,
    explanation: "composition counters prove wiring; PASS requires an actual deterministic work magnitude (Beam expansions, Master nodes, or OneBoard attempts) greater than zero in a fresh current run. Beam calls alone are insufficient. Any swallowed Beam fallback warning fails the probe.",
    attempts,
  });
  if (status !== "PASS") fail("Step 0 telemetry probe did not produce a valid run with measured budgeted work");
}

function hasCompositionTelemetry(step0) {
  return Number(step0?.composition?.optimizarCalls ?? 0) > 0 &&
    Number(step0?.composition?.armarPlacasCalls ?? 0) > 0 &&
    Number(step0?.composition?.stageCalls ?? 0) > 0;
}

function beamAccountingStatus(step0) {
  const calls = Number(step0?.beam?.calls ?? 0);
  const expansions = Number(step0?.beam?.expansionsTotal ?? 0);
  const timeoutHits = Number(step0?.beam?.timeoutHits ?? 0);
  const budgetHits = Number(step0?.beam?.budgetHits ?? 0);
  const watchdogHits = Number(step0?.beam?.watchdogHits ?? 0);
  const terminalEvidence = expansions > 0 || timeoutHits > 0 || budgetHits > 0 || watchdogHits > 0;
  return {
    ok: calls === 0 || terminalEvidence,
    calls,
    expansions,
    timeoutHits,
    budgetHits,
    watchdogHits,
    reason: calls === 0 ? "beam-not-called" : terminalEvidence ? "beam-work-or-terminal-control-recorded" : "beam-called-without-work-or-terminal-control",
  };
}

function hasBeamFallbackWarning(stderrTail) {
  return /Beam Search falló, se usa greedy:/i.test(String(stderrTail ?? ""));
}

async function buildBundle(out) {
  const { build } = await import("esbuild");
  const file = join(out, "kernel-v1-candidate-v4.mjs");
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

async function runCase({ bundle, item, env, timeoutMs, out, label }) {
  const dir = join(out, ".cases-v4");
  mkdirSync(dir, { recursive: true });
  const id = sha256(`${EXECUTION_BINDING_ID}\0${label}\0${item.file}`).slice(0, 16);
  const inputPath = join(dir, `${id}.json`);
  const resultPath = join(dir, `${id}.result.json`);
  writeJson(inputPath, item.case);

  return new Promise((resolvePromise, rejectPromise) => {
    const child = fork(
      SCRIPT,
      ["--child", bundle, "--case-json", inputPath, "--result", resultPath],
      { env, stdio: ["ignore", "ignore", "pipe", "ipc"] },
    );
    let record = null;
    let timedOut = false;
    let stderrTail = "";
    child.stderr?.on("data", (chunk) => {
      stderrTail = (stderrTail + String(chunk)).slice(-16000);
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.on("message", (message) => { record = message; });
    child.on("error", (error) => { clearTimeout(timer); rejectPromise(error); });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (timedOut) rejectPromise(new Error(`operational watchdog ${timeoutMs}ms`));
      else if (code !== 0 || !record) rejectPromise(new Error(`worker ${code}`));
      else resolvePromise({ ...record, stderrTail: stderrTail.trim() || null });
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
  const eps = 1e-9;
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
    const key = terminalDimensionKey(piece.width, piece.height);
    expected.set(key, (expected.get(key) ?? 0) + Number(piece.quantity ?? 0));
  }
  for (const placement of placements ?? []) {
    const key = terminalDimensionKey(placement.width, placement.height);
    actual.set(key, (actual.get(key) ?? 0) + 1);
  }
  const keys = [...new Set([...expected.keys(), ...actual.keys()])].sort(cmp);
  const differences = keys
    .map((key) => ({ key, expected: expected.get(key) ?? 0, actual: actual.get(key) ?? 0 }))
    .filter((entry) => entry.expected !== entry.actual);
  return {
    semantics: "historical-terminal-dimensions-min-max-v1",
    ok: differences.length === 0,
    differences,
  };
}

function terminalDimensionKey(a, b) {
  const x = Number(a), y = Number(b);
  const lo = Math.min(x, y), hi = Math.max(x, y);
  return `${num(lo)}x${num(hi)}`;
}

function writeCalibrationSummary(checkpoint, state, hints, out) {
  const rows = uniqueLatest(
    readJsonl(checkpoint).filter((row) => row.pass === true && row.executionBindingId === EXECUTION_BINDING_ID && row.telemetryContractId === TELEMETRY_CONTRACT_ID),
  );
  const values = (fn) => distribution(rows.map((row) => Number(fn(row) ?? 0)));
  const historicalTotal = [...hints.values()].reduce((sum, value) => sum + value, 0);
  const historicalDone = rows.reduce((sum, row) => sum + (hints.get(row.file) ?? 0), 0);
  writeJson(join(out, "calibration-v4.summary.json"), {
    schemaVersion: "kernel-v1-calibration-summary-v4",
    updatedAt: new Date().toISOString(),
    executionBindingId: EXECUTION_BINDING_ID,
    telemetryContractId: TELEMETRY_CONTRACT_ID,
    status: rows.length === state.feasible.length ? "COMPLETE" : "PARTIAL",
    feasibleCasesCompleted: rows.length,
    feasibleCasesTotal: state.feasible.length,
    expectedInfeasibleCases: state.infeasible.length,
    historicalClassifierValidation: state.historicalReplay,
    aggregatePerOrderDistributions: {
      wallMs: values((row) => row.wallMs),
      cpuMs: values((row) => row.cpuMs),
      optimizarCalls: values((row) => row.step0?.composition?.optimizarCalls),
      armarPlacasCalls: values((row) => row.step0?.composition?.armarPlacasCalls),
      stageCalls: values((row) => row.step0?.composition?.stageCalls),
      beamExpansionsTotal: values((row) => row.step0?.beam?.expansionsTotal),
      beamExpansionsMax: values((row) => row.step0?.beam?.expansionsMax),
      beamCalls: values((row) => row.step0?.beam?.calls),
      beamWallMsTotal: values((row) => row.step0?.beam?.wallMsTotal),
      beamWallMsMax: values((row) => row.step0?.beam?.wallMsMax),
      beamTimeoutHits: values((row) => row.step0?.beam?.timeoutHits),
      beamBudgetHits: values((row) => row.step0?.beam?.budgetHits),
      beamWatchdogHits: values((row) => row.step0?.beam?.watchdogHits),
      masterNodesTotal: values((row) => row.step0?.master?.nodesTotal),
      masterNodesMax: values((row) => row.step0?.master?.nodesMax),
      masterRuns: values((row) => row.step0?.master?.runs),
      masterWallMsTotal: values((row) => row.step0?.master?.wallMsTotal),
      masterWallMsMax: values((row) => row.step0?.master?.wallMsMax),
      oneboardAttemptsTotal: values((row) => row.step0?.oneboard?.attemptsTotal),
      oneboardAttemptsMax: values((row) => row.step0?.oneboard?.attemptsMax),
      oneboardRuns: values((row) => row.step0?.oneboard?.runs),
      oneboardWallMsTotal: values((row) => row.step0?.oneboard?.wallMsTotal),
      oneboardWallMsMax: values((row) => row.step0?.oneboard?.wallMsMax),
    },
    casesWithMeasuredBudgetedWork: {
      beam: rows.filter((row) => Number(row.step0?.beam?.expansionsTotal ?? 0) > 0).length,
      master: rows.filter((row) => Number(row.step0?.master?.nodesTotal ?? 0) > 0).length,
      oneboard: rows.filter((row) => Number(row.step0?.oneboard?.attemptsTotal ?? 0) > 0).length,
    },
    orderingModesObserved: [...new Set(rows.map((row) => row.calibrationOrder ?? "v4-pre-ordering-field"))],
    oneboardQuotaValuesObserved: [...new Set(rows.map((row) => row.calibrationOneboardQuota ?? "v4-pre-oneboard-quota-field"))],
    oneboardScanLimitValuesObserved: [...new Set(rows.map((row) => row.calibrationOneboardScanLimit ?? "v4-pre-static-scan-field"))],
  oneboardDiscovery: {
    staticAreaLbOneCandidates: state.feasible.filter((item) => staticAreaLowerBound(item.case) === 1).length,
    staticAreaLbOneRowsCompleted: rows.filter((row) => Number(row.staticAreaLowerBound ?? 0) === 1).length,
    currentOneboardActivatedCases: rows.filter((row) => Number(row.step0?.oneboard?.runs ?? 0) > 0).length,
    currentOneboardMeasuredWorkCases: rows.filter((row) => Number(row.step0?.oneboard?.attemptsTotal ?? 0) > 0).length,
    selectionSource: "physical resto feasible cohort; static area lower bound under historical execution binding",
    interpretation: "Static areaLB=1 is only a cheap candidate filter. OneBoard evidence requires fresh oneboard.runs>0 and attemptsTotal>0. If an adequate scan yields no activations, record rarity and choose the rescue budget by explicit policy rather than fabricate a distribution.",
  },
    budgetParameterSemantics: {
      OPTIMIZER_MAX_BEAM_EXPANSIONS: { enforcementScope: "per armarPlacasBeam invocation", primaryCalibrationStatistic: "beam.expansionsMax", aggregateOperationalStatistic: "beam.expansionsTotal" },
      OPTIMIZER_BEAM_WATCHDOG_MS: { enforcementScope: "per armarPlacasBeam invocation", primaryCalibrationStatistic: "beam.wallMsMax", aggregateOperationalStatistic: "beam.wallMsTotal" },
      OPTIMIZER_MAX_MASTER_NODES: { enforcementScope: "per resolverCobertura run", primaryCalibrationStatistic: "master.nodesMax", aggregateOperationalStatistic: "master.nodesTotal" },
      OPTIMIZER_MASTER_WATCHDOG_MS: { enforcementScope: "per resolverCobertura run", primaryCalibrationStatistic: "master.wallMsMax", aggregateOperationalStatistic: "master.wallMsTotal" },
      OPTIMIZER_MAX_RESCUE_ATTEMPTS: { enforcementScope: "per rescatarUnaPlaca invocation", primaryCalibrationStatistic: "oneboard.attemptsMax", aggregateOperationalStatistic: "oneboard.attemptsTotal" },
      OPTIMIZER_RESCUE_WATCHDOG_MS: { enforcementScope: "per rescatarUnaPlaca invocation", primaryCalibrationStatistic: "oneboard.wallMsMax", aggregateOperationalStatistic: "oneboard.wallMsTotal" },
      aggregateRequestBudget: "NOT_PRESENT_IN_KERNEL_V1_CANDIDATE",
    },
    historicalHotspotTimingMass: {
      completedMs: historicalDone,
      totalMs: historicalTotal,
      coveragePct: pct(historicalDone, historicalTotal),
    },
    calibrationControls: { deterministicBudgets: "OFF", watchdogs: "OFF", watchdogZeroIsCertificationEvidence: false },
    rules: [
      "The exact 60-case infeasible replay is validated on parte1 through --historicalCorpus; it is not an expected count for resto.",
      "Calibrate each deterministic budget from the work/time statistic in the exact scope where that parameter is enforced: Beam expansionsMax/wallMsMax per Beam invocation, Master nodesMax/wallMsMax per coverage run, and OneBoard attemptsMax/wallMsMax per rescue invocation.",
      "Keep aggregate per-order totals as operational-load evidence; Candidate A has no aggregate request budget and this freeze must not add one.",
      "Beam calls may legitimately be zero when greedy already reaches the area lower bound; when Beam is called, v4 requires work/terminal-control accounting and rejects swallowed Beam fallbacks.",
      "Calibration runs with deterministic budgets and watchdogs OFF. Therefore watchdogHits=0 during calibration is not formal watchdog evidence; zero hits must be proven later with versioned watchdogs enabled.",
      "No aggregate request stop condition is added inside Kernel V1 freeze.",
    ],
  });
}

function readHistoricalTimingHints() {
  const map = new Map();
  if (!existsSync(HOTSPOT_PATH)) return map;
  for (const line of readFileSync(HOTSPOT_PATH, "utf8").split(/\r?\n/).filter(Boolean)) {
    const row = JSON.parse(line);
    if (row.ok === false || row.engineCacheHit) continue;
    if (typeof row.file === "string" && Number.isFinite(row.engineMs)) map.set(row.file, Number(row.engineMs));
  }
  return map;
}

function readHistoricalBudgetedPathHints() {
  const map = new Map();
  if (!existsSync(HOTSPOT_PATH)) return map;
  for (const line of readFileSync(HOTSPOT_PATH, "utf8").split(/\r?\n/).filter(Boolean)) {
    const row = JSON.parse(line);
    if (row.ok === false || row.engineCacheHit || typeof row.file !== "string" || !Number.isFinite(row.engineMs)) continue;
    map.set(row.file, {
      engineMs: Number(row.engineMs),
      masterActivations: Number(row.metricas?.master?.activaciones ?? 0),
      oneboardActivations: Number(row.metricas?.oneboard?.activaciones ?? 0),
    });
  }
  return map;
}

function orderCalibration(items, hints, tailOrders, activationHints, mode, oneboardScanLimit) {
  const tails = new Set(tailOrders.map(String));
  const isTail = (file) => [...tails].some((order) => file.includes(order));
  const hintFor = (file) => activationHints.get(file) ?? null;
  const anyHistoricallyActivated = (file) => {
    const hint = hintFor(file);
    return Boolean(hint && (hint.masterActivations > 0 || hint.oneboardActivations > 0));
  };
  const historicalMs = (file) => hints.get(file);
  const cheapComparator = (a, b) => {
    const ah = historicalMs(a.file), bh = historicalMs(b.file);
    if (Number.isFinite(ah) && Number.isFinite(bh) && ah !== bh) return ah - bh;
    if (Number.isFinite(ah) !== Number.isFinite(bh)) return Number.isFinite(ah) ? -1 : 1;
    const aq = quantity(a.case), bq = quantity(b.case);
    return aq - bq || cmp(a.file, b.file);
  };
  const workComparator = (a, b) => {
    const aa = anyHistoricallyActivated(a.file), ba = anyHistoricallyActivated(b.file);
    if (aa !== ba) return aa ? -1 : 1;
    const ah = historicalMs(a.file), bh = historicalMs(b.file);
    if (Number.isFinite(ah) && Number.isFinite(bh) && ah !== bh) return bh - ah;
    if (Number.isFinite(ah) !== Number.isFinite(bh)) return Number.isFinite(ah) ? -1 : 1;
    const aq = quantity(a.case), bq = quantity(b.case);
    return bq - aq || cmp(a.file, b.file);
  };

  const nonTails = items.filter((item) => !isTail(item.file));
  const tailItems = items.filter((item) => isTail(item.file)).sort(cheapComparator);
  if (mode === "cheap-first") return nonTails.sort(cheapComparator).concat(tailItems);

  const reservedOneboard = nonTails
    .filter((item) => staticAreaLowerBound(item.case) === 1)
    .sort(compareStaticOneboardCandidates)
    .slice(0, oneboardScanLimit);
  const reservedFiles = new Set(reservedOneboard.map((item) => item.file));
  const remaining = nonTails
    .filter((item) => !reservedFiles.has(item.file))
    .sort(workComparator);
  return reservedOneboard.concat(remaining, tailItems);
}

function staticAreaLowerBound(canonical) {
  const usefulWidth = Number(canonical?.panel?.width ?? 0) - Number(canonical?.trim?.x ?? 0);
  const usefulHeight = Number(canonical?.panel?.height ?? 0) - Number(canonical?.trim?.y ?? 0);
  const boardArea = usefulWidth * usefulHeight;
  if (!(boardArea > 0)) return Infinity;
  const demandArea = (canonical?.pieces ?? []).reduce(
    (sum, piece) => sum + Number(piece.width ?? 0) * Number(piece.height ?? 0) * Number(piece.quantity ?? 0),
    0,
  );
  return Math.ceil(demandArea / boardArea - 1e-9);
}

function compareStaticOneboardCandidates(a, b) {
  const aHard = Number(a.referencePanels ?? 0) > 1 ? 0 : 1;
  const bHard = Number(b.referencePanels ?? 0) > 1 ? 0 : 1;
  if (aHard !== bHard) return aHard - bHard;
  const aq = quantity(a.case), bq = quantity(b.case);
  return bq - aq || cmp(a.file, b.file);
}
function calibrationEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("OPTIMIZER_")) delete env[key];
  env.OPTIMIZER_V10_STAGED_EXPERIMENTAL = "0";
  env.OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL = "0";
  env.OPTIMIZER_STEP0_TELEMETRY = "1";
  return env;
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (quoted) fail("unterminated quoted CSV field");
  if (field !== "" || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  return rows;
}

function partition(sourcePath) {
  const parts = String(sourcePath ?? "").replace(/\\/g, "/").split("/").filter(Boolean);
  const index = parts.lastIndexOf("xml_experience");
  return index >= 0 ? (parts[index + 1] ?? "(root)") : "(outside)";
}
function identity(record) {
  const path = String(record?.source_path ?? "").replace(/\\/g, "/");
  return path ? basename(path) : null;
}
function sameSet(a, b, label) {
  const left = [...a].sort(cmp), right = [...b].sort(cmp);
  if (left.length !== right.length) fail(`${label} cardinality ${left.length}/${right.length}`);
  for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) fail(`${label} ${i}: ${left[i]} != ${right[i]}`);
}
function hashList(values) {
  const sorted = [...new Set(values)].sort(cmp);
  return sha256(sorted.join("\n") + (sorted.length ? "\n" : ""));
}
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function readJson(path) { return JSON.parse(readFileSync(path, "utf8")); }
function writeJson(path, value) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8"); }
function readJsonl(path) { if (!existsSync(path)) return []; return readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse); }
function uniqueLatest(rows) { return [...new Map(rows.map((row) => [row.file, row])).values()]; }
function distribution(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))] ?? 0;
  return { count: sorted.length, p50: q(0.5), p90: q(0.9), p95: q(0.95), p99: q(0.99), max: sorted.at(-1) ?? 0 };
}
function quantity(canonical) { return (canonical.pieces ?? []).reduce((sum, piece) => sum + Number(piece.quantity ?? 0), 0); }
function pct(n, d) { return d ? Number((100 * n / d).toFixed(4)) : 0; }
function num(value) { const n = Number(value); return Number.isFinite(n) ? String(Math.round(n * 1e6) / 1e6) : String(value); }
function cmp(a, b) { return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0; }
function positiveInt(value, label) { const n = Number(value); if (!Number.isSafeInteger(n) || n <= 0) fail(`${label} must be a positive integer`); return n; }
function nonNegativeInt(value, label) { const n = Number(value); if (!Number.isSafeInteger(n) || n < 0) fail(`${label} must be a non-negative integer`); return n; }
function parseArgs(values) {
  const out = {};
  for (let i = 0; i < values.length; i++) {
    const token = values[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2), next = values[i + 1];
    if (next != null && !next.startsWith("--")) { out[key] = next; i++; }
    else out[key] = true;
  }
  return out;
}
function fail(message) { throw new Error(message); }

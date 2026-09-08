#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const repo = resolve(new URL("../..", import.meta.url).pathname.replace(/^\/(.:\/)/, "$1"));
const provenancePath = resolve(repo, "research/optimizer/freeze/KERNEL_V1_FREEZE_PROVENANCE.json");
const reconciliationPath = resolve(repo, "research/optimizer/freeze/KERNEL_V1_RESTO_RECONCILIATION.json");
const policyPath = resolve(repo, "research/optimizer/freeze/KERNEL_V1_FORMAL_CERTIFICATION_POLICY.json");
const correctnessContractPath = resolve(repo, "research/optimizer/freeze/KERNEL_V1_CORRECTNESS_CONTRACT.json");
const correctnessExecutionSemanticsPath = resolve(repo, "research/optimizer/freeze/KERNEL_V1_CORRECTNESS_EXECUTION_SEMANTICS.json");
const outPath = resolve(repo, process.argv[2] ?? "research/optimizer/freeze/KERNEL_V1_FREEZE_TRACEABILITY.json");
const KERNEL_CANDIDATE = "4063963260abb10c8d68d0e553942899c925cc2f";
const COHORT_SHA256 = "36d005421ae79b01867e0bba377c1bf526801bcd4dcfa2b0180e12cf354458f3";
const CORRECTNESS_PREDICATE = "HISTORICAL_VALIDITY_V1";
const MULTISET_SEMANTICS = "HISTORICAL_TERMINAL_DIMENSION_MULTISET_V1";
const USABLE_BOARD_SEMANTICS = "HISTORICAL_PROJECT_ROOT_TRIM_V1";
const EXECUTION_BINDING = "physical-xml-historical-validity-v1";

const provenance = JSON.parse(readFileSync(provenancePath, "utf8"));
const reconciliation = JSON.parse(readFileSync(reconciliationPath, "utf8"));
const policy = JSON.parse(readFileSync(policyPath, "utf8"));
const correctnessContract = JSON.parse(readFileSync(correctnessContractPath, "utf8"));
const correctnessExecutionSemantics = JSON.parse(readFileSync(correctnessExecutionSemanticsPath, "utf8"));

const checks = {
  fiveSentinelsRecovered: provenance?.freezeTraceability?.sentinels === "RECOVERED",
  hotspots213Recovered: provenance?.freezeTraceability?.hotspots === "RECOVERED",
  fullPlanHashRecovered: provenance?.freezeTraceability?.fullPlanHash === "RECOVERED",
  archive8669UniqueAudited: reconciliation?.auditSummary?.archiveXml === 8669 && reconciliation?.auditSummary?.uniqueNames === 8669,
  restoReconciliationRecovered: reconciliation?.status === "RECOVERED",
  exactCurrentCorrectness8650: reconciliation?.currentComparable?.records === 8650 && reconciliation?.currentComparable?.distinctXml === 8650,
  exactCurrentCorrectnessHash: reconciliation?.currentComparable?.identitySetSha256 === COHORT_SHA256,
  historicalCorrectnessContractRecovered:
    correctnessContract?.recoveredPredicate?.status === "RECOVERED" &&
    correctnessContract?.recoveredPredicate?.id === CORRECTNESS_PREDICATE,
  historicalCorrectnessExecutionSemanticsRecovered:
    correctnessExecutionSemantics?.status === "RECOVERED" &&
    correctnessExecutionSemantics?.multiset?.id === MULTISET_SEMANTICS &&
    correctnessExecutionSemantics?.usableBoard?.id === USABLE_BOARD_SEMANTICS &&
    correctnessExecutionSemantics?.checks &&
    Object.values(correctnessExecutionSemantics.checks).every(Boolean),
};

const traceabilityComplete = Object.values(checks).every(Boolean);
const budgetValues = policy?.deterministicBudgets?.values ?? {};
const budgetKeys = [
  "OPTIMIZER_MAX_BEAM_EXPANSIONS",
  "OPTIMIZER_BEAM_WATCHDOG_MS",
  "OPTIMIZER_MAX_MASTER_NODES",
  "OPTIMIZER_MASTER_WATCHDOG_MS",
  "OPTIMIZER_MAX_RESCUE_ATTEMPTS",
  "OPTIMIZER_RESCUE_WATCHDOG_MS",
];
const deterministicBudgetsReady = policy?.deterministicBudgets?.status === "RESOLVED" &&
  budgetKeys.every((key) => Number.isSafeInteger(budgetValues[key]) && budgetValues[key] > 0);
const correctnessPredicateId = policy?.correctnessPredicate?.id ?? null;
const correctnessExecutionBindingId = policy?.correctnessPredicate?.executionBinding?.id ?? null;
const corpusRolesReady =
  policy?.correctnessPredicate?.executionBinding?.historicalValidationCorpus?.partition === "parte1" &&
  policy?.correctnessPredicate?.executionBinding?.historicalValidationCorpus?.argument === "--historicalCorpus" &&
  policy?.correctnessPredicate?.executionBinding?.certificationCorpus?.partition === "resto" &&
  policy?.correctnessPredicate?.executionBinding?.certificationCorpus?.argument === "--corpus" &&
  policy?.correctnessPredicate?.infeasibleClassification?.historicalReplayGate?.sourcePartition === "parte1";
const correctnessPredicateReady =
  policy?.correctnessPredicate?.status === "RESOLVED" &&
  correctnessPredicateId === CORRECTNESS_PREDICATE &&
  correctnessContract?.recoveredPredicate?.id === correctnessPredicateId &&
  correctnessExecutionBindingId === EXECUTION_BINDING &&
  policy?.correctnessPredicate?.multisetSemantics?.id === MULTISET_SEMANTICS &&
  correctnessExecutionSemantics?.multiset?.id === MULTISET_SEMANTICS &&
  correctnessExecutionSemantics?.usableBoard?.id === USABLE_BOARD_SEMANTICS &&
  corpusRolesReady;
const formalPolicyReady = deterministicBudgetsReady && correctnessPredicateReady && policy?.formalCertificationReady === true;

const status = !traceabilityComplete
  ? "BLOCKED"
  : formalPolicyReady
    ? "TRACEABILITY_CORRECTNESS_EXECUTION_SEMANTICS_COMPLETE_FORMAL_POLICY_READY"
    : correctnessPredicateReady
      ? "TRACEABILITY_CORRECTNESS_EXECUTION_SEMANTICS_COMPLETE_BUDGET_CALIBRATION_PENDING"
      : "TRACEABILITY_COMPLETE_FORMAL_POLICY_BLOCKED";

const report = {
  schemaVersion: "kernel-v1-freeze-traceability-v5",
  generatedAt: new Date().toISOString(),
  kernelCandidate: KERNEL_CANDIDATE,
  status,
  kernelFrozen: false,
  traceabilityComplete,
  checks,
  historicalCohorts: {
    sentinels: 5,
    hotspots: 213,
    historicalReplayPartition: "parte1",
    historicalBenchmarkRows: 2000,
    historicalAttemptedNonSkipCases: 1550,
    historicalExpectedInfeasibleCases: 60,
    certificationPartition: "resto",
    archiveXml: reconciliation?.auditSummary?.archiveXml ?? null,
    archiveUniqueNames: reconciliation?.auditSummary?.uniqueNames ?? null,
    currentComparableCorrectness: reconciliation?.currentComparable?.distinctXml ?? null,
  },
  currentCorrectnessCohort: {
    records: reconciliation?.currentComparable?.records ?? null,
    distinctXml: reconciliation?.currentComparable?.distinctXml ?? null,
    identitySetSha256: reconciliation?.currentComparable?.identitySetSha256 ?? null,
    derivation: reconciliation?.currentComparable?.derivation ?? null,
  },
  parseAuditResolution: policy?.parseAudit ?? null,
  correctnessContract: {
    report: "research/optimizer/freeze/KERNEL_V1_CORRECTNESS_CONTRACT.json",
    status: correctnessContract?.recoveredPredicate?.status ?? "UNKNOWN",
    id: correctnessContract?.recoveredPredicate?.id ?? null,
    leptonBoardDeltaIsAcceptanceGate: correctnessContract?.proofs?.boardsComparisonIsAcceptanceGate ?? null,
    okWithDeltaPositive: correctnessContract?.proofs?.okWithDeltaPositive ?? null,
    errorWithDeltaNonPositive: correctnessContract?.proofs?.errorWithDeltaNonPositive ?? null,
  },
  correctnessExecutionSemantics: {
    report: "research/optimizer/freeze/KERNEL_V1_CORRECTNESS_EXECUTION_SEMANTICS.json",
    status: correctnessExecutionSemantics?.status ?? "UNKNOWN",
    multisetId: correctnessExecutionSemantics?.multiset?.id ?? null,
    multisetKey: correctnessExecutionSemantics?.multiset?.key ?? null,
    usableBoardId: correctnessExecutionSemantics?.usableBoard?.id ?? null,
    projectTrimDefault: correctnessExecutionSemantics?.usableBoard?.defaultWhenMissing ?? null,
    executionBindingId: correctnessExecutionBindingId,
    corpusRolesReady,
    historicalValidationCorpus: "parte1 via --historicalCorpus",
    certificationCorpus: "resto via --corpus",
    historicalReplayInferenceBoundary: "The exact historical 60/60 replay validates the classifier on parte1. It does not impose an expected-infeasible count on resto.",
  },
  fullPlanHash: provenance?.fullPlanHash ?? null,
  formalCertification: {
    policy: "research/optimizer/freeze/KERNEL_V1_FORMAL_CERTIFICATION_POLICY.json",
    staticPreflightHarness: "scripts/kernel-freeze/formal-certification-v3.mjs",
    calibrationHarness: "scripts/kernel-freeze/kernel-budget-calibration-v3.mjs",
    requiredPhysicalArguments: ["--historicalCorpus <extracted-parte1>", "--corpus <extracted-resto>"],
    supersededCalibrationHarness: "scripts/kernel-freeze/kernel-budget-calibration-v2.mjs",
    deterministicBudgetsReady,
    correctnessPredicateReady,
    correctnessPredicateId,
    correctnessExecutionBindingId,
    policyReady: formalPolicyReady,
    blockingReasons: formalPolicyReady ? [] : (policy?.blockingReasons ?? []),
  },
  sourceReports: [
    "research/optimizer/freeze/KERNEL_V1_FREEZE_PROVENANCE.json",
    "research/optimizer/freeze/KERNEL_V1_CORRECTNESS_PARTITIONS.json",
    "research/optimizer/freeze/KERNEL_V1_RESTO_RECONCILIATION.json",
    "research/optimizer/freeze/KERNEL_V1_CORRECTNESS_CONTRACT.json",
    "research/optimizer/freeze/KERNEL_V1_CORRECTNESS_EXECUTION_SEMANTICS.json",
    "research/optimizer/freeze/KERNEL_V1_HISTORICAL_REPLAY_CORPUS_BINDING_2026-09-07.md"
  ],
  supersedesForCorrectnessDecision:
    "The embedded-only correctness8669 status is forensic legacy evidence. The exact 8,650 certification identity cohort is defined by resto archive/embedded reconciliation. The 2,000-row historical benchmark evidence belongs to parte1 and validates the infeasible classifier there; it is not a reference-result corpus for resto. Historical acceptance is validity plus the rotation-normalized terminal-dimension multiset. For project execution, usable-board feasibility is bound to the first root trim (historical default 10) applied to both axes; the canonical parser remains unchanged.",
  nextGate: !traceabilityComplete
    ? "Repair failed traceability/execution-semantics checks without changing optimizer heuristics or canonical parser policy."
    : !correctnessPredicateReady
      ? "Repair the versioned historical correctness execution/corpus binding before formal certification."
      : formalPolicyReady
        ? "Run formal correctness and determinism-repeat over the exact classified resto cohort with zero watchdog hits and the versioned policy."
        : "Run the exact historical infeasible replay on parte1 via --historicalCorpus, then the resto physical preflight via --corpus, Step 0 telemetry probe, and deterministic-budget calibration. Do not treat 60/2000 as an expected count for resto and do not reuse v2 calibration checkpoints.",
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({
  out: relative(outPath),
  status: report.status,
  traceabilityComplete,
  corpusRolesReady,
  correctnessPredicateReady,
  formalPolicyReady,
  kernelCandidate: report.kernelCandidate,
  correctness: report.currentCorrectnessCohort,
}));
if (!traceabilityComplete || !correctnessPredicateReady) process.exitCode = 1;

function relative(path) {
  return path.startsWith(repo) ? path.slice(repo.length + 1).replace(/\\/g, "/") : path.replace(/\\/g, "/");
}

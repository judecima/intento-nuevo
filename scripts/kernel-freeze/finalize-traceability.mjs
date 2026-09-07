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
const correctnessPredicateReady =
  policy?.correctnessPredicate?.status === "RESOLVED" &&
  correctnessPredicateId === CORRECTNESS_PREDICATE &&
  correctnessContract?.recoveredPredicate?.id === correctnessPredicateId &&
  correctnessExecutionBindingId === EXECUTION_BINDING &&
  policy?.correctnessPredicate?.multisetSemantics?.id === MULTISET_SEMANTICS &&
  correctnessExecutionSemantics?.multiset?.id === MULTISET_SEMANTICS &&
  correctnessExecutionSemantics?.usableBoard?.id === USABLE_BOARD_SEMANTICS;
const formalPolicyReady = deterministicBudgetsReady && correctnessPredicateReady && policy?.formalCertificationReady === true;

const status = !traceabilityComplete
  ? "BLOCKED"
  : formalPolicyReady
    ? "TRACEABILITY_CORRECTNESS_EXECUTION_SEMANTICS_COMPLETE_FORMAL_POLICY_READY"
    : correctnessPredicateReady
      ? "TRACEABILITY_CORRECTNESS_EXECUTION_SEMANTICS_COMPLETE_BUDGET_CALIBRATION_PENDING"
      : "TRACEABILITY_COMPLETE_FORMAL_POLICY_BLOCKED";

const report = {
  schemaVersion: "kernel-v1-freeze-traceability-v4",
  generatedAt: new Date().toISOString(),
  kernelCandidate: KERNEL_CANDIDATE,
  status,
  kernelFrozen: false,
  traceabilityComplete,
  checks,
  historicalCohorts: {
    sentinels: 5,
    hotspots: 213,
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
  },
  fullPlanHash: provenance?.fullPlanHash ?? null,
  formalCertification: {
    policy: "research/optimizer/freeze/KERNEL_V1_FORMAL_CERTIFICATION_POLICY.json",
    staticPreflightHarness: "scripts/kernel-freeze/formal-certification-v3.mjs",
    calibrationHarness: "scripts/kernel-freeze/kernel-budget-calibration-v3.mjs",
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
    "research/optimizer/freeze/KERNEL_V1_CORRECTNESS_EXECUTION_SEMANTICS.json"
  ],
  supersedesForCorrectnessDecision:
    "The embedded-only correctness8669 status is forensic legacy evidence. The exact 8,650 identity cohort is defined by archive/embedded reconciliation. Historical acceptance is validity plus the rotation-normalized terminal-dimension multiset. For project execution, usable-board feasibility is bound to the first root trim (historical default 10) applied to both axes; the canonical parser remains unchanged.",
  nextGate: !traceabilityComplete
    ? "Repair failed traceability/execution-semantics checks without changing optimizer heuristics or canonical parser policy."
    : !correctnessPredicateReady
      ? "Repair the versioned historical correctness execution binding before formal certification."
      : formalPolicyReady
        ? "Run formal correctness and determinism-repeat over the exact classified cohort with zero watchdog hits and the versioned policy."
        : "Run the v3 physical-corpus preflight, exact 60-case historical infeasible replay, Step 0 telemetry probe, then calibrate/version deterministic production budgets. Do not reuse v2 calibration checkpoints.",
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({
  out: relative(outPath),
  status: report.status,
  traceabilityComplete,
  correctnessPredicateReady,
  formalPolicyReady,
  kernelCandidate: report.kernelCandidate,
  correctness: report.currentCorrectnessCohort,
}));
if (!traceabilityComplete || !correctnessPredicateReady) process.exitCode = 1;

function relative(path) {
  return path.startsWith(repo) ? path.slice(repo.length + 1).replace(/\\/g, "/") : path.replace(/\\/g, "/");
}

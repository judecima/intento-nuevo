#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const repo = resolve(new URL("../..", import.meta.url).pathname.replace(/^\/(.:\/)/, "$1"));
const provenancePath = resolve(repo, "research/optimizer/freeze/KERNEL_V1_FREEZE_PROVENANCE.json");
const reconciliationPath = resolve(repo, "research/optimizer/freeze/KERNEL_V1_RESTO_RECONCILIATION.json");
const policyPath = resolve(repo, "research/optimizer/freeze/KERNEL_V1_FORMAL_CERTIFICATION_POLICY.json");
const correctnessContractPath = resolve(repo, "research/optimizer/freeze/KERNEL_V1_CORRECTNESS_CONTRACT.json");
const outPath = resolve(repo, process.argv[2] ?? "research/optimizer/freeze/KERNEL_V1_FREEZE_TRACEABILITY.json");
const KERNEL_CANDIDATE = "4063963260abb10c8d68d0e553942899c925cc2f";
const COHORT_SHA256 = "36d005421ae79b01867e0bba377c1bf526801bcd4dcfa2b0180e12cf354458f3";
const CORRECTNESS_PREDICATE = "HISTORICAL_VALIDITY_V1";

const provenance = JSON.parse(readFileSync(provenancePath, "utf8"));
const reconciliation = JSON.parse(readFileSync(reconciliationPath, "utf8"));
const policy = JSON.parse(readFileSync(policyPath, "utf8"));
const correctnessContract = JSON.parse(readFileSync(correctnessContractPath, "utf8"));

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
const correctnessPredicateReady =
  policy?.correctnessPredicate?.status === "RESOLVED" &&
  correctnessPredicateId === CORRECTNESS_PREDICATE &&
  correctnessContract?.recoveredPredicate?.id === correctnessPredicateId;
const formalPolicyReady = deterministicBudgetsReady && correctnessPredicateReady && policy?.formalCertificationReady === true;

const status = !traceabilityComplete
  ? "BLOCKED"
  : formalPolicyReady
    ? "TRACEABILITY_AND_CORRECTNESS_CONTRACT_COMPLETE_FORMAL_POLICY_READY"
    : correctnessPredicateReady
      ? "TRACEABILITY_AND_CORRECTNESS_CONTRACT_COMPLETE_BUDGET_CALIBRATION_PENDING"
      : "TRACEABILITY_COMPLETE_FORMAL_POLICY_BLOCKED";

const report = {
  schemaVersion: "kernel-v1-freeze-traceability-v3",
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
  fullPlanHash: provenance?.fullPlanHash ?? null,
  formalCertification: {
    policy: "research/optimizer/freeze/KERNEL_V1_FORMAL_CERTIFICATION_POLICY.json",
    harness: "scripts/kernel-freeze/formal-certification-v2.mjs",
    deterministicBudgetsReady,
    correctnessPredicateReady,
    correctnessPredicateId,
    policyReady: formalPolicyReady,
    blockingReasons: formalPolicyReady ? [] : (policy?.blockingReasons ?? []),
  },
  sourceReports: [
    "research/optimizer/freeze/KERNEL_V1_FREEZE_PROVENANCE.json",
    "research/optimizer/freeze/KERNEL_V1_CORRECTNESS_PARTITIONS.json",
    "research/optimizer/freeze/KERNEL_V1_RESTO_RECONCILIATION.json",
    "research/optimizer/freeze/KERNEL_V1_CORRECTNESS_CONTRACT.json"
  ],
  supersedesForCorrectnessDecision:
    "The embedded-only correctness8669 status is forensic legacy evidence. The exact 8,650 identity cohort is defined by archive/embedded reconciliation. The historical acceptance predicate is independently recovered from benchmark_project_v10.csv: estado is validity/exact-demand, while delta/reference_panels is quality comparison only.",
  nextGate: !traceabilityComplete
    ? "Repair failed traceability checks without changing optimizer heuristics."
    : !correctnessPredicateReady
      ? "Recover/version the historical correctness predicate before formal certification."
      : formalPolicyReady
        ? "Run physical-corpus preflight, resumable formal correctness, and determinism-repeat passes over the exact 8,650 cohort, with zero watchdog hits and the versioned policy."
        : "Run physical-corpus preflight to enumerate expected-infeasible cases, then calibrate and version deterministic production budgets from aggregate per-order Step 0 telemetry. Do not add a new aggregate stop condition inside this candidate.",
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

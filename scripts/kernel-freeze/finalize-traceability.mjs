#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const repo = resolve(new URL("../..", import.meta.url).pathname.replace(/^\/(.:\/)/, "$1"));
const provenancePath = resolve(repo, "research/optimizer/freeze/KERNEL_V1_FREEZE_PROVENANCE.json");
const reconciliationPath = resolve(repo, "research/optimizer/freeze/KERNEL_V1_RESTO_RECONCILIATION.json");
const policyPath = resolve(repo, "research/optimizer/freeze/KERNEL_V1_FORMAL_CERTIFICATION_POLICY.json");
const outPath = resolve(repo, process.argv[2] ?? "research/optimizer/freeze/KERNEL_V1_FREEZE_TRACEABILITY.json");
const KERNEL_CANDIDATE = "4063963260abb10c8d68d0e553942899c925cc2f";
const COHORT_SHA256 = "36d005421ae79b01867e0bba377c1bf526801bcd4dcfa2b0180e12cf354458f3";

const provenance = JSON.parse(readFileSync(provenancePath, "utf8"));
const reconciliation = JSON.parse(readFileSync(reconciliationPath, "utf8"));
const policy = JSON.parse(readFileSync(policyPath, "utf8"));

const checks = {
  fiveSentinelsRecovered: provenance?.freezeTraceability?.sentinels === "RECOVERED",
  hotspots213Recovered: provenance?.freezeTraceability?.hotspots === "RECOVERED",
  fullPlanHashRecovered: provenance?.freezeTraceability?.fullPlanHash === "RECOVERED",
  archive8669UniqueAudited: reconciliation?.auditSummary?.archiveXml === 8669 && reconciliation?.auditSummary?.uniqueNames === 8669,
  restoReconciliationRecovered: reconciliation?.status === "RECOVERED",
  exactCurrentCorrectness8650: reconciliation?.currentComparable?.records === 8650 && reconciliation?.currentComparable?.distinctXml === 8650,
  exactCurrentCorrectnessHash: reconciliation?.currentComparable?.identitySetSha256 === COHORT_SHA256,
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
const supportedPredicates = new Set(policy?.correctnessPredicate?.supportedRunnerPredicates ?? []);
const correctnessPredicateId = policy?.correctnessPredicate?.id ?? null;
const correctnessPredicateReady = policy?.correctnessPredicate?.status === "RESOLVED" && supportedPredicates.has(correctnessPredicateId);
const formalPolicyReady = deterministicBudgetsReady && correctnessPredicateReady && policy?.formalCertificationReady === true;

const status = !traceabilityComplete
  ? "BLOCKED"
  : formalPolicyReady
    ? "TRACEABILITY_COMPLETE_FORMAL_POLICY_READY"
    : "TRACEABILITY_COMPLETE_FORMAL_POLICY_BLOCKED";

const report = {
  schemaVersion: "kernel-v1-freeze-traceability-v2",
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
  fullPlanHash: provenance?.fullPlanHash ?? null,
  formalCertification: {
    policy: "research/optimizer/freeze/KERNEL_V1_FORMAL_CERTIFICATION_POLICY.json",
    harness: "scripts/kernel-freeze/formal-certification.mjs",
    deterministicBudgetsReady,
    correctnessPredicateReady,
    correctnessPredicateId,
    policyReady: formalPolicyReady,
    blockingReasons: formalPolicyReady ? [] : (policy?.blockingReasons ?? []),
  },
  sourceReports: [
    "research/optimizer/freeze/KERNEL_V1_FREEZE_PROVENANCE.json",
    "research/optimizer/freeze/KERNEL_V1_CORRECTNESS_PARTITIONS.json",
    "research/optimizer/freeze/KERNEL_V1_RESTO_RECONCILIATION.json"
  ],
  supersedesForCorrectnessDecision: "The embedded-only correctness8669 status in KERNEL_V1_FREEZE_PROVENANCE.json is forensic legacy evidence. The correctness traceability decision is the archive/embedded reconciliation. The formal correctness acceptance predicate remains a separate policy contract and is not inferred from the cohort count.",
  nextGate: !traceabilityComplete
    ? "Repair failed traceability checks without changing optimizer heuristics."
    : formalPolicyReady
      ? "Run resumable formal correctness and determinism-repeat passes over the exact 8,650 cohort, with zero watchdog hits and the versioned policy."
      : "Calibrate/version deterministic production budgets and recover or explicitly version the formal correctness predicate. The calibration harness may run with budgets OFF; formal correctness/determinism must not run yet.",
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({
  out: relative(outPath),
  status: report.status,
  traceabilityComplete,
  formalPolicyReady,
  kernelCandidate: report.kernelCandidate,
  correctness: report.currentCorrectnessCohort,
}));
if (!traceabilityComplete) process.exitCode = 1;

function relative(path) {
  return path.startsWith(repo) ? path.slice(repo.length + 1).replace(/\\/g, "/") : path.replace(/\\/g, "/");
}

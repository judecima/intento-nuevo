#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const repo = resolve(new URL("../..", import.meta.url).pathname.replace(/^\/(.:\/)/, "$1"));
const provenancePath = resolve(repo, "research/optimizer/freeze/KERNEL_V1_FREEZE_PROVENANCE.json");
const reconciliationPath = resolve(repo, "research/optimizer/freeze/KERNEL_V1_RESTO_RECONCILIATION.json");
const outPath = resolve(repo, process.argv[2] ?? "research/optimizer/freeze/KERNEL_V1_FREEZE_TRACEABILITY.json");
const KERNEL_CANDIDATE = "4063963260abb10c8d68d0e553942899c925cc2f";

const provenance = JSON.parse(readFileSync(provenancePath, "utf8"));
const reconciliation = JSON.parse(readFileSync(reconciliationPath, "utf8"));

const checks = {
  fiveSentinelsRecovered: provenance?.freezeTraceability?.sentinels === "RECOVERED",
  hotspots213Recovered: provenance?.freezeTraceability?.hotspots === "RECOVERED",
  fullPlanHashRecovered: provenance?.freezeTraceability?.fullPlanHash === "RECOVERED",
  archive8669UniqueAudited: reconciliation?.auditSummary?.archiveXml === 8669 && reconciliation?.auditSummary?.uniqueNames === 8669,
  restoReconciliationRecovered: reconciliation?.status === "RECOVERED",
  exactCurrentCorrectness8650: reconciliation?.currentComparable?.records === 8650 && reconciliation?.currentComparable?.distinctXml === 8650,
};

const ready = Object.values(checks).every(Boolean);
const report = {
  schemaVersion: "kernel-v1-freeze-traceability-v1",
  generatedAt: new Date().toISOString(),
  kernelCandidate: KERNEL_CANDIDATE,
  status: ready ? "READY_FOR_FORMAL_CERTIFICATION" : "BLOCKED",
  kernelFrozen: false,
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
  fullPlanHash: provenance?.fullPlanHash ?? null,
  sourceReports: [
    "research/optimizer/freeze/KERNEL_V1_FREEZE_PROVENANCE.json",
    "research/optimizer/freeze/KERNEL_V1_CORRECTNESS_PARTITIONS.json",
    "research/optimizer/freeze/KERNEL_V1_RESTO_RECONCILIATION.json"
  ],
  supersedesForCorrectnessDecision: "The embedded-only correctness8669 status in KERNEL_V1_FREEZE_PROVENANCE.json is forensic legacy evidence. The final correctness traceability decision is the archive/embedded reconciliation in KERNEL_V1_RESTO_RECONCILIATION.json.",
  nextGate: ready
    ? "Run formal correctness + determinism certification over the exact 8,650 current-comparable cohort against the unchanged Kernel V1 candidate."
    : "Repair failed traceability checks without changing optimizer heuristics.",
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({
  out: relative(outPath),
  status: report.status,
  kernelCandidate: report.kernelCandidate,
  correctness: report.currentCorrectnessCohort,
}));
if (!ready) process.exitCode = 1;

function relative(path) {
  return path.startsWith(repo) ? path.slice(repo.length + 1).replace(/\\/g, "/") : path.replace(/\\/g, "/");
}

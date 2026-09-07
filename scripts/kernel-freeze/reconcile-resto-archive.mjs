#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

const repo = resolve(new URL("../..", import.meta.url).pathname.replace(/^\/(.:\/)/, "$1"));
const canonicalPath = resolve(repo, "experiencia/canonical_cases.json");
const auditPath = resolve(repo, "research/optimizer/freeze/KERNEL_V1_RESTO_ARCHIVE_AUDIT_2026-09-07.json");
const truthPath = resolve(repo, "EXPERIENCE_OPTIMIZER_TRUTH.md");
const outPath = resolve(repo, process.argv[2] ?? "research/optimizer/freeze/KERNEL_V1_RESTO_RECONCILIATION.json");

const canonical = JSON.parse(readFileSync(canonicalPath, "utf8"));
const audit = JSON.parse(readFileSync(auditPath, "utf8"));
const truth = readFileSync(truthPath, "utf8");

if (!Array.isArray(canonical)) throw new Error("canonical_cases.json must be an array");
if (!Array.isArray(audit?.currentParser?.rejections)) throw new Error("resto archive audit must include currentParser.rejections");

const restoRecords = canonical.filter((record) => partitionKey(normalizePath(record?.source_path)) === "resto");
const restoFiles = restoRecords
  .map((record) => basename(normalizePath(record?.source_path)))
  .filter((name) => /\.xml$/i.test(name));
const restoIdentities = [...new Set(restoFiles)].sort(cmp);

const resolutions = audit.currentParser.rejections.map((entry) => {
  const stem = String(entry.stem);
  const code = String(entry.code);
  const matches = restoIdentities
    .filter((file) => auditStemMatches(xmlStem(file), stem))
    .sort(cmp);
  return { stem, code, matches, matchCount: matches.length };
});

const mixed = resolutions.filter((row) => row.code === "mixed-board-formats");
const strict = resolutions.filter((row) => row.code !== "mixed-board-formats");
const mixedResolvedExactlyOnce = mixed.every((row) => row.matchCount === 1);
const strictAbsentFromEmbeddedResto = strict.every((row) => row.matchCount === 0);

const mixedFiles = new Set(mixed.flatMap((row) => row.matches));
const currentComparableRecords = restoRecords.filter((record) => {
  const file = basename(normalizePath(record?.source_path));
  return /\.xml$/i.test(file) && !mixedFiles.has(file);
});
const currentComparableIdentities = [...new Set(currentComparableRecords
  .map((record) => basename(normalizePath(record?.source_path)))
  .filter((name) => /\.xml$/i.test(name)))].sort(cmp);

const rejectionCounts = Object.fromEntries([...new Set(audit.currentParser.rejections.map((entry) => String(entry.code)))]
  .sort(cmp)
  .map((code) => [code, audit.currentParser.rejections.filter((entry) => entry.code === code).length]));

const checks = {
  archiveHas8669Xml: audit?.archive?.xmlFiles === 8669,
  archiveHas8669UniqueNames: audit?.archive?.uniqueNames === 8669,
  currentParserTotalIs8669: audit?.currentParser?.total === 8669,
  currentParserAcceptedIs8650: audit?.currentParser?.accepted === 8650,
  currentParserRejectedIs19: audit?.currentParser?.rejected === 19,
  currentParserClassificationSums: Number(audit?.currentParser?.project ?? 0) + Number(audit?.currentParser?.order ?? 0) === Number(audit?.currentParser?.accepted ?? -1),
  acceptedPlusRejectedSumsToArchive: Number(audit?.currentParser?.accepted ?? 0) + Number(audit?.currentParser?.rejected ?? 0) === Number(audit?.archive?.xmlFiles ?? -1),
  rejectionManifestHas19Entries: audit.currentParser.rejections.length === 19,
  rejectionManifestHas13MixedBoard: mixed.length === 13,
  rejectionManifestHas6Strict: strict.length === 6,
  embeddedRestoHas8663DistinctXml: restoIdentities.length === 8663,
  embeddedRestoHas8680Records: restoRecords.length === 8680,
  all13MixedBoardResolveExactlyOnceInEmbeddedResto: mixedResolvedExactlyOnce,
  all6StrictRejectionsAreAbsentFromEmbeddedResto: strictAbsentFromEmbeddedResto,
  sixAbsentReconcile8663To8669: restoIdentities.length + strict.length === 8669,
  removing13MixedReconciles8663To8650: restoIdentities.length - mixed.length === 8650,
  currentComparableHas8650DistinctXml: currentComparableIdentities.length === 8650,
  currentComparableHas8650CanonicalRecords: currentComparableRecords.length === 8650,
  historicalTruthSays8650Canonical: /8650 casos canonicos sobre 8669 XML/.test(truth),
  historicalTruthExcludesMixedStockByDesign: /Exclusion por diseno de XML con stock mixto/.test(truth),
};

const status = Object.values(checks).every(Boolean) ? "RECOVERED" : "BLOCKED";
const report = {
  schemaVersion: "kernel-v1-resto-reconciliation-v2",
  generatedAt: new Date().toISOString(),
  inputs: {
    canonical: relative(canonicalPath),
    canonicalSha256: sha256(readFileSync(canonicalPath)),
    archiveAudit: relative(auditPath),
    archiveAuditSha256: sha256(readFileSync(auditPath)),
    historicalTruth: relative(truthPath),
    historicalTruthSha256: sha256(readFileSync(truthPath)),
  },
  auditSummary: {
    archiveXml: audit.archive.xmlFiles,
    uniqueNames: audit.archive.uniqueNames,
    currentAccepted: audit.currentParser.accepted,
    currentRejected: audit.currentParser.rejected,
    currentProject: audit.currentParser.project,
    currentOrder: audit.currentParser.order,
    rejectionCounts,
  },
  embeddedResto: {
    records: restoRecords.length,
    distinctXml: restoIdentities.length,
    identitySetSha256: hashList(restoIdentities),
  },
  rejectionResolution: {
    identityRule: "exact stem; numeric audit stems additionally resolve a unique embedded filename beginning with <order>__ or <order>_",
    mixedBoard: mixed,
    strict: strict,
    mixedResolvedExactlyOnce,
    strictAbsentFromEmbeddedResto,
  },
  currentComparable: {
    records: currentComparableRecords.length,
    distinctXml: currentComparableIdentities.length,
    identitySetSha256: hashList(currentComparableIdentities),
    derivation: "embedded resto identities minus the 13 audited mixed-board-formats identities; the six other audited parser rejections are the six archive identities absent from embedded resto",
  },
  checks,
  status,
  conclusion: status === "RECOVERED"
    ? "EXACT_8669_ARCHIVE_RECONCILED_AND_EXACT_CURRENT_8650_COMPARABLE_COHORT_RECOVERED"
    : "RESTO_ARCHIVE_RECONCILIATION_INCOMPLETE",
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({
  out: relative(outPath),
  status,
  resto: `${restoRecords.length}/${restoIdentities.length}`,
  mixedResolved: `${mixed.filter((row) => row.matchCount === 1).length}/${mixed.length}`,
  strictAbsent: `${strict.filter((row) => row.matchCount === 0).length}/${strict.length}`,
  currentComparable: `${currentComparableRecords.length}/${currentComparableIdentities.length}`,
  identitySetSha256: report.currentComparable.identitySetSha256,
}));

function auditStemMatches(fileStem, auditStem) {
  if (fileStem === auditStem) return true;
  if (!/^\d+$/.test(auditStem)) return false;
  return fileStem.startsWith(`${auditStem}__`) || fileStem.startsWith(`${auditStem}_`);
}

function partitionKey(source) {
  if (!source) return "";
  const marker = "/xml_experience/";
  const lower = source.toLowerCase();
  const idx = lower.indexOf(marker);
  const parent = dirname(source).replace(/\\/g, "/");
  if (idx < 0) return parent;
  const relativePath = source.slice(idx + marker.length);
  const segments = relativePath.split("/").filter(Boolean);
  segments.pop();
  return segments.length ? segments.join("/") : ".";
}

function normalizePath(value) {
  return typeof value === "string" ? value.trim().replace(/\\/g, "/") : "";
}

function xmlStem(file) {
  return file.replace(/\.xml$/i, "");
}

function hashList(values) {
  const sorted = [...new Set(values)].sort(cmp);
  return createHash("sha256").update(sorted.join("\n") + (sorted.length ? "\n" : "")).digest("hex");
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function relative(path) {
  return path.startsWith(repo) ? path.slice(repo.length + 1).replace(/\\/g, "/") : path.replace(/\\/g, "/");
}

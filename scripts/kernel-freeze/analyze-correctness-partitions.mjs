#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

const repo = resolve(new URL("../..", import.meta.url).pathname.replace(/^\/(.:\/)/, "$1"));
const canonicalPath = resolve(repo, "experiencia/canonical_cases.json");
const outPath = resolve(repo, process.argv[2] ?? "research/optimizer/freeze/KERNEL_V1_CORRECTNESS_PARTITIONS.json");
const TARGET_XML = 8669;
const TARGET_CANONICAL = 8650;

const canonical = JSON.parse(readFileSync(canonicalPath, "utf8"));
if (!Array.isArray(canonical)) throw new Error("canonical_cases.json must be an array");

const partitions = new Map();
const identityOwners = new Map();
for (const record of canonical) {
  const source = normalizePath(record?.source_path);
  if (!source || !/\.xml$/i.test(source)) continue;
  const key = partitionKey(source);
  let p = partitions.get(key);
  if (!p) {
    p = { key, records: 0, identities: new Set(), formats: new Map(), samples: [] };
    partitions.set(key, p);
  }
  p.records++;
  const file = basename(source);
  p.identities.add(file);
  const format = String(record?.source_format ?? "unknown").toLowerCase();
  p.formats.set(format, (p.formats.get(format) ?? 0) + 1);
  if (p.samples.length < 5) p.samples.push(source);

  let owners = identityOwners.get(file);
  if (!owners) identityOwners.set(file, owners = new Set());
  owners.add(key);
}

const parts = [...partitions.values()]
  .map((p) => ({
    key: p.key,
    records: p.records,
    distinctXml: p.identities.size,
    formats: Object.fromEntries([...p.formats.entries()].sort(([a], [b]) => cmp(a, b))),
    identitySha256: hashList([...p.identities]),
    samples: p.samples,
  }))
  .sort((a, b) => b.records - a.records || cmp(a.key, b.key));

const crossPartitionDuplicates = [...identityOwners.entries()]
  .filter(([, owners]) => owners.size > 1)
  .map(([file, owners]) => ({ file, partitions: [...owners].sort(cmp) }))
  .sort((a, b) => cmp(a.file, b.file));

const exactCanonicalRecordCombos = findSubsetCombos(parts, TARGET_CANONICAL, "records", 50);
const exactXmlRecordCombos = findSubsetCombos(parts, TARGET_XML, "records", 50);
const exactCanonicalDistinctCombos = findSubsetCombos(parts, TARGET_CANONICAL, "distinctXml", 50);
const exactXmlDistinctCombos = findSubsetCombos(parts, TARGET_XML, "distinctXml", 50);

const candidateCombos = dedupeCombos([
  ...exactCanonicalRecordCombos.map((keys) => ({ basis: "records=8650", keys })),
  ...exactCanonicalDistinctCombos.map((keys) => ({ basis: "sum(distinctXml)=8650", keys })),
  ...exactXmlRecordCombos.map((keys) => ({ basis: "records=8669", keys })),
  ...exactXmlDistinctCombos.map((keys) => ({ basis: "sum(distinctXml)=8669", keys })),
]).map(({ basis, keys }) => characterize(keys, basis));

const strongCandidates = candidateCombos.filter((c) =>
  c.records === TARGET_CANONICAL && c.actualDistinctXml === TARGET_CANONICAL);

const report = {
  schemaVersion: "kernel-v1-correctness-partitions-v1",
  generatedAt: new Date().toISOString(),
  input: {
    canonical: "experiencia/canonical_cases.json",
    sha256: createHash("sha256").update(readFileSync(canonicalPath)).digest("hex"),
    records: canonical.length,
  },
  historicalTargets: {
    xmlFiles: TARGET_XML,
    canonicalCases: TARGET_CANONICAL,
    missingNonCanonicalXml: TARGET_XML - TARGET_CANONICAL,
  },
  partitions: parts,
  partitionCount: parts.length,
  crossPartitionDuplicateIdentityCount: crossPartitionDuplicates.length,
  crossPartitionDuplicateSamples: crossPartitionDuplicates.slice(0, 50),
  subsetSearch: {
    exactCanonicalRecordCombinationCount: exactCanonicalRecordCombos.length,
    exactXmlRecordCombinationCount: exactXmlRecordCombos.length,
    exactCanonicalDistinctCombinationCount: exactCanonicalDistinctCombos.length,
    exactXmlDistinctCombinationCount: exactXmlDistinctCombos.length,
    candidates: candidateCombos.slice(0, 100),
    strongCandidates,
  },
  conclusion: strongCandidates.length === 1
    ? "UNIQUE_8650_CANONICAL_PARTITION_SET_RECOVERED"
    : strongCandidates.length > 1
      ? "MULTIPLE_8650_CANONICAL_PARTITION_SETS_REQUIRE_DISAMBIGUATION"
      : "NO_EXACT_8650_CANONICAL_PARTITION_SET_FROM_SOURCE_DIRECTORIES",
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({
  out: relative(outPath),
  partitions: parts.length,
  strongCandidates: strongCandidates.length,
  conclusion: report.conclusion,
}));

function characterize(keys, basis) {
  const selected = keys.map((key) => partitions.get(key)).filter(Boolean);
  const identities = new Set();
  let records = 0;
  const formats = new Map();
  for (const p of selected) {
    records += p.records;
    for (const file of p.identities) identities.add(file);
    for (const [format, count] of p.formats) formats.set(format, (formats.get(format) ?? 0) + count);
  }
  return {
    basis,
    partitions: [...keys].sort(cmp),
    records,
    actualDistinctXml: identities.size,
    duplicateRecordsWithinUnion: records - identities.size,
    formats: Object.fromEntries([...formats.entries()].sort(([a], [b]) => cmp(a, b))),
    identitySha256: hashList([...identities]),
  };
}

function dedupeCombos(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const keys = [...item.keys].sort(cmp);
    const sig = `${item.basis}\0${keys.join("\0")}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push({ basis: item.basis, keys });
  }
  return out;
}

function findSubsetCombos(parts, target, field, limit) {
  // Dynamic programming: preserve only a bounded number of exact decompositions per sum.
  const dp = new Map([[0, [[]]]]);
  for (const part of parts) {
    const weight = Number(part[field] ?? 0);
    if (!Number.isInteger(weight) || weight <= 0 || weight > target) continue;
    const snapshot = [...dp.entries()].sort((a, b) => b[0] - a[0]);
    for (const [sum, combos] of snapshot) {
      const next = sum + weight;
      if (next > target) continue;
      const bucket = dp.get(next) ?? [];
      for (const combo of combos) {
        if (bucket.length >= limit) break;
        bucket.push([...combo, part.key]);
      }
      dp.set(next, bucket);
    }
  }
  return dp.get(target) ?? [];
}

function partitionKey(source) {
  const marker = "/xml_experience/";
  const lower = source.toLowerCase();
  const idx = lower.indexOf(marker);
  const parent = dirname(source).replace(/\\/g, "/");
  if (idx < 0) return parent;
  const relative = source.slice(idx + marker.length);
  const segments = relative.split("/").filter(Boolean);
  segments.pop();
  // Preserve the full imported directory lineage: it is provenance, not presentation.
  return segments.length ? segments.join("/") : ".";
}

function normalizePath(value) {
  return typeof value === "string" ? value.trim().replace(/\\/g, "/") : "";
}

function hashList(values) {
  const sorted = [...new Set(values)].sort(cmp);
  return createHash("sha256").update(sorted.join("\n") + (sorted.length ? "\n" : "")).digest("hex");
}

function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function relative(path) {
  return path.startsWith(repo) ? path.slice(repo.length + 1).replace(/\\/g, "/") : path.replace(/\\/g, "/");
}

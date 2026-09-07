#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

const repo = resolve(new URL("../..", import.meta.url).pathname.replace(/^\/(.:\/)/, "$1"));
const canonicalPath = resolve(repo, "experiencia/canonical_cases.json");
const hotspotPath = resolve(repo, "experiencia/v6/hotspot-all.jsonl");
const traceGatePath = resolve(repo, "scripts/deferred-trace-gate.mjs");
const truthPath = resolve(repo, "EXPERIENCE_OPTIMIZER_TRUTH.md");
const outPath = resolve(repo, process.argv[2] ?? "research/optimizer/determinism/KERNEL_V1_FREEZE_PROVENANCE.json");

const EXPECTED = {
  canonicalEmbedded: 20844,
  historicalXml: 8669,
  historicalProject: 7320,
  historicalOrder: 1346,
  historicalParseErrors: 3,
  historicalCanonical: 8650,
  hotspots: 213,
  sentinels: {
    "4050594": 7,
    "4056900": 6,
    "4057401": 4,
    "4058501": 8,
    "4059200": 17,
  },
  referenceFullPlanHash4050594: "e858a3bfd89f69b7165954039f3f809752250712736316239f349d8fafbdcd42",
};

const canonical = JSON.parse(readFileSync(canonicalPath, "utf8"));
if (!Array.isArray(canonical)) throw new Error("canonical_cases.json must be an array");

const hotspotRows = readFileSync(hotspotPath, "utf8")
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line))
  .filter((row) => row.ok !== false && !row.engineCacheHit);
const hotspotFiles = hotspotRows.map((row) => String(row.file));

const traceGateSource = readFileSync(traceGatePath, "utf8");
const truthSource = readFileSync(truthPath, "utf8");

const scalarPaths = new Map();
const xmlIdentities = new Set();
const xmlIdentityPaths = new Map();
const orderLikeIdentities = new Set();
const recordXmlIdentityCounts = new Map();

for (const record of canonical) {
  const perRecordXml = new Set();
  walk(record, "", (path, value) => {
    const type = value === null ? "null" : typeof value;
    let stat = scalarPaths.get(path);
    if (!stat) {
      stat = { count: 0, types: new Set(), samples: [] };
      scalarPaths.set(path, stat);
    }
    stat.count++;
    stat.types.add(type);
    if (stat.samples.length < 4) stat.samples.push(compactScalar(value));

    if (typeof value !== "string") return;
    const normalized = normalizePossibleXml(value);
    if (normalized) {
      xmlIdentities.add(normalized);
      perRecordXml.add(normalized);
      let pathStat = xmlIdentityPaths.get(path);
      if (!pathStat) {
        pathStat = { count: 0, samples: [] };
        xmlIdentityPaths.set(path, pathStat);
      }
      pathStat.count++;
      if (pathStat.samples.length < 8 && !pathStat.samples.includes(normalized)) pathStat.samples.push(normalized);
    }
    if (/^\d{6,}(?:__|_|$)/.test(value)) orderLikeIdentities.add(value);
  });
  const n = perRecordXml.size;
  recordXmlIdentityCounts.set(n, (recordXmlIdentityCounts.get(n) ?? 0) + 1);
}

const canonicalXmlFiles = [...xmlIdentities].sort(codePointCompare);
const hotspotUnique = new Set(hotspotFiles);
const hotspotAllUnique = hotspotUnique.size === EXPECTED.hotspots && hotspotFiles.length === EXPECTED.hotspots;
const hotspotInCanonical = hotspotFiles.filter((file) => xmlIdentities.has(file));
const hotspotMissingFromCanonical = hotspotFiles.filter((file) => !xmlIdentities.has(file));

const sentinelResolution = Object.entries(EXPECTED.sentinels).map(([order, boards]) => {
  const hotspotMatches = hotspotFiles.filter((name) => name.startsWith(`${order}__`));
  const canonicalMatches = canonicalXmlFiles.filter((name) => name.startsWith(`${order}__`));
  return { order, expectedBoards: boards, hotspotMatches, canonicalMatches };
});

const hashContract = {
  algorithm: "sha256",
  serialization: "JSON.stringify(stable(value))",
  stableObjects: "object keys recursively sorted by code-point/default Array.sort semantics in the versioned runner",
  stableArrays: "array order preserved",
  fullPlan: "{ geometry, traces, quality }",
  geometry: "{ boards, placements, cuts, remnants, trees } with trace/_diagLink/_diagPath recursively excluded",
  traces: "result.placements.map(placement => placement.trace)",
  quality: "result.metrics excluding engineMs and cacheHit",
  referenceCase: "4050594",
  referenceHash: EXPECTED.referenceFullPlanHash4050594,
};

const historicalTruthChecks = {
  xml8669: /XML files:\s*8669/.test(truthSource),
  project7320: /Raiz project:\s*7320/.test(truthSource),
  order1346: /Raiz Order:\s*1346/.test(truthSource),
  parseErrors3: /Parse errors:\s*3/.test(truthSource),
  canonical8650: /8650 casos canonicos sobre 8669 XML/.test(truthSource),
};
const traceGateChecks = {
  frozen213Assertion: /rows\.length !== 213/.test(traceGateSource) && /213 unique non-cache cases/.test(traceGateSource),
  sentinelsLiteral: Object.entries(EXPECTED.sentinels).every(([order, boards]) =>
    traceGateSource.includes(`"${order}": ${boards}`)),
  referenceFullPlanHash: traceGateSource.includes(EXPECTED.referenceFullPlanHash4050594),
  fullPlanConstruction: /const fullPlan = \{ geometry, traces, quality \}/.test(traceGateSource),
  sha256StableJson: /createHash\("sha256"\)\.update\(JSON\.stringify\(stable\(value\)\)\)/.test(traceGateSource),
};

const historicalIdentityStatus = canonicalXmlFiles.length === EXPECTED.historicalXml
  ? "EXACT_8669_RECOVERED"
  : canonicalXmlFiles.length === EXPECTED.historicalCanonical
    ? "CANONICAL_8650_IDENTITIES_RECOVERED_BUT_19_NONCANONICAL_XML_STILL_UNRESOLVED"
    : "EXACT_8669_IDENTITIES_NOT_PRESENT_IN_EMBEDDED_CANONICAL_RECORDS";

const report = {
  schemaVersion: "kernel-v1-freeze-provenance-v1",
  generatedAt: new Date().toISOString(),
  inputs: {
    canonical: relative(canonicalPath),
    canonicalSha256: sha256(readFileSync(canonicalPath)),
    hotspot: relative(hotspotPath),
    hotspotSha256: sha256(readFileSync(hotspotPath)),
    traceGate: relative(traceGatePath),
    traceGateSha256: sha256(readFileSync(traceGatePath)),
    historicalTruth: relative(truthPath),
    historicalTruthSha256: sha256(readFileSync(truthPath)),
  },
  expected: EXPECTED,
  embeddedCanonical: {
    count: canonical.length,
    countMatchesExpected: canonical.length === EXPECTED.canonicalEmbedded,
    topLevelKeys: unionTopLevelKeys(canonical),
    scalarPaths: [...scalarPaths.entries()]
      .map(([path, stat]) => ({ path, count: stat.count, types: [...stat.types].sort(), samples: stat.samples }))
      .sort((a, b) => codePointCompare(a.path, b.path)),
    xmlIdentityPaths: [...xmlIdentityPaths.entries()]
      .map(([path, stat]) => ({ path, count: stat.count, samples: stat.samples }))
      .sort((a, b) => b.count - a.count || codePointCompare(a.path, b.path)),
    distinctXmlIdentities: canonicalXmlFiles.length,
    xmlIdentitySetSha256: sha256(Buffer.from(canonicalXmlFiles.join("\n") + (canonicalXmlFiles.length ? "\n" : ""))),
    recordXmlIdentityCounts: Object.fromEntries([...recordXmlIdentityCounts.entries()].sort((a, b) => a[0] - b[0])),
    orderLikeStringCount: orderLikeIdentities.size,
    xmlIdentitySamples: canonicalXmlFiles.slice(0, 20),
  },
  historicalCorrectness: {
    sourceCorpus: "D:/proyectos asistidos/lepton/data/lepton-xml",
    inventoryEvidence: historicalTruthChecks,
    identityStatus: historicalIdentityStatus,
    recoveredIdentityCount: canonicalXmlFiles.length,
    exact8669Recovered: canonicalXmlFiles.length === EXPECTED.historicalXml,
    identitySetSha256: sha256(Buffer.from(canonicalXmlFiles.join("\n") + (canonicalXmlFiles.length ? "\n" : ""))),
  },
  hotspots: {
    exactSource: "experiencia/v6/hotspot-all.jsonl filtered by ok !== false && !engineCacheHit",
    count: hotspotFiles.length,
    uniqueCount: hotspotUnique.size,
    exact213: hotspotAllUnique,
    fileSetSha256: sha256(Buffer.from([...hotspotUnique].sort(codePointCompare).join("\n") + "\n")),
    presentInEmbeddedCanonicalIdentities: hotspotInCanonical.length,
    missingFromEmbeddedCanonicalIdentities: hotspotMissingFromCanonical.length,
    missingSamples: hotspotMissingFromCanonical.slice(0, 20),
  },
  sentinels: {
    exact5: sentinelResolution.length === 5 && traceGateChecks.sentinelsLiteral,
    cases: sentinelResolution,
  },
  fullPlanHash: {
    status: Object.values(traceGateChecks).every(Boolean) ? "HISTORICAL_CONTRACT_RECOVERED" : "INCOMPLETE",
    checks: traceGateChecks,
    contract: hashContract,
  },
  freezeTraceability: {
    sentinels: sentinelResolution.length === 5 && traceGateChecks.sentinelsLiteral ? "RECOVERED" : "BLOCKED",
    hotspots: hotspotAllUnique && traceGateChecks.frozen213Assertion ? "RECOVERED" : "BLOCKED",
    fullPlanHash: Object.values(traceGateChecks).every(Boolean) ? "RECOVERED" : "BLOCKED",
    correctness8669: canonicalXmlFiles.length === EXPECTED.historicalXml ? "RECOVERED" : "BLOCKED",
  },
};

report.freezeTraceability.readyForFormalFreeze = Object.values(report.freezeTraceability)
  .filter((value) => typeof value === "string")
  .every((value) => value === "RECOVERED");

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({
  out: relative(outPath),
  embeddedCanonical: report.embeddedCanonical.count,
  xmlIdentities: canonicalXmlFiles.length,
  hotspots: `${hotspotFiles.length}/${hotspotUnique.size}`,
  sentinels: report.freezeTraceability.sentinels,
  fullPlanHash: report.freezeTraceability.fullPlanHash,
  correctness8669: report.freezeTraceability.correctness8669,
  readyForFormalFreeze: report.freezeTraceability.readyForFormalFreeze,
}));

function walk(value, path, visit) {
  if (value === null || typeof value !== "object") {
    visit(path || "$", value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walk(item, path ? `${path}[]` : "[]", visit);
    return;
  }
  for (const key of Object.keys(value)) walk(value[key], path ? `${path}.${key}` : key, visit);
}

function normalizePossibleXml(value) {
  const trimmed = value.trim().replace(/\\/g, "/");
  if (!/\.xml$/i.test(trimmed)) return null;
  return basename(trimmed);
}

function compactScalar(value) {
  if (typeof value === "string") return value.length > 160 ? `${value.slice(0, 157)}...` : value;
  return value;
}

function unionTopLevelKeys(records) {
  return [...new Set(records.flatMap((record) => record && typeof record === "object" && !Array.isArray(record) ? Object.keys(record) : []))].sort(codePointCompare);
}

function codePointCompare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function relative(path) {
  return path.startsWith(repo) ? path.slice(repo.length + 1).replace(/\\/g, "/") : path.replace(/\\/g, "/");
}

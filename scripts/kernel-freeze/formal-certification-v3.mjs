#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(import.meta.url);
const REPO = resolve(dirname(SCRIPT), "../..");
const CANDIDATE = "4063963260abb10c8d68d0e553942899c925cc2f";
const COHORT_HASH = "36d005421ae79b01867e0bba377c1bf526801bcd4dcfa2b0180e12cf354458f3";
const CORRECTNESS = "HISTORICAL_VALIDITY_V1";
const MULTISET = "HISTORICAL_TERMINAL_DIMENSION_MULTISET_V1";
const USABLE_BOARD = "HISTORICAL_PROJECT_ROOT_TRIM_V1";
const EXECUTION_BINDING = "physical-xml-historical-validity-v1";
const P = join(REPO, "research/optimizer/freeze");
const args = parseArgs(process.argv.slice(2));
const mode = args._[0] ?? "preflight";
if (mode !== "preflight") {
  throw new Error("formal execution remains disabled until deterministic production budgets are calibrated and versioned; v3 is a static provenance/execution-binding preflight");
}

const policy = read(join(P, "KERNEL_V1_FORMAL_CERTIFICATION_POLICY.json"));
const trace = read(join(P, "KERNEL_V1_FREEZE_TRACEABILITY.json"));
const recon = read(join(P, "KERNEL_V1_RESTO_RECONCILIATION.json"));
const audit = read(join(P, "KERNEL_V1_RESTO_ARCHIVE_AUDIT_2026-09-07.json"));
const contract = read(join(P, "KERNEL_V1_CORRECTNESS_CONTRACT.json"));
const semantics = read(join(P, "KERNEL_V1_CORRECTNESS_EXECUTION_SEMANTICS.json"));
const embedded = read(join(REPO, "experiencia/canonical_cases.json"));

const resto = embedded.filter((record) => partition(record?.source_path) === "resto");
const restoIds = [...new Set(resto.map(identity).filter(Boolean))].sort(cmp);
const mixed = (audit?.currentParser?.rejections ?? []).filter((entry) => entry.code === "mixed-board-formats");
if (mixed.length !== 13) throw new Error(`expected 13 mixed-board identities, got ${mixed.length}`);
if (mixed.some((entry) => typeof entry.file !== "string" || !/\.xml$/i.test(entry.file))) {
  throw new Error("mixed-board audit entries must have literal file identities");
}
const restoSet = new Set(restoIds);
for (const entry of mixed) {
  if (!restoSet.has(entry.file)) throw new Error(`literal mixed-board identity absent from embedded resto: ${entry.file}`);
}
const mixedFiles = mixed.map((entry) => entry.file).sort(cmp);
const mixedSet = new Set(mixedFiles);
const records = resto.filter((record) => !mixedSet.has(identity(record)));
const ids = [...new Set(records.map(identity).filter(Boolean))].sort(cmp);
const identitySetSha256 = hashList(ids);
const runtimeMatchesCandidate = spawnSync("git", ["diff", "--quiet", CANDIDATE, "--", "src/lib/optimizer"], { cwd: REPO }).status === 0;

const correctnessExecutionSemanticsReady =
  semantics?.status === "RECOVERED" &&
  semantics?.multiset?.id === MULTISET &&
  semantics?.multiset?.rotationNormalized === true &&
  semantics?.usableBoard?.id === USABLE_BOARD &&
  semantics?.usableBoard?.defaultWhenMissing === 10 &&
  semantics?.usableBoard?.apply === "same trim value to refiladoX and refiladoY";

const traceabilityComplete =
  policy?.kernelCandidate === CANDIDATE && trace?.kernelCandidate === CANDIDATE &&
  recon?.status === "RECOVERED" && recon?.auditSummary?.archiveXml === 8669 && recon?.auditSummary?.uniqueNames === 8669 &&
  records.length === 8650 && ids.length === 8650 && identitySetSha256 === COHORT_HASH &&
  contract?.recoveredPredicate?.status === "RECOVERED" && contract?.recoveredPredicate?.id === CORRECTNESS &&
  correctnessExecutionSemanticsReady;

const correctnessPredicateReady =
  policy?.correctnessPredicate?.status === "RESOLVED" &&
  policy?.correctnessPredicate?.id === CORRECTNESS &&
  policy?.correctnessPredicate?.executionBinding?.id === EXECUTION_BINDING &&
  policy?.correctnessPredicate?.multisetSemantics?.id === MULTISET;

const values = policy?.deterministicBudgets?.values ?? {};
const budgetKeys = [
  "OPTIMIZER_MAX_BEAM_EXPANSIONS",
  "OPTIMIZER_BEAM_WATCHDOG_MS",
  "OPTIMIZER_MAX_MASTER_NODES",
  "OPTIMIZER_MASTER_WATCHDOG_MS",
  "OPTIMIZER_MAX_RESCUE_ATTEMPTS",
  "OPTIMIZER_RESCUE_WATCHDOG_MS",
];
const deterministicBudgetsReady =
  policy?.deterministicBudgets?.status === "RESOLVED" &&
  budgetKeys.every((key) => Number.isSafeInteger(values[key]) && values[key] > 0);
const formalCertificationReady =
  traceabilityComplete && runtimeMatchesCandidate && correctnessPredicateReady && deterministicBudgetsReady && policy?.formalCertificationReady === true;

const blockingReasons = [];
if (!traceabilityComplete) blockingReasons.push("traceability/correctness execution semantics preflight failed");
if (!runtimeMatchesCandidate) blockingReasons.push("runtime differs from Kernel V1 candidate");
if (!correctnessPredicateReady) blockingReasons.push("historical correctness predicate/execution binding is not resolved");
if (!deterministicBudgetsReady) blockingReasons.push("production deterministic budgets/watchdogs are not calibrated and versioned");

const report = {
  schemaVersion: "kernel-v1-formal-certification-preflight-v3",
  generatedAt: new Date().toISOString(),
  kernelCandidate: CANDIDATE,
  status: formalCertificationReady
    ? "READY_FOR_FORMAL_CERTIFICATION"
    : traceabilityComplete && runtimeMatchesCandidate && correctnessPredicateReady
      ? "TRACEABILITY_CORRECTNESS_EXECUTION_SEMANTICS_COMPLETE_BUDGET_CALIBRATION_PENDING"
      : "BLOCKED",
  traceabilityComplete,
  runtimeMatchesCandidate,
  cohort: { records: records.length, distinctXml: ids.length, identitySetSha256, mixedBoardExcluded: mixedFiles.length },
  correctnessExecutionSemantics: {
    ready: correctnessExecutionSemanticsReady,
    predicateId: CORRECTNESS,
    multisetId: semantics?.multiset?.id ?? null,
    usableBoardId: semantics?.usableBoard?.id ?? null,
    executionBindingId: policy?.correctnessPredicate?.executionBinding?.id ?? null,
  },
  policy: {
    correctnessPredicateReady,
    correctnessPredicateId: policy?.correctnessPredicate?.id ?? null,
    deterministicBudgetsReady,
    formalCertificationReady,
    blockingReasons,
  },
  executionContract: {
    strategy: "v10",
    correctness: CORRECTNESS,
    executionBindingId: EXECUTION_BINDING,
    projectTrim: "first project root trim; historical default 10; applied to both axes",
    orderTrim: "canonical Order binding unchanged",
    demandMultiset: "rotation-normalized terminal dimensions only (min x max)",
    referencePanelsRole: "quality comparison only; not an acceptance gate",
    physicalCorpusRequiredForExecution: true,
    calibrationHarness: "scripts/kernel-freeze/kernel-budget-calibration-v3.mjs",
    supersededCalibrationHarness: "scripts/kernel-freeze/kernel-budget-calibration-v2.mjs",
  },
};

const out = resolve(args.report ?? join(P, "KERNEL_V1_FORMAL_CERTIFICATION_PREFLIGHT.json"));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({
  status: report.status,
  cohort: `${records.length}/${ids.length}`,
  identitySetSha256,
  correctnessExecutionSemanticsReady,
  correctnessPredicateReady,
  deterministicBudgetsReady,
  formalCertificationReady,
  blockingReasons,
}));
if (!traceabilityComplete || !runtimeMatchesCandidate || !correctnessPredicateReady) process.exitCode = 1;

function read(path) { return JSON.parse(readFileSync(path, "utf8")); }
function partition(path) {
  const parts = String(path ?? "").replace(/\\/g, "/").split("/").filter(Boolean);
  const i = parts.lastIndexOf("xml_experience");
  return i >= 0 ? (parts[i + 1] ?? "(root)") : "(outside)";
}
function identity(record) {
  const path = String(record?.source_path ?? "").replace(/\\/g, "/");
  return path ? basename(path) : null;
}
function hashList(values) { return createHash("sha256").update(values.join("\n") + "\n").digest("hex"); }
function cmp(a, b) { return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0; }
function parseArgs(values) {
  const out = { _: [] };
  for (let i = 0; i < values.length; i++) {
    const token = values[i];
    if (!token.startsWith("--")) { out._.push(token); continue; }
    const key = token.slice(2), next = values[i + 1];
    if (next != null && !next.startsWith("--")) { out[key] = next; i++; }
    else out[key] = true;
  }
  return out;
}

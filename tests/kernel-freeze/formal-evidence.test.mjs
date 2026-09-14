import assert from "node:assert/strict";
import { test } from "node:test";
import { validateCheckpoint } from "../../scripts/kernel-freeze/formal-correctness-v1.mjs";

const values = { beam: 1024 };
const state = { feasible: [{ file: "a.xml", case: { pieces: [] } }] };
const row = {
  file: "a.xml", phase: "formal-correctness",
  executionBindingId: "physical-xml-historical-validity-v1",
  correctnessPredicate: "HISTORICAL_VALIDITY_V1", productionBudgets: values,
  pass: true, ok: true, validationOk: true, demandMultisetOk: true,
  cacheHit: false, pieces: 1, expectedPieces: 1, fullPlanHash: "a".repeat(64),
  beamAccounting: { ok: true }, beamFallbackAccepted: true, zeroWatchdogHits: true,
  watchdogHits: { beam: 0, master: 0, oneboard: 0 },
};
const check = (rows) => validateCheckpoint(rows, state, values, "formal-correctness");

test("accepts historical evidence without newly added provenance fields", () => {
  assert.doesNotThrow(() => check([row]));
});

test("rejects duplicate and out-of-cohort identities rather than counting them as coverage", () => {
  assert.throws(() => check([row, row]), /duplicate/);
  assert.throws(() => check([{ ...row, file: "unknown.xml" }]), /unknown/);
});

test("rejects changed budgets, inputs, candidate, or validity semantics", () => {
  for (const changes of [
    { productionBudgets: { beam: 2048 } }, { canonicalInputHash: "b".repeat(64) },
    { kernelCandidate: "another-candidate" }, { executionBindingId: "other-semantics" },
  ]) assert.throws(() => check([{ ...row, ...changes }]), /drift/);
});

test("never trusts a PASS flag over contradictory correctness or watchdog evidence", () => {
  for (const changes of [
    { validationOk: false }, { demandMultisetOk: false }, { pieces: 0 },
    { cacheHit: true }, { fullPlanHash: null }, { pass: false },
    { watchdogHits: { beam: 0, master: 1, oneboard: 0 } },
    { step0: { master: { watchdogHits: 1 } } },
  ]) assert.throws(() => check([{ ...row, ...changes }]));
});

test("a repeat must equal its exact baseline, including the recorded baseline hash", () => {
  const baseline = new Map([[row.file, row]]);
  const repeat = { ...row, phase: "formal-determinism", fullPlanHashMatches: true, baselineFullPlanHash: row.fullPlanHash };
  const checkRepeat = (r) => validateCheckpoint([r], state, values, "formal-determinism", baseline);
  assert.doesNotThrow(() => checkRepeat(repeat));
  assert.throws(() => checkRepeat({ ...repeat, fullPlanHash: "b".repeat(64) }), /mismatch/);
  assert.throws(() => checkRepeat({ ...repeat, baselineFullPlanHash: "b".repeat(64) }), /mismatch/);
});

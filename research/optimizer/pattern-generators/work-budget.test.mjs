import assert from "node:assert/strict";
import { test } from "node:test";
import { createWorkBudget, validateBudget } from "./work-budget.mjs";

const budget = { maxExpansions: 2, maxAndCombinations: 3, maxFrontierEntries: 2, maxMaterializations: 2 };

test("atomic replacement at capacity retains occupancy and counts insertion and replacement", () => {
  const work = createWorkBudget(budget);
  assert.throws(() => work.replaceFrontierEntry(), /live frontier entry/);
  work.tryReserveFrontier(); work.tryReserveFrontier();
  assert.equal(work.replaceFrontierEntry(), true);
  const s = work.snapshot();
  assert.deepEqual([s.frontierLive, s.frontierPeak, s.frontierInserted, s.replaced], [2, 2, 3, 1]);
  assert.equal(s.searchStopReason, null);
  assert.equal(s.hits.maxFrontierEntries, 0);
});

test("replacement cannot reactivate stopped search or count rejected work", () => {
  const work = createWorkBudget(budget);
  work.tryReserveFrontier(); work.tryReserveFrontier(); work.tryReserveFrontier();
  work.releaseFrontier();
  const before = work.snapshot();
  assert.equal(work.replaceFrontierEntry(), false);
  assert.deepEqual(work.snapshot(), before);
});

test("requires all four finite work limits and rejects timeout as a primary budget", () => {
  for (const invalid of [null, {}, { ...budget, timeoutMs: 1000 }, { ...budget, maxExpansions: Infinity },
    { ...budget, maxAndCombinations: 0 }, { ...budget, maxFrontierEntries: 1.5 },
    { ...budget, maxMaterializations: Number.MAX_SAFE_INTEGER + 1 }]) {
    assert.throws(() => validateBudget(invalid));
  }
});

test("admits the last expansion; marks exhaustion only when another expansion is attempted", () => {
  const work = createWorkBudget(budget);
  assert.equal(work.tryExpand(), true);
  assert.equal(work.tryExpand(), true);
  assert.equal(work.snapshot().searchStopReason, null);
  assert.equal(work.tryExpand(), false);
  assert.equal(work.tryExpand(), false);
  assert.equal(work.tryCombine(), false);
  assert.equal(work.snapshot().used.expansions, 2);
  assert.equal(work.snapshot().hits.maxExpansions, 1);
});

test("rejected AND pairs still consume their admission and stop search at the limit", () => {
  const work = createWorkBudget(budget);
  // These represent three examined pairs, irrespective of their acceptance.
  for (let i = 0; i < 3; i++) assert.equal(work.tryCombine(), true);
  assert.equal(work.tryCombine(), false);
  assert.equal(work.tryExpand(), false);
  assert.equal(work.snapshot().searchStopReason, "maxAndCombinations");
});

test("frontier counts live entries separately from cumulative insertions", () => {
  const work = createWorkBudget(budget);
  assert.equal(work.tryReserveFrontier(), true);
  assert.equal(work.tryReserveFrontier(), true);
  work.releaseFrontier();
  assert.equal(work.tryReserveFrontier(), true);
  assert.deepEqual([work.snapshot().frontierLive, work.snapshot().frontierPeak, work.snapshot().frontierInserted], [2, 2, 3]);
  assert.equal(work.tryReserveFrontier(), false);
  work.releaseFrontier(2);
  // Freeing memory after exhaustion must not restart a stopped search.
  assert.equal(work.tryReserveFrontier(), false);
  assert.equal(work.snapshot().searchStopReason, "maxFrontierEntries");
  assert.throws(() => work.releaseFrontier(), /live entries/);
});

test("finalization has a separate bound and counts unsuccessful materialization attempts", () => {
  const work = createWorkBudget({ ...budget, maxExpansions: 1 });
  work.tryExpand();
  work.tryExpand();
  assert.equal(work.tryMaterialize(), true); // a failed attempt still costs one
  assert.equal(work.tryMaterialize(), true);
  assert.equal(work.tryMaterialize(), false);
  assert.equal(work.snapshot().used.materializations, 2);
  assert.equal(work.snapshot().materializationStopped, true);
  assert.equal(work.tryExpand(), false);
});

test("caller mutation cannot change limits or accounting", () => {
  const supplied = { ...budget };
  const work = createWorkBudget(supplied);
  supplied.maxExpansions = 100;
  const snapshot = work.snapshot();
  snapshot.used.expansions = 100;
  snapshot.limits.maxExpansions = 100;
  assert.equal(work.snapshot().limits.maxExpansions, 2);
  assert.equal(work.snapshot().used.expansions, 0);
});

test("an early materialization limit also prevents any further search", () => {
  const work = createWorkBudget({ ...budget, maxMaterializations: 1 });
  assert.equal(work.tryMaterialize(), true);
  assert.equal(work.tryMaterialize(), false);
  assert.equal(work.tryExpand(), false);
  assert.equal(work.tryCombine(), false);
  assert.equal(work.tryReserveFrontier(), false);
  assert.equal(work.snapshot().searchStopReason, "maxMaterializations");
});

test("the same work sequence produces the same accounting in three independent ledgers", () => {
  const run = () => {
    const work = createWorkBudget(budget);
    work.tryExpand(); work.tryReserveFrontier(); work.tryCombine();
    work.tryReserveFrontier(); work.releaseFrontier(); work.tryCombine();
    work.tryCombine(); work.tryCombine(); work.tryMaterialize();
    return work.snapshot();
  };
  assert.deepEqual(run(), run());
  assert.deepEqual(run(), run());
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { createContext } from "./context.mjs";
import { createFrontier, geometryKey, entrySignature } from "./frontier.mjs";
import { createWorkBudget } from "./work-budget.mjs";
const ctx = createContext([{ base: 1, altura: 1, cant: 3, ref: "A" }],
  { placaBase: 4, placaAltura: 3, sierra: 0, etapas: 2, restoMin: 1, restoMax: 1 });
const state = { width: ctx.width, height: ctx.height, axis: "x", level: 1 };
const budget = (capacity = 100) => createWorkBudget({ maxExpansions: 100, maxAndCombinations: 100, maxFrontierEntries: capacity, maxMaterializations: 100 });
// Descriptor fixtures isolate ledger/diversity behavior; physical correctness
// of search-generated summaries is checked against materialization in H2.
const entry = (usage = 1, variant = 1, remnants = [{ x: 0, y: 0, w: 1, h: 1 }], complexity = [1, 1, 3]) => ({
  geometryKey: geometryKey(ctx, state), usageVector: [usage], usedArea: usage, remnants, cutComplexity: complexity,
  cutTree: { kind: "slice", axis: "x", parts: [{ size: variant, content: { kind: "piece", type: 0, rotated: false } }] },
});
test("deduplicates canonical content, not object identity or property order, without reserving a full frontier", () => {
  const work = budget(1), f = createFrontier(ctx, state, work, { maxVariantsPerUsageVector: 10 });
  const a = entry(); assert.equal(f.insert(a), "INSERTED");
  const b = { ...structuredClone(a), nodeId: 999 };
  b.cutTree = { parts: b.cutTree.parts, axis: "x", kind: "slice" };
  assert.equal(f.insert(b), "DUPLICATE");
  assert.equal(work.snapshot().searchStopReason, null);
  assert.equal(work.snapshot().frontierInserted, 1);
  assert.equal(f.snapshot().dominated, 0);
  assert.equal(f.snapshot().searchRestricted, false);
});
test("retains different usage vectors even when larger usage has more area", () => {
  const f = createFrontier(ctx, state, budget(), { maxVariantsPerUsageVector: 1 });
  f.insert(entry(1)); f.insert(entry(2));
  assert.deepEqual(f.entries().map((e) => e.usageVector[0]).sort(), [1, 2]);
  assert.equal(f.snapshot().heuristic, 0);
});
test("replaces inside a full frontier atomically and labels the discarded variant heuristic", () => {
  const work = budget(1), f = createFrontier(ctx, state, work, { maxVariantsPerUsageVector: 1 });
  const old = entry(); f.insert(old);
  const better = entry(1, 2, [{ x: 0, y: 0, w: 2, h: 2 }]);
  assert.equal(f.insert(better), "REPLACED");
  assert.equal(f.entries()[0], better);
  const s = work.snapshot();
  assert.deepEqual([s.frontierLive, s.frontierPeak, s.frontierInserted, s.replaced], [1, 1, 2, 1]);
  assert.equal(s.searchStopReason, null);
  assert.deepEqual(f.snapshot().restrictionReasons, ["maxVariantsPerUsageVector"]);
  assert.equal(f.snapshot().heuristic, 1);
  assert.equal(old.cutTree.parts.length, 1); // no destruction of a referenced old subtree
});
test("rejects a losing variant as heuristic without consuming another slot", () => {
  const work = budget(1), f = createFrontier(ctx, state, work, { maxVariantsPerUsageVector: 1 });
  f.insert(entry(1, 1, [{ x: 0, y: 0, w: 2, h: 2 }]));
  assert.equal(f.insert(entry()), "HEURISTIC_PRUNED");
  assert.equal(f.snapshot().searchRestricted, true);
  assert.equal(work.snapshot().frontierInserted, 1);
});
test("preserves shape diversity ahead of a second tree of the same shape", () => {
  const f = createFrontier(ctx, state, budget(2), { maxVariantsPerUsageVector: 2 });
  const a = entry(1, 1, [{ x: 0, y: 0, w: 2, h: 2 }]), b = entry(1, 2, a.remnants);
  const c = entry(1, 3, [{ x: 0, y: 0, w: 1, h: 2 }]);
  f.insert(a); f.insert(b); assert.equal(f.insert(c), "REPLACED");
  assert.ok(f.entries().includes(c)); assert.equal(f.snapshot().size, 2);
});
test("disposal releases slots and never reactivates stopped search or destroys shared children", () => {
  const work = budget(1), first = createFrontier(ctx, state, work, { maxVariantsPerUsageVector: 10 });
  const a = entry(), child = a.cutTree.parts[0].content;
  first.insert(a);
  assert.equal(first.insert(entry(2)), "WORK_LIMIT");
  first.dispose(); first.dispose();
  assert.equal(work.snapshot().frontierLive, 0);
  assert.equal(work.tryReserveFrontier(), false);
  assert.equal(child.kind, "piece");
  assert.throws(() => first.insert(entry()), /disposed/);
});
test("keys separate quantities, grain, type references, geometry, axes and levels", () => {
  const key = geometryKey(ctx, state);
  for (const change of [{ cant: 2 }, { veta: true }, { ref: "B" }]) {
    const other = createContext([{ ...ctx.lines[0], ...change }], ctx.opts);
    assert.notEqual(geometryKey(other, state), key);
    const f = createFrontier(other, state, budget(), { maxVariantsPerUsageVector: 2 });
    assert.throws(() => f.insert(entry()), /another geometry\/context/);
  }
  for (const change of [{ width: 3000 }, { axis: "y" }, { level: 2 }]) assert.notEqual(geometryKey(ctx, { ...state, ...change }), key);
});
test("accepted entries are immutable and returned arrays do not expose frontier storage", () => {
  const f = createFrontier(ctx, state, budget(), { maxVariantsPerUsageVector: 2 });
  const a = entry(); f.insert(a);
  assert.throws(() => { a.usageVector[0] = 3; });
  f.entries().pop(); assert.equal(f.snapshot().size, 1);
});
test("selection is repeatable under different insertion orders for the same descriptor set", () => {
  const values = [entry(1, 3), entry(1, 2), entry(1, 1), entry(1, 4, [{ x: 0, y: 0, w: 2, h: 1 }])];
  const run = (entries) => {
    const f = createFrontier(ctx, state, budget(), { maxVariantsPerUsageVector: 2 });
    entries.forEach((e) => f.insert(e)); return f.entries().map(entrySignature);
  };
  assert.deepEqual(run(values), run([...values].reverse()));
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { stableJson } from "../canonical.mjs";
import { exhaustiveTinyOracle } from "../tiny-oracle.mjs";
import { H2_FIXTURES, H2_LIMITS } from "../h2-fixtures.mjs";
import { generatePatterns } from "./and-or.mjs";
import { createCandidateIndex, coordinateCursor } from "./candidates.mjs";
import { cutCoordinates } from "../cut-policy.mjs";
import { createWorkBudget } from "../work-budget.mjs";
import { createAgenda } from "./agenda.mjs";
const trees = (entries) => [...new Set(entries.map((e) => stableJson({ usage: e.usageVector, tree: e.cutTree })))].sort();

for (const { name, context } of H2_FIXTURES) test(`B0.2 matches independent oracle: ${name}`, () => {
  const result = generatePatterns(context, H2_LIMITS, { maxVariantsPerUsageVector: 100000 });
  assert.equal(result.status, "COMPLETE", JSON.stringify(result.failures));
  for (const axis of ["x", "y"]) assert.deepEqual(trees(result.roots.filter((r) => r.rootAxis === axis)), trees(exhaustiveTinyOracle(context, axis)));
  assert.equal(result.telemetry.frontierPruned.heuristic, 0);
  assert.equal(result.telemetry.frontierPruned.dominated, 0);
  assert.equal(result.patterns.length, result.telemetry.rootPatternsProduced);
  assert.equal(result.telemetry.propagationPinsLive, 0);
  assert.ok(result.stateAudit.every((s) => s.complete && s.cached));
  assert.equal(result.telemetry.andPairsConsidered, result.telemetry.used.andCombinations);
  assert.equal(Object.values(result.telemetry.expansionsByWork).reduce((a, b) => a + b, 0), result.telemetry.used.expansions);
  assert.equal(Object.values(result.telemetry.expansionsByRootAxis).reduce((a, b) => a + b, 0), result.telemetry.used.expansions);
  assert.ok(result.telemetry.firstNonEmptyRootExpansion <= result.telemetry.firstMaterializableRootExpansion);
});

test("exact indices and suspendable linear coordinates preserve all legal candidates", () => {
  for (const { context } of H2_FIXTURES) {
    const index = createCandidateIndex(context, () => true);
    for (const axis of ["x", "y"]) for (const width of [context.width, ...context.types.map((t) => t.cutWidth)]) {
      const state = { width, height: context.height, axis, level: context.opts.etapas + 1 };
      assert.deepEqual(index.exact(state), index.orientations.filter(({ orientation: o }) => o.width === width && o.height === state.height));
      assert.deepEqual(index.terminal(state), index.orientations.filter(({ orientation: o }) => axis === "y"
        ? o.width === width && o.height < state.height : o.height === state.height && o.width < width));
      const cursor = coordinateCursor(context, state, index.orientations, { coordinateStreams: 0, coordinateProposals: 0, duplicateCoordinates: 0 });
      const actual = [];
      while (cursor.kind) { const value = cursor.step(); if (value !== null) actual.push(value); }
      assert.deepEqual([...new Set(actual)].sort((a,b)=>a-b), [...new Set(cutCoordinates(context, state, createWorkBudget(H2_LIMITS), { coordinateStreams: 0, coordinateProposals: 0, duplicateCoordinates: 0 }))].sort((a,b)=>a-b));
    }
  }
});

test("agenda preserves axis fairness and bounds productive bursts", () => {
  const agenda = createAgenda(["x", "y"]), actual = [];
  for (const axis of ["x", "y"]) {
    agenda.add(axis, false, () => {}); agenda.add(axis, true, () => {});
    for (let i=0;i<6;i++) agenda.add(axis, "productive", () => {});
  }
  for (let i=0;i<12;i++) { const task=agenda.take(); actual.push([task.axis, task.priority]); }
  assert.deepEqual(actual.map((x)=>x[0]), ["x","y","x","y","x","y","x","y","x","y","x","y"]);
  assert.ok(actual.some((x)=>x[1]==="state"));
  assert.ok(actual.some((x)=>x[1]==="productive"));
});

test("interrupted states never publish complete cache; both axes start and budgets reconcile", () => {
  const context = H2_FIXTURES[4].context;
  for (const limits of [{ ...H2_LIMITS, maxExpansions: 20 }, { ...H2_LIMITS, maxAndCombinations: 8 },
    { ...H2_LIMITS, maxFrontierEntries: 20 }, { ...H2_LIMITS, maxMaterializations: 1 }]) {
    const a = generatePatterns(context, limits, { maxVariantsPerUsageVector: 8 });
    const b = generatePatterns(context, limits, { maxVariantsPerUsageVector: 8 });
    assert.equal(a.status, "WORK_LIMIT"); assert.deepEqual(a.telemetry, b.telemetry); assert.equal(a.rootHash, b.rootHash);
    assert.ok(a.telemetry.rootVisits.every((r) => r.status !== "NOT_STARTED"));
    assert.ok(a.telemetry.used.expansions <= limits.maxExpansions);
    assert.ok(a.telemetry.used.andCombinations <= limits.maxAndCombinations);
    assert.ok(a.telemetry.frontierPeak <= limits.maxFrontierEntries);
    assert.ok(a.telemetry.used.materializations <= limits.maxMaterializations);
    if (!a.telemetry.searchComplete) assert.ok(a.stateAudit.every((s) => !s.complete && !s.cached));
  }
});

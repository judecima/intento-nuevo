import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { stableJson } from "./canonical.mjs";
import { createContext } from "./context.mjs";
import { exhaustiveTinyOracle } from "./tiny-oracle.mjs";
import { generatePatterns } from "./and-or.mjs";
import { materializePattern } from "./physical-pattern.mjs";
import { H2_FIXTURES, H2_LIMITS } from "./h2-fixtures.mjs";
const require = createRequire(import.meta.url);
const { materializar } = require("../../../src/lib/optimizer/legacy/materializar.cjs");
const { validarPlanIndustrial } = require("../../../src/lib/optimizer/legacy/validador_industrial_v3.cjs");
const usages = (entries) => [...new Set(entries.map((e) => stableJson(e.usageVector)))].sort();
const trees = (entries) => [...new Set(entries.map((e) => stableJson({ usage: e.usageVector, tree: e.cutTree })))].sort();

for (const { name, context } of H2_FIXTURES) test(`oracle/search exact usage and tree sets: ${name}`, () => {
  const actual = generatePatterns(context, H2_LIMITS, { maxVariantsPerUsageVector: 100000 });
  assert.equal(actual.status, "COMPLETE", JSON.stringify(actual.failures));
  assert.equal(actual.telemetry.frontierPruned.heuristic, 0);
  assert.equal(actual.telemetry.frontierPruned.dominated, 0);
  assert.deepEqual(actual.restrictionReasons, ["piece-multiples-v1"]);
  assert.equal(actual.telemetry.andPairsConsidered, actual.telemetry.used.andCombinations);
  for (const axis of ["x", "y"]) {
    const oracle = exhaustiveTinyOracle(context, axis);
    const roots = actual.roots.filter((r) => r.rootAxis === axis);
    assert.deepEqual(usages(roots), usages(oracle), `usage ${axis}`);
    assert.deepEqual(trees(roots), trees(oracle), `canonical tree ${axis}`);
  }
  // All returned nonempty roots were finalized and validated. Check summaries
  // separately against physical reconstruction, not against the oracle's code.
  const nonempty = actual.roots.filter((r) => r.usageVector.some(Boolean));
  assert.equal(actual.patterns.length, nonempty.length);
  for (const root of nonempty) {
    const { pattern } = materializePattern(context, root.cutTree, { rootAxis: root.rootAxis });
    assert.deepEqual(context.types.map((t) => pattern.uso.get(t.index) ?? 0), root.usageVector);
    assert.deepEqual(pattern.placa.restos, root.remnants);
    assert.ok(Math.abs(pattern.area - root.usedArea) < 1e-9);
    const cuts = pattern.placa.cortes;
    assert.equal(cuts.length, root.cutComplexity[0]);
    assert.equal(cuts.reduce((m, c) => Math.max(m, c.nivel), 0), root.cutComplexity[1]);
    assert.ok(Math.abs(cuts.reduce((s, c) => s + c.largo, 0) - root.cutComplexity[2]) < 1e-9);
  }
  assert.ok(actual.stateAudit.every((s) => s.complete && s.cached));
});

test("small K loses only explicitly restricted variants, preserves reachable usages", () => {
  const { context } = H2_FIXTURES[3];
  const small = generatePatterns(context, H2_LIMITS, { maxVariantsPerUsageVector: 1 });
  const large = generatePatterns(context, H2_LIMITS, { maxVariantsPerUsageVector: 100000 });
  assert.equal(small.status, "COMPLETE");
  assert.equal(small.searchRestricted, true);
  assert.ok(small.restrictionReasons.includes("maxVariantsPerUsageVector"));
  assert.ok(small.telemetry.frontierPruned.heuristic > 0);
  assert.equal(small.telemetry.frontierPruned.dominated, 0);
  assert.ok(small.roots.length < large.roots.length);
  for (const axis of ["x", "y"]) assert.deepEqual(usages(small.roots.filter((r) => r.rootAxis === axis)), usages(exhaustiveTinyOracle(context, axis)));
  assert.ok(small.telemetry.cacheHits > 0);
});
test("keeps one- and two-piece patterns for exact three-piece coverage", () => {
  const ctx = H2_FIXTURES[0].context;
  const result = generatePatterns(ctx, H2_LIMITS, { maxVariantsPerUsageVector: 1 });
  assert.deepEqual([...new Set(result.patterns.map((p) => p.uso.get(0)))].sort(), [1, 2]);
  const plan = materializar([result.patterns.find((p) => p.uso.get(0) === 1), result.patterns.find((p) => p.uso.get(0) === 2)], ctx.lines, ctx.opts);
  assert.ok(plan);
  assert.equal(validarPlanIndustrial(plan, 3).ok, true);
});
test("context-local cache cannot leak demand or grain across repeated calls", () => {
  const high = H2_FIXTURES[0].context;
  const low = createContext([{ ...high.lines[0], cant: 1 }], high.opts);
  const a = generatePatterns(high, H2_LIMITS, { maxVariantsPerUsageVector: 2 });
  const b = generatePatterns(low, H2_LIMITS, { maxVariantsPerUsageVector: 2 });
  assert.ok(!usages(b.roots).includes("[2]"));
  assert.ok(a.stateAudit.every((s) => !b.stateAudit.some((other) => s.key === other.key)));
  const rotated = generatePatterns(H2_FIXTURES[6].context, H2_LIMITS, { maxVariantsPerUsageVector: 100 });
  const grain = generatePatterns(H2_FIXTURES[7].context, H2_LIMITS, { maxVariantsPerUsageVector: 100 });
  assert.ok(rotated.patterns.some((p) => p.placa.colocadas.some((c) => c.rotada)));
  assert.ok(grain.patterns.every((p) => p.placa.colocadas.every((c) => !c.rotada)));
  assert.ok(rotated.stateAudit.every((s) => !grain.stateAudit.some((other) => s.key === other.key)));
  assert.equal(generatePatterns(high, H2_LIMITS, { maxVariantsPerUsageVector: 2 }).rootHash, a.rootHash);
});
test("incomplete states are never published as complete cache or infeasibility", () => {
  const ctx = H2_FIXTURES[3].context;
  const stopped = generatePatterns(ctx, { ...H2_LIMITS, maxExpansions: 5 }, { maxVariantsPerUsageVector: 2 });
  assert.equal(stopped.status, "WORK_LIMIT");
  assert.ok(stopped.stateAudit.some((s) => !s.complete));
  assert.ok(stopped.stateAudit.filter((s) => !s.complete).every((s) => !s.cached));
  assert.equal(stopped.telemetry.rootVisits[1].status, "NOT_STARTED");
  assert.equal(stopped.telemetry.used.expansions, 5);
  assert.equal(generatePatterns(ctx, H2_LIMITS, { maxVariantsPerUsageVector: 2 }).status, "COMPLETE");
});
test("AND and frontier limits stop at legal admissions and bounded materialization may finish afterwards", () => {
  const ctx = H2_FIXTURES[3].context;
  for (const [key, value] of [["maxAndCombinations", 5], ["maxFrontierEntries", 2]]) {
    const result = generatePatterns(ctx, { ...H2_LIMITS, [key]: value }, { maxVariantsPerUsageVector: 2 });
    assert.equal(result.status, "WORK_LIMIT");
    assert.equal(result.telemetry.searchStopReason, key);
    assert.equal(result.telemetry.invalid, 0);
  }
  const result = generatePatterns(ctx, { ...H2_LIMITS, maxMaterializations: 1 }, { maxVariantsPerUsageVector: 100 });
  assert.equal(result.status, "WORK_LIMIT");
  assert.equal(result.telemetry.searchComplete, true);
  assert.equal(result.patterns.length, 1);
  assert.equal(result.telemetry.materializations, 1);
});
test("repeated hashes, pools, and work counters are identical", () => {
  const run = () => generatePatterns(H2_FIXTURES[4].context, H2_LIMITS, { maxVariantsPerUsageVector: 2 });
  const a = run(), b = run(), c = run();
  for (const result of [b, c]) {
    assert.equal(result.rootHash, a.rootHash);
    assert.equal(result.patternPoolHash, a.patternPoolHash);
    assert.equal(result.orderedPoolHash, a.orderedPoolHash);
    assert.deepEqual(result.telemetry, a.telemetry);
  }
});
test("exactly sufficient work budgets complete without a false limit hit", () => {
  const ctx = H2_FIXTURES[3].context, options = { maxVariantsPerUsageVector: 2 };
  const baseline = generatePatterns(ctx, H2_LIMITS, options);
  const t = baseline.telemetry;
  const exact = generatePatterns(ctx, { maxExpansions: t.used.expansions, maxAndCombinations: t.used.andCombinations,
    maxFrontierEntries: t.frontierPeak, maxMaterializations: t.materializations }, options);
  assert.equal(exact.status, "COMPLETE");
  assert.deepEqual(exact.telemetry.hits, { maxExpansions: 0, maxAndCombinations: 0, maxFrontierEntries: 0, maxMaterializations: 0 });
  assert.equal(exact.rootHash, baseline.rootHash);
});
test("retained roots can still be materialized after a later expansion stops search", () => {
  const ctx = H2_FIXTURES[3].context, options = { maxVariantsPerUsageVector: 2 };
  const complete = generatePatterns(ctx, H2_LIMITS, options);
  const stopped = generatePatterns(ctx, { ...H2_LIMITS, maxExpansions: complete.telemetry.used.expansions - 1 }, options);
  assert.equal(stopped.status, "WORK_LIMIT");
  assert.equal(stopped.telemetry.searchComplete, false);
  assert.ok(stopped.patterns.length > 0);
  assert.equal(stopped.telemetry.materializations, stopped.roots.filter((r) => r.usageVector.some(Boolean)).length);
});
test("incompatible AND pairs still consume their work admission", () => {
  const result = generatePatterns(H2_FIXTURES[5].context, H2_LIMITS, { maxVariantsPerUsageVector: 100000 });
  assert.ok(result.telemetry.andPairsConsidered > result.telemetry.andPairsAccepted);
  assert.equal(result.telemetry.used.andCombinations, result.telemetry.andPairsConsidered);
});

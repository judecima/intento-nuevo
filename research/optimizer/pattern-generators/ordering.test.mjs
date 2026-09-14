import assert from "node:assert/strict";
import { test } from "node:test";
import { createContext } from "./context.mjs";
import { materializePattern } from "./physical-pattern.mjs";
import { MATERIALIZATION_POLICY, POOL_ORDERING_POLICY, orderMaterializationRoots, orderPatternPool, poolHashes } from "./ordering.mjs";

const context = createContext([
  { base: 40, altura: 60, cant: 3, ref: "A" }, { base: 40, altura: 60, cant: 2, ref: "B" },
], { placaBase: 150, placaAltura: 60, sierra: 5, restoMin: 10, restoMax: 10 });
const root = (usageVector, tag, remnants = [], cutComplexity = [1, 1, 60]) =>
  ({ usageVector, cutTree: { kind: "test-descriptor", tag }, remnants, cutComplexity });

test("policies are explicitly versioned", () => {
  assert.equal(MATERIALIZATION_POLICY, "usage-diversity-v1");
  assert.equal(POOL_ORDERING_POLICY, "b0-v1");
});
test("materialization visits one variant per usage before any second variant", () => {
  const a = root([1, 1], "a"), b = root([1, 1], "b"), c = root([2, 0], "c"), d = root([0, 1], "d");
  assert.deepEqual(orderMaterializationRoots([b, d, a, c], context), [a, c, d, b]);
  assert.deepEqual(orderMaterializationRoots([c, a, d, b], context), [a, c, d, b]);
});
test("same-usage variants rank by commercial remnant then cut complexity then canonical signature", () => {
  const poor = root([1, 0], "poor", [{ w: 10, h: 10 }]);
  const rich = root([1, 0], "rich", [{ w: 50, h: 40 }], [5, 2, 80]);
  const simple = root([1, 0], "simple", [{ w: 50, h: 40 }], [1, 2, 80]);
  assert.deepEqual(orderMaterializationRoots([poor, rich, simple], context), [simple, rich, poor]);
});
test("numeric usage ordering is stable, keeps types separate and does not mutate input", () => {
  const a = root([1, 0], "a"), b = root([0, 1], "b");
  const input = Object.freeze([a, b]);
  assert.deepEqual(orderMaterializationRoots(input, context), [b, a]);
  assert.deepEqual(input, [a, b]);
});
test("invalid summaries and demand vectors fail before ordering", () => {
  for (const r of [root([0, 0], "empty"), root([4, 0], "over"), root([1], "short"),
    root([1, 0], "bad", [], [NaN, 0, 0]), root([1, 0], "bad", [{ w: -1, h: 2 }])]) {
    assert.throws(() => orderMaterializationRoots([r], context));
  }
});
const pattern = (types) => materializePattern(context, { kind: "slice", axis: "x",
  parts: types.map((type) => ({ size: 40, content: { kind: "piece", type } })) }).pattern;
test("Master pool sorting is invariant to materialization order", () => {
  const a = pattern([0]), b = pattern([0, 1]), c = pattern([1]);
  const input = Object.freeze([a, b, c]);
  const ordered = orderPatternPool(input, context);
  assert.equal(ordered[0], b);
  assert.deepEqual(orderPatternPool([c, a, b], context), ordered);
  assert.deepEqual(input, [a, b, c]);
});
test("pool hashes distinguish membership from order and retain duplicates", () => {
  const a = pattern([0]), b = pattern([1]);
  const ab = poolHashes([a, b], context), ba = poolHashes([b, a], context);
  assert.equal(ab.patternPoolHash, ba.patternPoolHash);
  assert.notEqual(ab.orderedPoolHash, ba.orderedPoolHash);
  assert.notEqual(ab.patternPoolHash, poolHashes([a, b, b], context).patternPoolHash);
});
test("canonical pool identity ignores transient IDs and traces, preserves type and physical sequence", () => {
  const a = pattern([0, 1]), clone = structuredClone(a);
  clone.placa.arbol._xmlId = 999;
  clone.placa.colocadas[0].pieza.id = 777;
  clone.placa.colocadas[0]._diagPath = [];
  assert.deepEqual(poolHashes([a], context), poolHashes([clone], context));
  assert.notEqual(poolHashes([a], context).patternPoolHash, poolHashes([pattern([1, 0])], context).patternPoolHash);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { createContext } from "./context.mjs";
import { cutCoordinates } from "./cut-policy.mjs";
import { createWorkBudget } from "./work-budget.mjs";
const budget = (n) => createWorkBudget({ maxExpansions: n, maxAndCombinations: 1, maxFrontierEntries: 1, maxMaterializations: 1 });
const stats = () => ({ coordinateStreams: 0, coordinateProposals: 0, duplicateCoordinates: 0 });
test("merges piece multiples and complements in exact sorted order, charging duplicates", () => {
  const ctx = createContext([{ base: 1, altura: 1, cant: 3 }], { placaBase: 4, placaAltura: 1, sierra: 0.5 });
  const telemetry = stats(), work = budget(100);
  const positions = [...cutCoordinates(ctx, { width: 4000, height: 1000, axis: "x" }, work, telemetry)];
  assert.deepEqual(positions, [1000, 2500, 4000]);
  assert.equal(telemetry.coordinateProposals, 5);
  assert.equal(telemetry.duplicateCoordinates, 2);
  assert.equal(work.snapshot().used.expansions, 6); // one setup plus five proposals
});
test("huge multiplicity stays lazy and stops after the last admitted proposal", () => {
  const ctx = createContext([{ base: 0.001, altura: 1, cant: 1000000000 }], { placaBase: 1000000, placaAltura: 1 });
  const telemetry = stats(), work = budget(4);
  const positions = [...cutCoordinates(ctx, { width: ctx.width, height: ctx.height, axis: "x" }, work, telemetry)];
  assert.deepEqual(positions, [1]); // the second charged proposal duplicates the first
  assert.equal(telemetry.coordinateProposals, 2);
  assert.equal(telemetry.coordinateStreams, 2); // normal and rotated orientation setup
  assert.equal(work.snapshot().used.expansions, 4);
  assert.equal(work.snapshot().searchStopReason, "maxExpansions");
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { generateSubsetPatterns, solvePatternPool } from "./rescue-generator.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(here, "fixtures/4006648-normalized.json"), "utf8"));
const { lines, config } = fixture;

assert.equal(lines.length, 21);
assert.equal(lines.reduce((sum, line) => sum + line.cant, 0), 42);
const totalArea = lines.reduce((sum, line) => sum + line.base * line.altura * line.cant, 0);
assert.equal(Math.ceil(totalArea / (config.placaBase * config.placaAltura) - 1e-9), 9);

// Generate the exact 40 Legacy masks once with the recovered cheaper policy.
const generated = generateSubsetPatterns(lines, config, { maskCount: 40 });
assert.equal(generated.selectedRounds.length, 40);
assert.equal(generated.byRound.get(0)?.length, 12, "full-order round 0 must remain at 12 boards");
assert.deepEqual(generated.diversityOrder, [
  0, 13, 16, 9, 25, 38, 3, 12, 26, 31, 5, 8, 32, 18, 30, 11, 14, 22, 23, 28,
  36, 39, 1, 17, 6, 27, 34, 2, 7, 15, 20, 35, 4, 10, 21, 33, 37, 19, 24, 29,
]);

const expected = new Map([[20, 11], [24, 11], [28, 10], [32, 10], [40, 10]]);
for (const [count, expectedBoards] of expected) {
  const rounds = generated.diversityOrder.slice(0, count);
  const patterns = rounds.flatMap((round) => generated.byRound.get(round) ?? []);
  const solved = solvePatternPool(lines, config, patterns, { incumbentBoards: 12 });
  assert.equal(solved.placas, expectedBoards, `diverse top-${count}`);
  assert.equal(solved.agotado, false, `master exhausted for top-${count}`);
}

console.log(JSON.stringify({
  caseId: fixture.id,
  status: "PASS",
  types: lines.length,
  pieces: lines.reduce((sum, line) => sum + line.cant, 0),
  areaLowerBound: fixture.areaLowerBound,
  legacy40Boards: fixture.legacy40Boards,
  recoveredTopK: Object.fromEntries(expected),
  generationCpuMs: Number(generated.generationCpuMs.toFixed(3)),
}, null, 2));

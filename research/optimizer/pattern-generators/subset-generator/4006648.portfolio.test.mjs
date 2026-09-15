import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PORTFOLIO10_ROUNDS, runPortfolioEscalation } from "./portfolio-escalation.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(here, "fixtures/4006648-canonical-current.json"), "utf8"));
const { lines, config } = fixture;

assert.equal(lines.length, 21);
assert.equal(lines.reduce((sum, line) => sum + line.cant, 0), 42);
assert.deepEqual(lines.map((line) => line.detalle), [
  "12", "3", "15", "7", "8", "11", "2", "20", "5", "4", "16",
  "13", "10", "6", "14", "17", "18", "19", "21", "9", "1",
]);
assert.deepEqual(PORTFOLIO10_ROUNDS, [0, 8, 12, 16, 17, 19, 26, 33, 35, 37]);
assert.equal(PORTFOLIO10_ROUNDS.length, 10);
assert.equal(new Set(PORTFOLIO10_ROUNDS).size, 10);

const result = runPortfolioEscalation(lines, config, { incumbentBoards: fixture.fastBoards });
assert.equal(result.solved.placas, fixture.portfolio10Boards);
assert.equal(result.solved.placas, 10);
assert.equal(result.solved.agotado, false);
assert.ok(result.generatedPatterns > 0);

console.log(JSON.stringify({
  caseId: fixture.id,
  status: "PASS",
  parserOrdering: "current-canonical",
  fastBoards: fixture.fastBoards,
  boards: result.solved.placas,
  rounds: result.rounds,
  masterNodes: result.solved.nodos,
  poolSize: result.solved.poolSize,
  generationCpuMs: Number(result.generationCpuMs.toFixed(3)),
  totalCpuMs: Number(result.totalCpuMs.toFixed(3)),
}, null, 2));

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rankDirectedMasks, runDirectedEscalation } from "./directed-escalation.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(here, "fixtures/4006648-normalized.json"), "utf8"));
const { lines, config } = fixture;

const expectedRounds = [14, 31, 5, 3, 10, 34, 13, 35, 11, 29];
const ranked = rankDirectedMasks(lines, config);
assert.deepEqual(ranked.selectedRounds, expectedRounds);
assert.equal(ranked.selectedRounds.length, 10);
assert.equal(new Set(ranked.selectedRounds).size, 10);

const result = runDirectedEscalation(lines, config);
assert.deepEqual(result.selectedRounds, expectedRounds);
assert.equal(result.solved.placas, 10);
assert.equal(result.solved.agotado, false);
assert.ok(result.rescuePatternCount > 0);

console.log(JSON.stringify({
  caseId: fixture.id,
  status: "PASS",
  baselineBoards: 12,
  boards: result.solved.placas,
  escalatedMasks: result.selectedRounds.length,
  selectedRounds: result.selectedRounds,
  masterNodes: result.solved.nodos,
  poolSize: result.solved.poolSize,
  probeGenerationCpuMs: Number((result.probes.firstGenerationCpuMs + result.probes.secondGenerationCpuMs).toFixed(3)),
  rescueGenerationCpuMs: Number(result.rescueGenerationCpuMs.toFixed(3)),
  totalCpuMs: Number(result.totalCpuMs.toFixed(3)),
}, null, 2));

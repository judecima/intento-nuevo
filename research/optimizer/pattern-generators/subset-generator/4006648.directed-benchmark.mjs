import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateSubsetPatterns, solvePatternPool } from "./rescue-generator.mjs";
import { runDirectedEscalation } from "./directed-escalation.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(here, "fixtures/4006648-normalized.json"), "utf8"));
const { lines, config } = fixture;

const directed = runDirectedEscalation(lines, config);

const rescue28Started = process.cpuUsage();
const rescue28 = generateSubsetPatterns(lines, config, { maskCount: 28 });
const rescue28Solved = solvePatternPool(lines, config, rescue28.patterns, { incumbentBoards: 12 });
const rescue28Cpu = process.cpuUsage(rescue28Started);
const rescue28TotalCpuMs = (rescue28Cpu.user + rescue28Cpu.system) / 1000;

console.log(JSON.stringify({
  caseId: fixture.id,
  directed: {
    boards: directed.solved.placas,
    escalatedMasks: directed.selectedRounds.length,
    selectedRounds: directed.selectedRounds,
    masterNodes: directed.solved.nodos,
    poolSize: directed.solved.poolSize,
    totalCpuMs: Number(directed.totalCpuMs.toFixed(3)),
  },
  rescue28: {
    boards: rescue28Solved.placas,
    masks: 28,
    masterNodes: rescue28Solved.nodos,
    poolSize: rescue28Solved.poolSize,
    totalCpuMs: Number(rescue28TotalCpuMs.toFixed(3)),
  },
  speedup: Number((rescue28TotalCpuMs / directed.totalCpuMs).toFixed(3)),
}, null, 2));

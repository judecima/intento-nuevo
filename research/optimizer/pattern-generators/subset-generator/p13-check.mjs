import { readFileSync } from 'node:fs';
import { generateSubsetPatterns, solvePatternPool } from './rescue-generator.mjs';

export const PORTFOLIO13_ROUNDS = Object.freeze([0, 7, 11, 12, 14, 15, 16, 17, 18, 19, 21, 26, 35]);

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/4006648-canonical-current.json', import.meta.url), 'utf8'),
);

const generated = generateSubsetPatterns(fixture.lines, fixture.config, {
  maskRounds: PORTFOLIO13_ROUNDS,
});
const solved = solvePatternPool(fixture.lines, fixture.config, generated.patterns, {
  incumbentBoards: fixture.fastBoards,
});

console.log({
  rounds: PORTFOLIO13_ROUNDS,
  boards: solved.placas,
  nodes: solved.nodos,
  exhausted: solved.agotado,
  generationCpuMs: generated.generationCpuMs,
});

if (solved.placas !== 10 || solved.agotado) process.exit(2);

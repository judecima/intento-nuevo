import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { generarPatrones, patronesMonotipo, claveVector } = require("../../../../src/lib/optimizer/legacy/patrones.cjs");
const { resolverCobertura } = require("../../../../src/lib/optimizer/legacy/cobertura.cjs");
const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(here, "fixtures/4006648-normalized.json"), "utf8"));
const { lines, config } = fixture;

const started = process.cpuUsage();
const legacyPatterns = generarPatrones(lines, config, 40, 7);
const cpu = process.cpuUsage(started);
const generationCpuMs = (cpu.user + cpu.system) / 1000;

const byVector = new Map();
for (const pattern of [...legacyPatterns, ...patronesMonotipo(lines, config)]) {
  const key = claveVector(pattern.uso);
  const previous = byVector.get(key);
  if (!previous || pattern.area > previous.area) byVector.set(key, pattern);
}
const pool = [...byVector.values()];
const demand = lines.map((line) => line.cant);
const areas = lines.map((line) => line.base * line.altura);
const usableArea = (config.placaBase - config.refiladoX) * (config.placaAltura - config.refiladoY);
const solved = resolverCobertura(pool, demand, usableArea, 12, 20000).resolver(areas);

assert.equal(solved.placas, 10);
assert.equal(solved.agotado, false);
console.log(JSON.stringify({
  caseId: fixture.id,
  status: "PASS",
  boards: solved.placas,
  patterns: legacyPatterns.length,
  poolSize: pool.length,
  nodes: solved.nodos,
  generationCpuMs: Number(generationCpuMs.toFixed(3)),
}, null, 2));

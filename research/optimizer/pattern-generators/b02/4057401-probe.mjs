import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createContext } from "../context.mjs";
import { generatePatterns } from "./and-or.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../../");
const evidence = JSON.parse(readFileSync(resolve(here, "../H4_4057401_PILOT_2026-09-14.json"), "utf8"));
const output = process.argv[2];
const k = Number(process.argv[3] ?? evidence.policy.maxVariantsPerUsageVector);
if (!output) throw new Error("usage: node 4057401-probe.mjs <output.json> [K]");
if (!Number.isSafeInteger(k) || k < 1) throw new RangeError("K must be a positive safe integer");

const input = evidence.inputBinding.input;
const lines = input.pieces.map((p) => ({
  base: p.width, altura: p.height, cant: p.quantity, ref: String(p.reference), veta: Boolean(p.grain),
  cantos: { izq: false, der: false, arr: false, abajo: false },
}));
const config = {
  placaBase: input.board.width, placaAltura: input.board.height,
  sierra: input.kerf, etapas: input.constraints.stages,
  refiladoX: input.trim.x, refiladoY: input.trim.y,
  materialConVeta: Boolean(input.material.hasGrain),
  restoMin: input.constraints.minRemnant,
  restoMax: input.constraints.minCommercialRemnantLongSide,
  material: input.material.code, thickness: input.board.thickness,
};
const context = createContext(lines, config);
const cpu0 = process.cpuUsage(), wall0 = performance.now();
const result = generatePatterns(context, evidence.policy.generatorBudget, { maxVariantsPerUsageVector: k });
const cpu = process.cpuUsage(cpu0);

const require = createRequire(import.meta.url);
const { resolverCobertura } = require(resolve(root, "src/lib/optimizer/legacy/cobertura.cjs"));
const demand = context.types.map((t) => t.quantity);
const areas = context.types.map((t) => t.cutWidth * t.cutHeight / 1e6);
const areaBoard = context.width * context.height / 1e6;
const coverage = resolverCobertura(result.patterns, demand, areaBoard, 99, 20000)?.resolver(areas) ?? null;
const usageVectors = [...new Set(result.patterns.map((p) => JSON.stringify(context.types.map((t) => p.uso.get(t.index) ?? 0))))].sort();

const record = {
  schemaVersion: 1,
  mode: "b02-development-generation-only",
  order: "4057401",
  sourceEvidence: "H4_4057401_PILOT_2026-09-14.json",
  generatorBudget: evidence.policy.generatorBudget,
  maxVariantsPerUsageVector: k,
  cpuMs: (cpu.user + cpu.system) / 1000,
  wallMs: performance.now() - wall0,
  result: {
    status: result.status,
    patternCount: result.patterns.length,
    usageVectors,
    coverage: coverage && { boards: coverage.placas, nodes: coverage.nodos, exhausted: coverage.agotado },
    rootHash: result.rootHash,
    patternPoolHash: result.patternPoolHash,
    orderedPoolHash: result.orderedPoolHash,
    telemetry: result.telemetry,
    failures: result.failures,
  },
};
writeFileSync(resolve(output), JSON.stringify(record, null, 2), { flag: "wx" });
console.log(JSON.stringify({ output: resolve(output), K: k, patterns: record.result.patternCount,
  coverageBoards: record.result.coverage?.boards ?? null, status: record.result.status }));

import { createRequire } from "node:module";
import { createContext } from "../context.mjs";
import { orderPatternPool, poolHashes } from "../ordering.mjs";
import { generateGuideSlicePatterns } from "./generator.mjs";
const require = createRequire(import.meta.url);
const { generarPatrones, patronesMonotipo } = require("../../../../src/lib/optimizer/legacy/patrones.cjs");
const { resolverCobertura } = require("../../../../src/lib/optimizer/legacy/cobertura.cjs");
const { materializar } = require("../../../../src/lib/optimizer/legacy/materializar.cjs");
const { validarPlanIndustrial } = require("../../../../src/lib/optimizer/legacy/validador_industrial_v3.cjs");
const { calidadPlanPlacas } = require("../../../../src/lib/optimizer/legacy/motor.cjs");

const mode = process.argv[2] ?? "guide";
if (!["guide", "legacy"].includes(mode)) throw new Error("mode must be guide|legacy");
const lines = [
  { ref: "1", detalle: "1", cant: 2, base: 1800, altura: 1050, veta: false, cantos: null },
  { ref: "3", detalle: "3", cant: 2, base: 2000, altura: 1100, veta: false, cantos: null },
  { ref: "2", detalle: "2", cant: 1, base: 1900, altura: 1500, veta: false, cantos: null },
  { ref: "4", detalle: "4", cant: 14, base: 744, altura: 450, veta: false, cantos: null },
];
const config = { placaBase: 2742, placaAltura: 1822, refiladoX: 0, refiladoY: 0, sierra: 4.5, etapas: 4,
  materialConVeta: false, descontarCanto: false, cantoEspesor: 0, restoMin: 250, restoMax: 400,
  usarCache: true, maxPiezasCache: 160 };
const cpu = process.cpuUsage(), wall = performance.now();
let patterns, telemetry = null;
if (mode === "guide") ({ patterns, telemetry } = generateGuideSlicePatterns(lines, config));
else patterns = generarPatrones(lines, config, 40, 7).concat(patronesMonotipo(lines, config));
const gen = process.cpuUsage(cpu), generationCPUms = (gen.user + gen.system) / 1000;
const context = createContext(lines, config), ordered = orderPatternPool(patterns, context);
const demand = lines.map((l) => l.cant), areas = lines.map((l) => l.base * l.altura);
const coverage = resolverCobertura(ordered, demand, config.placaBase * config.placaAltura, 6, 20_000,
  { maxNodos: 100_000, watchdogMs: 5_000 }).resolver(areas);
const plan = coverage.plan ? materializar(coverage.plan, lines, config) : null;
const validation = plan ? validarPlanIndustrial(plan, 19) : null;
const quality = plan ? calidadPlanPlacas(plan.placas, config) : null;
console.log(JSON.stringify({ mode, generationCPUms, wallMs: performance.now() - wall, poolSize: ordered.length,
  ...poolHashes(ordered, context), telemetry, coverage: { boards: coverage.placas, nodes: coverage.nodos, exhausted: coverage.agotado,
    vectors: coverage.plan?.map((p) => p.v) ?? [], rootAxes: coverage.plan?.map((p) => p.placa.arbol?.dir ?? null) ?? [] },
  validation, quality: quality && { mayor: quality.mayor, segundo: quality.segundo, fragmentos: quality.fragmentos, total: quality.total } }));

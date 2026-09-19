import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { optimizarLegacyHybrid } = require("../../../../src/lib/optimizer/legacy/rust/rust-hybrid.cjs");

const CASES = [
  {
    order: "4056900",
    config: {
      placaBase: 2740, placaAltura: 1820, refiladoX: 0, refiladoY: 0,
      sierra: 4.4, etapas: 4, materialConVeta: false,
      descontarCanto: false, cantoEspesor: 0, restoMin: 250, restoMax: 400,
      usarCache: true, maxPiezasCache: 160, pases: 2,
      multiVariantes: false, usarRescue: false,
    },
    lines: [
      { ref: "1", detalle: "1", cant: 16, base: 2000, altura: 350, veta: false, cantos: null },
      { ref: "2", detalle: "2", cant: 24, base: 964, altura: 350, veta: false, cantos: null },
      { ref: "4", detalle: "4", cant: 24, base: 564, altura: 350, veta: false, cantos: null },
      { ref: "3", detalle: "3", cant: 30, base: 378, altura: 350, veta: false, cantos: null },
    ],
  },
  {
    order: "4057401",
    config: {
      placaBase: 2742, placaAltura: 1822, refiladoX: 0, refiladoY: 0,
      sierra: 4.5, etapas: 4, materialConVeta: false,
      descontarCanto: false, cantoEspesor: 0, restoMin: 250, restoMax: 400,
      usarCache: true, maxPiezasCache: 160, pases: 2,
      multiVariantes: false, usarRescue: false,
    },
    lines: [
      { ref: "1", detalle: "1", cant: 2, base: 1800, altura: 1050, veta: false, cantos: null },
      { ref: "3", detalle: "3", cant: 2, base: 2000, altura: 1100, veta: false, cantos: null },
      { ref: "2", detalle: "2", cant: 1, base: 1900, altura: 1500, veta: false, cantos: null },
      { ref: "4", detalle: "4", cant: 14, base: 744, altura: 450, veta: false, cantos: null },
    ],
  },
];

function nowMs() {
  return Number(process.hrtime.bigint()) / 1e6;
}
function median(values) {
  const xs = [...values].sort((a,b) => a-b);
  const m = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[m] : (xs[m-1] + xs[m]) / 2;
}
function run(fixture, reuse) {
  const t0 = nowMs();
  const result = optimizarLegacyHybrid(fixture.lines, {
    ...fixture.config,
    usarReusoGreedyBeamRust: reuse,
  });
  return { result, ms: nowMs() - t0 };
}

const samples = Number(process.env.REUSE_BENCH_SAMPLES || 7);
const warmup = Number(process.env.REUSE_BENCH_WARMUP || 2);
const report = [];

for (const fixture of CASES) {
  for (let i = 0; i < warmup; i++) {
    run(fixture, false);
    run(fixture, true);
  }

  const baseline = [];
  const reused = [];
  let lastBaseline = null;
  let lastReused = null;

  for (let i = 0; i < samples; i++) {
    const a = run(fixture, false);
    const b = run(fixture, true);
    baseline.push(a.ms);
    reused.push(b.ms);
    lastBaseline = a.result;
    lastReused = b.result;

    if (a.result.resumen.placas !== b.result.resumen.placas) {
      throw new Error(`board regression ${fixture.order}: ${a.result.resumen.placas} != ${b.result.resumen.placas}`);
    }
    if (JSON.stringify(a.result.placas) !== JSON.stringify(b.result.placas)) {
      throw new Error(`physical-plan regression ${fixture.order}`);
    }
  }

  const baselineMedianMs = median(baseline);
  const reusedMedianMs = median(reused);
  report.push({
    order: fixture.order,
    pieces: fixture.lines.reduce((s, x) => s + x.cant, 0),
    boards: lastReused.resumen.placas,
    samples,
    baselineSamplesMs: baseline.map(x => +x.toFixed(3)),
    reusedSamplesMs: reused.map(x => +x.toFixed(3)),
    baselineMedianMs: +baselineMedianMs.toFixed(3),
    reusedMedianMs: +reusedMedianMs.toFixed(3),
    speedup: +(baselineMedianMs / reusedMedianMs).toFixed(3),
    savingPct: +((1 - reusedMedianMs / baselineMedianMs) * 100).toFixed(2),
    telemetry: lastReused.greedyBeamReuse,
  });
}

console.log(JSON.stringify({ ok: true, benchmark: "greedy-beam-reuse-v1", report }));

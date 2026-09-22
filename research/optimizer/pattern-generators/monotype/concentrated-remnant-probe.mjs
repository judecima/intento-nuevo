import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  optimizar,
  calidadPlanPlacas,
  compararCalidad,
} = require("../../../../src/lib/optimizer/legacy/motor.cjs");
const {
  optimizarV10,
  nuevasMetricas,
  validarPlanIndustrial,
} = require("../../../../src/lib/optimizer/legacy/v10.cjs");

const CASES = [
  {
    id: 5273448,
    board: [2600, 1830],
    saw: 4.5,
    qty: 68,
    piece: [300, 200],
    leptonBoards: 1,
  },
  {
    id: 5326719,
    board: [2750, 1830],
    saw: 4.4,
    qty: 12,
    piece: [644, 560],
    leptonBoards: 1,
  },
];

function cfg(c) {
  return {
    placaBase: c.board[0],
    placaAltura: c.board[1],
    refiladoX: 0,
    refiladoY: 0,
    sierra: c.saw,
    etapas: 4,
    materialConVeta: false,
    descontarCanto: false,
    cantoEspesor: 0,
    restoMin: 250,
    restoMax: 400,
    usarOneBoard: true,
    usarMaster: true,
    usarMultiSlice: true,
    usarCompactacion: true,
    usarCache: false,
    maxPiezasCache: 0,
    minPiezasMultiSliceExperimental: 200,
    masterIndustrialRulesV3Experimental: true,
  };
}

function quality(plan, config) {
  return calidadPlanPlacas(plan?.placas || [], plan?.opts || config);
}

function better(a, b, config) {
  if (!a) return b;
  if (!b) return a;
  if (b.resumen.placas < a.resumen.placas) return b;
  if (a.resumen.placas < b.resumen.placas) return a;
  return compararCalidad(quality(b, config), quality(a, config)) > 0 ? b : a;
}

function timed(fn) {
  const cpu0 = process.cpuUsage();
  const t0 = process.hrtime.bigint();
  const value = fn();
  const cpu = process.cpuUsage(cpu0);
  return {
    value,
    wallMs: Number(process.hrtime.bigint() - t0) / 1e6,
    cpuMs: (cpu.user + cpu.system) / 1000,
  };
}

function linesFor(c) {
  return [{
    base: c.piece[0],
    altura: c.piece[1],
    cant: c.qty,
    veta: false,
    canRotate: true,
    ref: 1,
    detalle: "MONOTYPE",
    cantos: null,
  }];
}

function runSweep(lines, config, overrides = {}) {
  let best = null;
  const runs = [];
  for (const etapas of [2, 3, 4]) {
    const run = timed(() => optimizar(lines, {
      ...config,
      preferirMenorProfundidad: false,
      etapas,
      ...overrides,
    }));
    best = better(best, run.value, config);
    runs.push({
      etapas,
      boards: run.value.resumen.placas,
      quality: quality(run.value, config),
      wallMs: run.wallMs,
      cpuMs: run.cpuMs,
    });
  }
  return { best, runs };
}

for (const c of CASES) {
  const lines = linesFor(c);
  const config = cfg(c);
  const expected = c.qty;

  const refRun = timed(() => optimizarV10(lines, config, nuevasMetricas()));
  const reference = refRun.value.plan;
  const referenceQuality = quality(reference, config);

  const depthOffRun = timed(() => optimizar(lines, {
    ...config,
    preferirMenorProfundidad: false,
  }));

  const sweep = runSweep(lines, config);
  const cheapSweep = runSweep(lines, config, {
    ruido: 0.3,
    pases: 2,
    restartsPorPlaca: 2,
    usarRescue: false,
    maxPiezasBeam: 0,
    multiVariantes: false,
  });

  const variants = [
    ["depthOff", depthOffRun.value, depthOffRun.wallMs],
    ["stageSweep", sweep.best, sweep.runs.reduce((s, r) => s + r.wallMs, 0)],
    ["cheapStageSweep", cheapSweep.best, cheapSweep.runs.reduce((s, r) => s + r.wallMs, 0)],
  ].map(([name, plan, wallMs]) => {
    const q = quality(plan, config);
    const validation = validarPlanIndustrial(plan, expected);
    return {
      name,
      boards: plan.resumen.placas,
      quality: q,
      qualityCmpVsV3: plan.resumen.placas === reference.resumen.placas
        ? compararCalidad(q, referenceQuality)
        : null,
      valid: Boolean(validation?.ok),
      wallMs,
    };
  });

  console.log("MONOTYPE_PROBE " + JSON.stringify({
    id: c.id,
    geometry: c,
    reference: {
      boards: reference.resumen.placas,
      quality: referenceQuality,
      wallMs: refRun.wallMs,
      cpuMs: refRun.cpuMs,
      valid: Boolean(validarPlanIndustrial(reference, expected)?.ok),
    },
    variants,
    sweepRuns: sweep.runs,
    cheapSweepRuns: cheapSweep.runs,
  }));
}

#!/usr/bin/env node
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { optimizarV10, nuevasMetricas, nuevaTelemetriaStep0, validarPlanIndustrial } = require('../src/lib/optimizer/legacy/v10.cjs');
const { resolverCobertura } = require('../src/lib/optimizer/legacy/cobertura.cjs');

const lines = [
  { ref:'A', detalle:'A', cant:2, base:300, altura:300, veta:false },
  { ref:'B', detalle:'B', cant:1, base:200, altura:200, veta:false },
];
const cfg = {
  placaBase:1000, placaAltura:1000, refiladoX:0, refiladoY:0,
  sierra:5, etapas:4, materialConVeta:false, descontarCanto:false,
  cantoEspesor:0, restoMin:100, restoMax:250, semilla:20260812,
  usarMultiSlice:false, usarOneBoard:false, usarMaster:false,
  usarCompactacion:false, instrumentarStep0:true,
};
const metrics = nuevasMetricas();
const run = optimizarV10(lines, cfg, metrics);
if (!validarPlanIndustrial(run.plan, 3).ok) throw new Error('Step0 synthetic plan invalid');
const s = run.metricas.step0;
if (!s || s.composition.optimizarCalls < 1 || s.composition.armarPlacasCalls < 1 || s.composition.stageCalls < 1)
  throw new Error('Step0 composition counters were not populated');

const telemetry = nuevaTelemetriaStep0();
const pattern = { uso:[[0,1]], area:1, placa:{} };
const handle = resolverCobertura([pattern], [2], 1, 3, 1000, { telemetry });
const solved = handle.resolver([1]);
if (solved.placas !== 2 || !solved.plan || solved.plan.length !== 2 || solved.agotado)
  throw new Error('Step0 coverage smoke solved an unexpected plan');
if (telemetry.master.runs !== 1 || telemetry.master.nodesTotal !== 2 || telemetry.master.timeoutHits !== 0)
  throw new Error(`Step0 Master telemetry unexpected: ${JSON.stringify(telemetry.master)}`);

console.log(JSON.stringify({ composition:s.composition, master:telemetry.master }, null, 2));
console.log('STEP0 SYNTHETIC SMOKE OK');

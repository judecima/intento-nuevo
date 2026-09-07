#!/usr/bin/env node
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { optimizarV10, validarPlanIndustrial } = require('../src/lib/optimizer/legacy/v10.cjs');
const lines = [
  { ref:'A', detalle:'A', cant:2, base:420, altura:380, veta:false },
  { ref:'B', detalle:'B', cant:1, base:510, altura:300, veta:false },
  { ref:'C', detalle:'C', cant:2, base:280, altura:240, veta:false },
];
const pieces = lines.reduce((n,l)=>n+l.cant,0);
const config = {
  placaBase:1000, placaAltura:1000, refiladoX:0, refiladoY:0,
  sierra:5, etapas:4, materialConVeta:false, descontarCanto:false,
  cantoEspesor:0, restoMin:100, restoMax:250, semilla:20260812,
  usarCotaBarataAntesCompactacion:true,
  usarMultiSlice:false, usarOneBoard:false, usarMaster:false,
};
const r = optimizarV10(lines, config);
const v = validarPlanIndustrial(r.plan, pieces);
const m = r.metricas.remnantPolish;
console.log(JSON.stringify({ placas:r.plan.resumen.placas, valid:v.ok, polish:m }, null, 2));
if (!v.ok || m.runs !== 1 || m.valid !== 1 || m.invalidFinal !== 0 || m.errors !== 0)
  throw new Error('V20 safe runtime wiring failed');
console.log('V20 SAFE RUNTIME SMOKE OK');

#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
function arg(name, fallback = null) {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback;
}

const input = arg('--input', 'experiencia/v6/hotspot-all.jsonl');
const resolved = path.resolve(process.cwd(), input);
if (!fs.existsSync(resolved)) {
  console.error(`No existe: ${resolved}`);
  process.exit(2);
}

const rows = fs.readFileSync(resolved, 'utf8')
  .split(/\r?\n/)
  .map((x) => x.trim())
  .filter(Boolean)
  .map((line, i) => {
    try { return JSON.parse(line); }
    catch (e) { throw new Error(`JSON invalido en linea ${i + 1}: ${e.message}`); }
  });

const valid = rows.filter((r) => r && r.ok && !r.engineCacheHit);
const num = (v) => Number.isFinite(+v) ? +v : 0;
const sum = (xs, f) => xs.reduce((a, x) => a + num(f(x)), 0);
const pct = (a, b) => b ? (100 * a / b) : 0;
const fmt = (v) => Math.round(v).toLocaleString('en-US');
const fmtPct = (v) => `${v.toFixed(1)}%`;

function quantile(values, q) {
  const a = values.map(num).sort((x, y) => x - y);
  if (!a.length) return 0;
  const pos = (a.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  if (lo === hi) return a[lo];
  const t = pos - lo;
  return a[lo] * (1 - t) + a[hi] * t;
}

function stage(row, key) { return num(row.stageMs?.[key]); }
function boardWins(row, key) { return num(row.metricas?.[key]?.placasAhorradas); }
function activations(row, key) { return num(row.metricas?.[key]?.activaciones); }

/*
 * Oportunidad EXACTA de certificar inmediatamente despues del baseline usando
 * solo lo que el JSONL historico ya registra:
 *
 * - el resultado final esta en la cota;
 * - MultiSlice no llego a ejecutarse;
 * - compactacion no ahorro placas (si se ejecuto, solo pudo cambiar calidad).
 *
 * Bajo esas condiciones, baseline tenia el mismo numero de placas que el plan
 * final y por lo tanto baseline == LB. No inferimos esto en casos donde una
 * etapa posterior pudo haber reducido placas.
 */
function baselineCertifiedProxy(r) {
  return num(r.boards) === num(r.cota) &&
    num(r.optimizarCalls?.multislice) === 0 &&
    boardWins(r, 'compactacion') === 0;
}

const baselineCertified = valid.filter(baselineCertifiedProxy);
const baselineCertifiedWithCompact = baselineCertified.filter((r) => activations(r, 'compactacion') > 0);

const totals = {
  total: sum(valid, (r) => r.totalMs),
  baseline: sum(valid, (r) => stage(r, 'baseline')),
  compactacion: sum(valid, (r) => stage(r, 'compactacion')),
  multislice: sum(valid, (r) => stage(r, 'multislice')),
  oneboard: sum(valid, (r) => stage(r, 'oneboard')),
  master: sum(valid, (r) => r.masterMs),
};

const avoidableCompactMs = sum(baselineCertifiedWithCompact, (r) => stage(r, 'compactacion'));
const compactBoardWins = valid.filter((r) => boardWins(r, 'compactacion') > 0);
const multiBoardWins = valid.filter((r) => boardWins(r, 'multislice') > 0);
const masterBoardWins = valid.filter((r) => boardWins(r, 'master') > 0);

function heavySlice(q) {
  const cut = quantile(valid.map((r) => r.totalMs), q);
  const xs = valid.filter((r) => num(r.totalMs) >= cut);
  const total = sum(xs, (r) => r.totalMs);
  return {
    q,
    cut,
    n: xs.length,
    total,
    baseline: sum(xs, (r) => stage(r, 'baseline')),
    compactacion: sum(xs, (r) => stage(r, 'compactacion')),
    multislice: sum(xs, (r) => stage(r, 'multislice')),
    master: sum(xs, (r) => r.masterMs),
  };
}

const heavy = [0.50, 0.95, 0.99].map(heavySlice);

console.log(`INPUT ${input}`);
console.log(`CASOS ${valid.length} validos sin cache (${rows.length} filas totales)`);
console.log('');
console.log('DISTRIBUCION totalMs');
for (const q of [0.50, 0.90, 0.95, 0.99])
  console.log(`  p${Math.round(q * 100)} ${fmt(quantile(valid.map((r) => r.totalMs), q))} ms`);

console.log('');
console.log('TIEMPO ACUMULADO POR ETAPA');
for (const [k, v] of Object.entries(totals)) {
  if (k === 'total') continue;
  console.log(`  ${k.padEnd(14)} ${fmt(v)} ms  (${fmtPct(pct(v, totals.total))} del total observado)`);
}

console.log('');
console.log('CERTIFICACION INMEDIATA DESPUES DE BASELINE (proxy exacto con JSONL existente)');
console.log(`  casos certificables       ${baselineCertified.length}/${valid.length} (${fmtPct(pct(baselineCertified.length, valid.length))})`);
console.log(`  pagaron compactacion      ${baselineCertifiedWithCompact.length}`);
console.log(`  compactacion evitable     ${fmt(avoidableCompactMs)} ms acumulados`);
if (baselineCertifiedWithCompact.length) {
  console.log(`  ahorro medio por afectado ${fmt(avoidableCompactMs / baselineCertifiedWithCompact.length)} ms`);
  console.log(`  p95 compactacion evitable ${fmt(quantile(baselineCertifiedWithCompact.map((r) => stage(r, 'compactacion')), .95))} ms`);
}

console.log('');
console.log('ETAPAS QUE SI AHORRAN PLACAS (no se pueden retirar a ciegas)');
console.log(`  compactacion ${compactBoardWins.length} casos, ${sum(compactBoardWins, (r) => boardWins(r, 'compactacion'))} placas`);
console.log(`  multislice   ${multiBoardWins.length} casos, ${sum(multiBoardWins, (r) => boardWins(r, 'multislice'))} placas`);
console.log(`  master       ${masterBoardWins.length} casos, ${sum(masterBoardWins, (r) => boardWins(r, 'master'))} placas`);

console.log('');
console.log('COLA: PARTICIPACION POR ETAPA');
for (const h of heavy) {
  const label = `>=p${Math.round(h.q * 100)}`;
  console.log(`  ${label} (${h.n} casos, corte ${fmt(h.cut)} ms)`);
  console.log(`    baseline     ${fmtPct(pct(h.baseline, h.total))}`);
  console.log(`    compactacion ${fmtPct(pct(h.compactacion, h.total))}`);
  console.log(`    multislice   ${fmtPct(pct(h.multislice, h.total))}`);
  console.log(`    master       ${fmtPct(pct(h.master, h.total))}`);
}

console.log('');
console.log('TOP compactacion evitable si baseline ya certifica');
for (const r of [...baselineCertifiedWithCompact]
  .sort((a, b) => stage(b, 'compactacion') - stage(a, 'compactacion'))
  .slice(0, 15)) {
  console.log(`  ${String(r.file).padEnd(62)} ${fmt(stage(r, 'compactacion'))} ms  boards=${r.boards} lb=${r.cota}`);
}

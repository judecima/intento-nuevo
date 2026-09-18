import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";

import { generarPatronesLegacyRustHybrid } from "./legacy-outer-adapter.mjs";

const require = createRequire(import.meta.url);
const { generarPatrones } = require("../../../../src/lib/optimizer/legacy/patrones.cjs");

const lines = [
  { ref: "1", detalle: "1", cant: 2, base: 1800, altura: 1050, veta: false },
  { ref: "3", detalle: "3", cant: 2, base: 2000, altura: 1100, veta: false },
  { ref: "2", detalle: "2", cant: 1, base: 1900, altura: 1500, veta: false },
  { ref: "4", detalle: "4", cant: 14, base: 744, altura: 450, veta: false },
];

const config = {
  placaBase: 2742,
  placaAltura: 1822,
  refiladoX: 0,
  refiladoY: 0,
  sierra: 4.5,
  etapas: 4,
  materialConVeta: false,
  descontarCanto: false,
  cantoEspesor: 0,
  restoMin: 250,
  restoMax: 400,
  multiVariantes: false,
  trazaDiag: false,
};

const rounds = Number(process.env.LEGACY_RUST_BENCH_ROUNDS || 40);
const samples = Math.max(3, Number(process.env.LEGACY_RUST_BENCH_SAMPLES || 3));
const warmupRounds = Math.max(1, Math.min(rounds, Number(process.env.LEGACY_RUST_BENCH_WARMUP_ROUNDS || 4)));
const minSpeedup = Number(process.env.LEGACY_RUST_MIN_SPEEDUP || 1.05);

function normalize(pool) {
  return pool.map((pattern) => ({
    usage: [...pattern.uso.entries()].sort((a, b) => a[0] - b[0]),
    area: pattern.area,
    pieces: pattern.placa.colocadas
      .map((placement) => ({
        ref: placement.pieza.ref,
        x: placement.x,
        y: placement.y,
        base: placement.base,
        altura: placement.altura,
        rotada: Boolean(placement.rotada),
        nivel: placement.nivel,
      }))
      .sort((a, b) =>
        String(a.ref).localeCompare(String(b.ref)) ||
        a.x - b.x || a.y - b.y || a.base - b.base || a.altura - b.altura
      ),
    cuts: pattern.placa.cortes.map((cut) => ({
      x1: cut.x1, y1: cut.y1, x2: cut.x2, y2: cut.y2,
      nivel: cut.nivel, largo: cut.largo, terminal: Boolean(cut.terminal),
    })),
    remnants: pattern.placa.restos.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h })),
  })).sort((a, b) => JSON.stringify(a.usage).localeCompare(JSON.stringify(b.usage)));
}

function measure(fn) {
  const start = performance.now();
  const value = fn();
  return { value, ms: performance.now() - start };
}

function median(values) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.floor(ordered.length / 2)];
}

function legacyRun(runRounds = rounds) {
  return generarPatrones(lines, config, runRounds, 7);
}

function rustRun(runRounds = rounds) {
  return generarPatronesLegacyRustHybrid(lines, config, runRounds, 7);
}

// Warm both implementations before measuring to reduce JIT/addon-load/order bias.
legacyRun(warmupRounds);
rustRun(warmupRounds);

const legacySamples = [];
const rustSamples = [];
let canonical = null;
let patternCount = null;

for (let sample = 0; sample < samples; sample++) {
  const order = sample % 2 === 0 ? ["legacy", "rust"] : ["rust", "legacy"];
  let legacy;
  let rust;

  for (const engine of order) {
    if (engine === "legacy") {
      const measured = measure(() => legacyRun());
      legacy = measured.value;
      legacySamples.push(measured.ms);
    } else {
      const measured = measure(() => rustRun());
      rust = measured.value;
      rustSamples.push(measured.ms);
    }
  }

  const left = JSON.stringify(normalize(legacy));
  const right = JSON.stringify(normalize(rust));
  if (left !== right) {
    console.error(JSON.stringify({
      ok: false,
      reason: "parity",
      sample,
      rounds,
      legacyPatterns: legacy.length,
      rustPatterns: rust.length,
      legacySamples,
      rustSamples,
    }));
    process.exit(1);
  }

  if (canonical == null) {
    canonical = left;
    patternCount = legacy.length;
  } else if (left !== canonical) {
    console.error(JSON.stringify({
      ok: false,
      reason: "nondeterministic-output",
      sample,
      rounds,
    }));
    process.exit(1);
  }
}

const legacyMedianMs = median(legacySamples);
const rustMedianMs = median(rustSamples);
const speedup = legacyMedianMs / rustMedianMs;
const savingPct = (1 - rustMedianMs / legacyMedianMs) * 100;

const result = {
  ok: speedup >= minSpeedup,
  order: "4057401",
  rounds,
  samples,
  warmupRounds,
  patterns: patternCount,
  parity: true,
  deterministic: true,
  legacySamplesMs: legacySamples.map((value) => Number(value.toFixed(3))),
  rustSamplesMs: rustSamples.map((value) => Number(value.toFixed(3))),
  legacyMedianMs: Number(legacyMedianMs.toFixed(3)),
  rustMedianMs: Number(rustMedianMs.toFixed(3)),
  speedup: Number(speedup.toFixed(3)),
  savingPct: Number(savingPct.toFixed(2)),
  minSpeedup,
};

console.log(JSON.stringify(result));
if (!result.ok) process.exit(1);

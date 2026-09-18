"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const {
  medidaCorte,
  orientaciones,
  hashTexto,
} = require("../../../../src/lib/optimizer/legacy/motor.cjs");
const {
  packBoardLegacyRustBatch,
} = require("../../../../src/lib/optimizer/legacy/rust/rust-packer.cjs");

const IDS = ["4050594", "4056900", "4057401", "4059200"];
const FIXTURE_DIR = path.join(__dirname, "family-pool-index-fixtures");
const REPEATS = Number(process.env.FAMILY_POOL_BENCH_REPEATS || 10);

function fixtureToLegacy(input) {
  const opts = {
    placaBase: input.board.width,
    placaAltura: input.board.height,
    refiladoX: input.trim?.x || 0,
    refiladoY: input.trim?.y || 0,
    sierra: input.kerf,
    etapas: input.constraints?.stages || 4,
    materialConVeta: Boolean(input.material?.hasGrain),
    descontarCanto: false,
    cantoEspesor: 0,
    ruido: 0.3,
    restoMin: input.constraints?.minRemnant || 250,
    restoMax: input.constraints?.minCommercialRemnantLongSide || 400,
    tolerancia: 0.02,
    anchoUtil: input.board.width - (input.trim?.x || 0),
    altoUtil: input.board.height - (input.trim?.y || 0),
    contraerRebanadaReal: true,
    multiRebanada: false,
    penalizarFranjaMuerta: false,
    deltasEstructurales: [],
  };

  const pieces = [];
  let id = 0;
  input.pieces.forEach((line, ref) => {
    for (let count = 0; count < line.quantity; count++) {
      const piece = {
        id: id++,
        base: Number(line.width),
        altura: Number(line.height),
        detalle: line.description || line.reference || "",
        veta: Boolean(line.grain),
        cantos: null,
        ref,
      };
      piece._corte = medidaCorte(piece, opts);
      piece._ors = orientaciones(piece, opts.materialConVeta);
      pieces.push(piece);
    }
  });

  const sigs = new Map();
  for (const piece of pieces) {
    const key = piece._corte.base + "|" + piece._corte.altura + "|" + (piece.veta ? 1 : 0);
    if (!sigs.has(key)) sigs.set(key, sigs.size);
    piece._sig = sigs.get(key);
  }
  return { pieces, opts, types: sigs.size };
}

function configs(opts) {
  const symmetric = ["perp", "exacta", "area", "largo"];
  const crossed = [["largo", "perp"], ["perp", "area"], ["area", "perp"], ["largo", "area"]];
  const all = [];
  for (const criterion of symmetric) {
    for (const dirInicial of ["y", "x"]) {
      all.push({ criterios: [criterion, criterion], criterio: criterion, dirInicial, ruido: 0 });
      all.push({ criterios: [criterion, criterion], criterio: criterion, dirInicial, ruido: opts.ruido });
    }
  }
  for (const [c1, c2] of crossed) {
    for (const dirInicial of ["y", "x"]) {
      all.push({ criterios: [c1, c2], criterio: c1, dirInicial, ruido: 0 });
    }
  }
  for (const cfg of all) {
    cfg._id = hashTexto(cfg.criterios.join(">") + "|" + cfg.dirInicial + "|" + (cfg.ruido > 0 ? "rnd" : "det"));
  }
  const dead = new Set([
    "exacta>exacta|y|det",
    "exacta>exacta|x|det",
    "largo>largo|y|det",
    "perp>area|y|det",
    "perp>area|x|det",
  ]);
  return all.filter((cfg) => {
    const name = cfg.criterios.join(">") + "|" + cfg.dirInicial + "|" + (cfg.ruido > 0 ? "rnd" : "det");
    return !dead.has(name);
  });
}

function mix(...nums) {
  let h = 2166136261 >>> 0;
  for (const n of nums) {
    h ^= n >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 2654435761) >>> 0;
  }
  return h >>> 0;
}

function requests(base, indexed, pass, prune = false) {
  return configs(base).map((cfg, index) => ({
    opts: {
      ...base,
      ...cfg,
      rustFamilyPoolIndex: indexed,
      rustFamilyFitPrune: prune,
    },
    randomSeed: cfg.ruido > 0 ? mix(20260812, pass, cfg._id, index, 0) : null,
  }));
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function timed(pool, reqs) {
  const cpu0 = process.cpuUsage();
  const wall0 = performance.now();
  const output = packBoardLegacyRustBatch(pool, reqs);
  const wallMs = performance.now() - wall0;
  const cpu = process.cpuUsage(cpu0);
  return {
    output,
    wallMs,
    cpuMs: (cpu.user + cpu.system) / 1000,
    digest: digest(output),
  };
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
}

function stats(values) {
  return {
    n: values.length,
    total: values.reduce((a, b) => a + b, 0),
    mean: values.reduce((a, b) => a + b, 0) / values.length,
    p50: percentile(values, 0.50),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    max: Math.max(...values),
  };
}

const orderings = [
  (a, b) => b.base * b.altura - a.base * a.altura,
  (a, b) => Math.max(b.base, b.altura) - Math.max(a.base, a.altura),
  (a, b) => b.altura - a.altura || b.base - a.base,
  (a, b) => b.base - a.base || b.altura - a.altura,
];

const wallOld = [], wallIndexed = [], wallPruned = [], cpuOld = [], cpuIndexed = [], cpuPruned = [];
const workloads = [];

for (const id of IDS) {
  const input = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, id + ".json"), "utf8"));
  const { pieces, opts, types } = fixtureToLegacy(input);

  for (let pass = 0; pass < orderings.length; pass++) {
    const pool = pieces.slice().sort(orderings[pass]);
    const oldReqs = requests(opts, false, pass, false);
    const indexedReqs = requests(opts, true, pass, false);
    const prunedReqs = requests(opts, true, pass, true);

    // Warm all implementations before samples.
    const warmOld = timed(pool, oldReqs);
    const warmIndexed = timed(pool, indexedReqs);
    const warmPruned = timed(pool, prunedReqs);
    if (warmOld.digest !== warmIndexed.digest || warmOld.digest !== warmPruned.digest) {
      throw new Error(`warm parity mismatch ${id} pass=${pass}`);
    }

    const row = { id, pass, pieces: pool.length, types, samples: [] };
    for (let repeat = 0; repeat < REPEATS; repeat++) {
      const variants = [
        ["legacy", oldReqs],
        ["indexed", indexedReqs],
        ["pruned", prunedReqs],
      ];
      const shift = repeat % variants.length;
      const ordered = variants.slice(shift).concat(variants.slice(0, shift));
      const measured = {};
      for (const [name, reqs] of ordered) measured[name] = timed(pool, reqs);
      const old = measured.legacy;
      const indexed = measured.indexed;
      const pruned = measured.pruned;

      if (old.digest !== indexed.digest || old.digest !== pruned.digest) {
        throw new Error(`parity mismatch ${id} pass=${pass} repeat=${repeat}`);
      }

      wallOld.push(old.wallMs);
      wallIndexed.push(indexed.wallMs);
      wallPruned.push(pruned.wallMs);
      cpuOld.push(old.cpuMs);
      cpuIndexed.push(indexed.cpuMs);
      cpuPruned.push(pruned.cpuMs);
      row.samples.push({
        repeat,
        oldWallMs: old.wallMs,
        indexedWallMs: indexed.wallMs,
        prunedWallMs: pruned.wallMs,
        oldCpuMs: old.cpuMs,
        indexedCpuMs: indexed.cpuMs,
        prunedCpuMs: pruned.cpuMs,
      });
    }
    workloads.push(row);
  }
}

const oldWall = stats(wallOld);
const newWall = stats(wallIndexed);
const oldCpu = stats(cpuOld);
const newCpu = stats(cpuIndexed);
const prunedWall = stats(wallPruned);
const prunedCpu = stats(cpuPruned);
const result = {
  operation: "rust-family-pool-index-benchmark",
  repeatsPerWorkload: REPEATS,
  workloadCount: workloads.length,
  sampleCount: wallOld.length,
  exactOutputParity: true,
  wall: {
    legacy: oldWall,
    indexed: newWall,
    indexedPlusFitPrune: prunedWall,
    indexedReductionPct: (1 - newWall.total / oldWall.total) * 100,
    indexedSpeedup: oldWall.total / newWall.total,
    prunedReductionPct: (1 - prunedWall.total / oldWall.total) * 100,
    prunedSpeedup: oldWall.total / prunedWall.total,
  },
  cpu: {
    legacy: oldCpu,
    indexed: newCpu,
    indexedPlusFitPrune: prunedCpu,
    indexedReductionPct: (1 - newCpu.total / oldCpu.total) * 100,
    indexedSpeedup: oldCpu.total / newCpu.total,
    prunedReductionPct: (1 - prunedCpu.total / oldCpu.total) * 100,
    prunedSpeedup: oldCpu.total / prunedCpu.total,
  },
  byFixture: IDS.map((id) => {
    const samples = workloads.filter((x) => x.id === id).flatMap((x) => x.samples);
    const old = samples.map((x) => x.oldWallMs);
    const indexed = samples.map((x) => x.indexedWallMs);
    const pruned = samples.map((x) => x.prunedWallMs);
    return {
      id,
      n: samples.length,
      legacyWall: stats(old),
      indexedWall: stats(indexed),
      prunedWall: stats(pruned),
      indexedReductionPct: (1 - indexed.reduce((a,b)=>a+b,0) / old.reduce((a,b)=>a+b,0)) * 100,
      prunedReductionPct: (1 - pruned.reduce((a,b)=>a+b,0) / old.reduce((a,b)=>a+b,0)) * 100,
    };
  }),
};

console.log(JSON.stringify(result, null, 2));

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

function requests(base, indexed, pass) {
  return configs(base).map((cfg, index) => ({
    opts: {
      ...base,
      ...cfg,
      rustFamilyPoolIndex: indexed,
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

const wallOld = [], wallIndexed = [], cpuOld = [], cpuIndexed = [];
const workloads = [];

for (const id of IDS) {
  const input = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, id + ".json"), "utf8"));
  const { pieces, opts, types } = fixtureToLegacy(input);

  for (let pass = 0; pass < orderings.length; pass++) {
    const pool = pieces.slice().sort(orderings[pass]);
    const oldReqs = requests(opts, false, pass);
    const indexedReqs = requests(opts, true, pass);

    // Warm both implementations before samples.
    const warmOld = timed(pool, oldReqs);
    const warmIndexed = timed(pool, indexedReqs);
    if (warmOld.digest !== warmIndexed.digest) {
      throw new Error(`warm parity mismatch ${id} pass=${pass}`);
    }

    const row = { id, pass, pieces: pool.length, types, samples: [] };
    for (let repeat = 0; repeat < REPEATS; repeat++) {
      const indexedFirst = repeat % 2 === 1;
      const first = timed(pool, indexedFirst ? indexedReqs : oldReqs);
      const second = timed(pool, indexedFirst ? oldReqs : indexedReqs);
      const old = indexedFirst ? second : first;
      const indexed = indexedFirst ? first : second;

      if (old.digest !== indexed.digest) {
        throw new Error(`parity mismatch ${id} pass=${pass} repeat=${repeat}`);
      }

      wallOld.push(old.wallMs);
      wallIndexed.push(indexed.wallMs);
      cpuOld.push(old.cpuMs);
      cpuIndexed.push(indexed.cpuMs);
      row.samples.push({
        repeat,
        oldWallMs: old.wallMs,
        indexedWallMs: indexed.wallMs,
        oldCpuMs: old.cpuMs,
        indexedCpuMs: indexed.cpuMs,
      });
    }
    workloads.push(row);
  }
}

const oldWall = stats(wallOld);
const newWall = stats(wallIndexed);
const oldCpu = stats(cpuOld);
const newCpu = stats(cpuIndexed);
const result = {
  operation: "rust-family-pool-index-benchmark",
  repeatsPerWorkload: REPEATS,
  workloadCount: workloads.length,
  sampleCount: wallOld.length,
  exactOutputParity: true,
  wall: {
    legacy: oldWall,
    indexed: newWall,
    aggregateReductionPct: (1 - newWall.total / oldWall.total) * 100,
    aggregateSpeedup: oldWall.total / newWall.total,
  },
  cpu: {
    legacy: oldCpu,
    indexed: newCpu,
    aggregateReductionPct: (1 - newCpu.total / oldCpu.total) * 100,
    aggregateSpeedup: oldCpu.total / newCpu.total,
  },
  byFixture: IDS.map((id) => {
    const samples = workloads.filter((x) => x.id === id).flatMap((x) => x.samples);
    const old = samples.map((x) => x.oldWallMs);
    const indexed = samples.map((x) => x.indexedWallMs);
    return {
      id,
      n: samples.length,
      legacyWall: stats(old),
      indexedWall: stats(indexed),
      reductionPct: (1 - indexed.reduce((a,b)=>a+b,0) / old.reduce((a,b)=>a+b,0)) * 100,
    };
  }),
};

console.log(JSON.stringify(result, null, 2));

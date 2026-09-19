import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const fixtures = require("./beam-tail-fixtures.cjs");
const { generarPatronesLegacyRustHybrid } = require("../../../../src/lib/optimizer/legacy/rust/rust-patrones.cjs");

function nowMs() { return Number(process.hrtime.bigint()) / 1e6; }

function normalizePattern(pattern) {
  return {
    usage: [...pattern.uso.entries()].sort((a,b) => a[0]-b[0]),
    area: pattern.area,
    board: pattern.placa,
  };
}

function run(fixture, reuse) {
  const options = {
    ...fixture.config,
    usarReusoGreedyBeamRust: reuse,
    usarMascarasUnicasMasterLe4: false,
  };
  const t0 = nowMs();
  const pool = generarPatronesLegacyRustHybrid(fixture.lines, options, 40, 7);
  return {
    ms: nowMs() - t0,
    pool: pool.map(normalizePattern),
    telemetry: options._greedyBeamReuseTelemetry ?? null,
  };
}

const report = [];
for (const fixture of fixtures) {
  const baseline = run(fixture, false);
  const reused = run(fixture, true);
  const parity = JSON.stringify(baseline.pool) === JSON.stringify(reused.pool);
  if (!parity) throw new Error(`pattern pool regression ${fixture.order}`);

  report.push({
    order: fixture.order,
    source: fixture.source,
    pieces: fixture.lines.reduce((s,x) => s + x.cant, 0),
    typeCount: fixture.lines.length,
    patterns: reused.pool.length,
    parity,
    baselineMs: +baseline.ms.toFixed(3),
    reusedMs: +reused.ms.toFixed(3),
    speedup: +(baseline.ms / reused.ms).toFixed(3),
    savingPct: +((1 - reused.ms / baseline.ms) * 100).toFixed(2),
    telemetry: reused.telemetry,
  });
}

console.log(JSON.stringify({ ok: true, benchmark: "master40-greedy-beam-reuse-v1", report }));

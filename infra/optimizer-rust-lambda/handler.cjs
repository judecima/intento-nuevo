"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const moduleStartedAt = performance.now();
const repoRoot = process.env.OPTIMIZER_REPO_ROOT || path.resolve(__dirname, "../..");
const { generarPatronesLegacyRustHybrid } = require(
  path.join(repoRoot, "src/lib/optimizer/legacy/rust/rust-patrones.cjs"),
);
const moduleInitMs = performance.now() - moduleStartedAt;
let invocationCount = 0;

function parseEvent(rawEvent) {
  if (rawEvent == null) return {};
  if (typeof rawEvent === "string") return JSON.parse(rawEvent);
  if (typeof rawEvent.body === "string") return JSON.parse(rawEvent.body);
  if (rawEvent.body && typeof rawEvent.body === "object") return rawEvent.body;
  return rawEvent;
}

function assertFinitePositive(value, name) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`INVALID_${name.toUpperCase()}`);
  }
}

function validateInput(event) {
  if (!Array.isArray(event.lines) || event.lines.length === 0) {
    throw new Error("INVALID_LINES");
  }
  if (!event.options || typeof event.options !== "object" || Array.isArray(event.options)) {
    throw new Error("INVALID_OPTIONS");
  }

  for (const [index, line] of event.lines.entries()) {
    assertFinitePositive(Number(line.cant), `lines_${index}_cant`);
    assertFinitePositive(Number(line.base), `lines_${index}_base`);
    assertFinitePositive(Number(line.altura), `lines_${index}_altura`);
  }

  const rounds = event.rounds == null ? 60 : Number(event.rounds);
  const seed = event.seed == null ? 7 : Number(event.seed);
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 120) throw new Error("INVALID_ROUNDS");
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error("INVALID_SEED");
  return { rounds, seed };
}

function normalizePattern(pattern) {
  return {
    usage: [...pattern.uso.entries()].sort((a, b) => a[0] - b[0]),
    area: pattern.area,
    pieces: pattern.placa.colocadas
      .map((placement) => ({
        ref: placement.pieza?.ref ?? null,
        x: placement.x,
        y: placement.y,
        base: placement.base,
        altura: placement.altura,
        rotada: Boolean(placement.rotada),
        nivel: placement.nivel,
      }))
      .sort((a, b) =>
        String(a.ref).localeCompare(String(b.ref)) ||
        a.x - b.x ||
        a.y - b.y ||
        a.base - b.base ||
        a.altura - b.altura ||
        Number(a.rotada) - Number(b.rotada) ||
        a.nivel - b.nivel
      ),
    cuts: (pattern.placa.cortes ?? []).map((cut) => ({
      x1: cut.x1,
      y1: cut.y1,
      x2: cut.x2,
      y2: cut.y2,
      nivel: cut.nivel,
      largo: cut.largo,
      terminal: Boolean(cut.terminal),
    })),
    remnants: (pattern.placa.restos ?? []).map((remnant) => ({
      x: remnant.x,
      y: remnant.y,
      w: remnant.w,
      h: remnant.h,
    })),
  };
}

function digestPatterns(patterns) {
  const canonical = patterns
    .map(normalizePattern)
    .sort((a, b) => JSON.stringify(a.usage).localeCompare(JSON.stringify(b.usage)));
  return crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

exports.handler = async (rawEvent) => {
  const coldStart = invocationCount++ === 0;
  const event = parseEvent(rawEvent);

  if (event.operation === "health") {
    return {
      ok: true,
      operation: "health",
      engine: "rust-legacy-pattern-master-v1",
      arch: process.arch,
      platform: process.platform,
      node: process.version,
      coldStart,
      moduleInitMs: Number(moduleInitMs.toFixed(3)),
    };
  }

  const { rounds, seed } = validateInput(event);
  const rssBefore = process.memoryUsage().rss;
  const cpuStartedAt = process.cpuUsage();
  const startedAt = performance.now();

  const patterns = generarPatronesLegacyRustHybrid(event.lines, event.options, rounds, seed);

  const generatorWallMs = performance.now() - startedAt;
  const cpu = process.cpuUsage(cpuStartedAt);
  const generatorCpuMs = (cpu.user + cpu.system) / 1000;
  const rssAfter = process.memoryUsage().rss;

  const digestStartedAt = performance.now();
  const digest = digestPatterns(patterns);
  const digestMs = performance.now() - digestStartedAt;

  return {
    ok: true,
    operation: "pattern-master",
    engine: "rust-legacy-pattern-master-v1",
    arch: process.arch,
    platform: process.platform,
    node: process.version,
    coldStart,
    moduleInitMs: Number(moduleInitMs.toFixed(3)),
    generatorWallMs: Number(generatorWallMs.toFixed(3)),
    generatorCpuMs: Number(generatorCpuMs.toFixed(3)),
    digestMs: Number(digestMs.toFixed(3)),
    patterns: patterns.length,
    digest,
    rounds,
    seed,
    rssBeforeMb: Number((rssBefore / 1024 / 1024).toFixed(2)),
    rssAfterMb: Number((rssAfter / 1024 / 1024).toFixed(2)),
    lambdaMemoryMb: Number(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE || 0) || null,
    requestId: event.requestId ?? null,
  };
};

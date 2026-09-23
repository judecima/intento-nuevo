#!/usr/bin/env node
import { build } from "esbuild";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundlePath = join(REPO, "node_modules", ".cache", "tail-case-30", "optimizer.mjs");
const anchor = pathToFileURL(join(REPO, "src", "lib", "optimizer", "experience", "revalidate.ts")).href;

mkdirSync(dirname(bundlePath), { recursive: true });
await build({
  entryPoints: [join(REPO, "src", "lib", "optimizer", "index.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: bundlePath,
  define: { "import.meta.url": JSON.stringify(anchor) },
  logLevel: "warning",
});
const optimizer = await import(pathToFileURL(bundlePath).href + "?v=" + Date.now());

process.env.OPTIMIZER_STEP0_TELEMETRY = "1";

const pieces = [
  ["P1",2,717,464],["P2",2,717,700],["P3",2,717,114],["P4",1,1100,250],
  ["P5",1,1400,500],["P6",1,120,350],["P7",2,120,420],["P8",2,314,420],
  ["P9",2,287,80],["P10",2,364,80],["P11",1,300,1800],["P12",12,290,200],
].map(([reference, quantity, width, height]) => ({
  reference, quantity, width, height, canRotate: true,
}));

function makeInput(trim) {
  return {
    projectId: "tail-case-30-trim-" + trim,
    board: { width: 2750, height: 1830, thickness: 18 },
    material: { description: "AGL 18MM BLANCO", hasGrain: false, thickness: 18 },
    kerf: 4.5,
    trim: { x: trim, y: trim },
    strategy: "v10",
    constraints: {
      profile: "balanced",
      minRemnant: 250,
      minCommercialRemnantLongSide: 400,
      minCutSize: 60,
      allowOneBoard: true,
      allowPatternMaster: true,
      allowMultiSlice: true,
      allowDeadStripCompaction: true,
    },
    pieces,
  };
}

for (const trim of [0, 10]) {
  const input = makeInput(trim);
  const t0 = process.hrtime.bigint();
  const result = optimizer.optimizeProject(input, {
    patternGenerator: "rust",
    motorVersion: "v2",
    effortMode: "auto",
  });
  const totalMs = Number(process.hrtime.bigint() - t0) / 1e6;
  const m = result.raw?.metricasV10 ?? {};
  const step0 = m.step0 ?? {};
  console.log("TAIL30_RESULT " + JSON.stringify({
    trim,
    totalMs: +totalMs.toFixed(3),
    engineMs: result.metrics?.engineMs ?? null,
    boards: result.metrics?.boardCount ?? null,
    validationOk: result.validation?.ok ?? null,
    patternGenerator: result.metrics?.patternGenerator ?? null,
    effortMode: result.metrics?.effortMode ?? null,
    cota: result.raw?.cotaV10 ?? result.raw?.cota ?? null,
    origin: result.raw?.resumen?.origen ?? null,
    beam: step0.beam ?? null,
    masterProbe: step0.master ?? null,
    composition: step0.composition ?? null,
    stages: {
      oneboardMs: m.oneboard?.ms ?? 0,
      compactacionMs: m.compactacion?.ms ?? 0,
      multisliceMs: m.multislice?.ms ?? 0,
      masterMs: m.master?.ms ?? 0,
      totalV10Ms: m.total?.ms ?? 0,
      lowerBoundPostCompactMs: m.lowerBound?.postCompactMs ?? 0,
      remnantPolishMs: m.remnantPolish?.ms ?? 0,
    },
    effort: m.effortController ?? null,
  }));
}

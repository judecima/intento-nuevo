#!/usr/bin/env node
import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundlePath = join(REPO, "node_modules", ".cache", "remnant-case-95", "optimizer.mjs");
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

const rows = [
[4,882,600],[1,1554,600],[2,1518,70],[1,1518,600],[2,516,880],[2,1550,100],[2,550,100],[2,480,70],
[1,512,397],[2,480,377],[2,516,377],[4,480,222],[4,516,222],[2,882,600],[1,1200,600],[2,1164,70],
[1,1164,600],[2,598,880],[4,900,70],[4,600,70],[2,882,600],[1,650,600],[2,614,70],[1,614,600],
[2,323,880],[2,882,600],[1,430,600],[2,394,70],[1,394,600],[1,426,880],[2,564,300],[2,800,300],
[2,564,70],[1,560,300],[2,298,782],[2,564,300],[2,800,300],[2,564,70],[1,564,300],[2,298,782],
[2,564,300],[2,680,300],[2,564,70],[1,564,300],[2,298,662],[2,891,300],[2,490,300],[2,891,70],
[1,891,300],[1,923,472]
];

const pieces = rows.map(([quantity,width,height], i) => ({
  reference: "P" + (i+1),
  description: "P" + (i+1),
  quantity, width, height, canRotate: true,
}));

const input = {
  projectId: "remnant-case-95",
  board: { width: 2750, height: 1830, thickness: 18 },
  material: { description: "AGL 18MM BLANCO", hasGrain: false, thickness: 18 },
  kerf: 4.5,
  trim: { x: 10, y: 10 },
  strategy: "v10",
  constraints: {
    profile: "balanced",
    stages: 4,
    minRemnant: 250,
    minCommercialRemnantLongSide: 400,
    allowOneBoard: true,
    allowPatternMaster: true,
    allowMultiSlice: true,
    allowDeadStripCompaction: true,
  },
  pieces,
};

const totalArea = rows.reduce((s,[q,w,h]) => s + q*w*h, 0);
const usableArea = (2750-10)*(1830-10);
const areaLB = Math.ceil(totalArea/usableArea - 1e-9);

process.env.OPTIMIZER_V2_REMNANT_POLISH = "1";
const t0 = process.hrtime.bigint();
const result = optimizer.optimizeProject(input, {
  patternGenerator: "rust",
  motorVersion: "v2",
  effortMode: "auto",
});
const totalMs = Number(process.hrtime.bigint()-t0)/1e6;

const output = {
  totalMs:+totalMs.toFixed(3),
  valid:result.validation.ok,
  boards:result.metrics.boardCount,
  areaLB,
  pieceCount:result.metrics.pieceCount,
  algorithmVersion:result.algorithmVersion,
  largestCommercialRemnantM2:result.metrics.largestCommercialRemnantM2,
  secondLargestCommercialRemnantM2:result.metrics.secondLargestCommercialRemnantM2,
  commercialRemnantCount:result.metrics.commercialRemnantCount,
  commercialRemnantAreaM2:result.metrics.commercialRemnantAreaM2,
  remnantPolish:result.raw?.metricasV10?.remnantPolish ?? null,
};
console.log("REMNANT95_SENTINEL " + JSON.stringify(output));

if (result.validation.ok !== true) throw new Error("REMNANT95 invalid plan");
if (result.metrics.boardCount !== 5 || areaLB !== 5) {
  throw new Error(`REMNANT95 boards expected=5 actual=${result.metrics.boardCount} lb=${areaLB}`);
}
if (!String(result.algorithmVersion).includes("+remnant-polish-v1")) {
  throw new Error("REMNANT95 remnant-polish version missing");
}
if (result.metrics.largestCommercialRemnantM2 < 1.50) {
  throw new Error(
    `REMNANT95 largest remnant regressed: ${result.metrics.largestCommercialRemnantM2} m2`,
  );
}

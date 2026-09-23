#!/usr/bin/env node
import { build } from "esbuild";
import { createRequire } from "node:module";
import { existsSync, mkdirSync } from "node:fs";
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
const require = createRequire(import.meta.url);
const {
  defragmentarPlanPorPlaca,
  lineasDesdePlaca,
} = require("../src/lib/optimizer/experimental/per-board-remnant-defrag.cjs");
const {
  optimizar,
  calidadRestos,
  compararCalidad,
  calidadPlanPlacas,
} = require("../src/lib/optimizer/legacy/motor.cjs");
const { validarPlanIndustrial } = require("../src/lib/optimizer/legacy/validador_industrial_v3.cjs");

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

const t0 = process.hrtime.bigint();
const result = optimizer.optimizeProject(input, {
  patternGenerator: "rust",
  motorVersion: "v2",
  effortMode: "auto",
});
const totalMs = Number(process.hrtime.bigint()-t0)/1e6;
const raw = result.raw;
const board5 = raw.placas?.[4];

const placementView = (board5?.colocadas || []).map(c => ({
  ref: c.pieza?.ref,
  x: c.x, y: c.y, w: c.base, h: c.altura,
  rotated: c.rotada ?? c.rotated ?? null,
})).sort((a,b)=>a.y-b.y || a.x-b.x);
const remnantView = (board5?.restos || []).map(r => ({
  x:r.x,y:r.y,w:r.w,h:r.h,area:r.w*r.h,
})).sort((a,b)=>b.area-a.area);

const p8 = placementView.filter(p=>p.ref==="P8");
const holesForP8 = remnantView.filter(r =>
  (r.w >= 480 && r.h >= 70) || (r.w >= 70 && r.h >= 480)
);

const qBefore = calidadPlanPlacas(raw.placas, raw.opts);
const defrag = defragmentarPlanPorPlaca(raw, { piezasEsperadas: 95 });
const qAfter = calidadPlanPlacas(defrag.plan.placas, defrag.plan.opts);
const defragBoard5 = defrag.plan.placas?.[4];
const defragP8 = (defragBoard5?.colocadas || []).filter(c=>c.pieza?.ref==="P8").map(c=>({
  x:c.x,y:c.y,w:c.base,h:c.altura
}));
const defragRemnants = (defragBoard5?.restos || []).map(r=>({x:r.x,y:r.y,w:r.w,h:r.h,area:r.w*r.h}))
  .sort((a,b)=>b.area-a.area).slice(0,10);

const board5Lines = lineasDesdePlaca(board5);
const localSweeps = [];
const baseCfg = Object.fromEntries(
  Object.entries(raw.opts || {}).filter(([key]) => !key.startsWith("_"))
);
const variants = [
  { name:"mv", multiVariantes:true },
  { name:"r28", restartsPorPlaca:28 },
  { name:"r56", restartsPorPlaca:56 },
  { name:"r28-mv", restartsPorPlaca:28, multiVariantes:true },
  { name:"r56-mv", restartsPorPlaca:56, multiVariantes:true },
  { name:"noise50-r28-mv", ruido:0.5, restartsPorPlaca:28, multiVariantes:true },
  { name:"noise80-r56-mv", ruido:0.8, restartsPorPlaca:56, multiVariantes:true },
  { name:"tol05-r28-mv", tolerancia:0.05, restartsPorPlaca:28, multiVariantes:true },
  { name:"tol10-r56-mv", tolerancia:0.10, restartsPorPlaca:56, multiVariantes:true },
  { name:"depth-off-r28-mv", preferirMenorProfundidad:false, restartsPorPlaca:28, multiVariantes:true },
];

for (const variant of variants) {
  let best = null;
  const started = process.hrtime.bigint();
  for (let seedOffset=0; seedOffset<8; seedOffset++) {
    try {
      const candidate = optimizar(board5Lines, {
        ...baseCfg,
        ...variant,
        penalizarFranjaMuerta:true,
        semilla:(Number(baseCfg.semilla)||20260812) + 900000 + seedOffset,
      });
      if (!candidate?.placas || candidate.placas.length !== 1) continue;
      const validation = validarPlanIndustrial(candidate, board5Lines.reduce((s,l)=>s+l.cant,0));
      if (!validation?.ok) continue;
      const q = calidadRestos(candidate.placas[0].restos || [], candidate.opts || raw.opts);
      if (!best || compararCalidad(q, best.q) > 0) best = { candidate, q, seedOffset };
    } catch (_) {}
  }
  const ms = Number(process.hrtime.bigint()-started)/1e6;
  if (!best) {
    localSweeps.push({name:variant.name, valid:false, ms:+ms.toFixed(3)});
    continue;
  }
  const b=best.candidate.placas[0];
  localSweeps.push({
    name:variant.name,
    valid:true,
    ms:+ms.toFixed(3),
    improved:compararCalidad(best.q, calidadRestos(board5.restos||[], raw.opts))>0,
    quality:best.q,
    seedOffset:best.seedOffset,
    p8:(b.colocadas||[]).filter(x=>x.pieza?.ref==="P8").map(x=>({x:x.x,y:x.y,w:x.base,h:x.altura})),
    remnants:(b.restos||[]).map(r=>({x:r.x,y:r.y,w:r.w,h:r.h,area:r.w*r.h})).sort((a,b)=>b.area-a.area).slice(0,8),
  });
}

console.log("REMNANT95 " + JSON.stringify({
  totalMs:+totalMs.toFixed(3),
  valid:result.validation.ok,
  boards:result.metrics.boardCount,
  areaLB,
  pieceCount:result.metrics.pieceCount,
  algorithmVersion:result.algorithmVersion,
  board5:{
    placements:placementView,
    remnants:remnantView,
    p8,
    holesForP8,
  },
  qualityBefore:qBefore,
  defrag:{
    changed:defrag.changed,
    attemptedBoards:defrag.attemptedBoards,
    improvedBoards:defrag.improvedBoards,
    rejectedBoards:defrag.rejectedBoards,
    invalidFinal:defrag.invalidFinal,
    ms:defrag.ms,
    qualityAfter:qAfter,
    board5P8:defragP8,
    board5Remnants:defragRemnants,
  },
  localSweeps,
}));

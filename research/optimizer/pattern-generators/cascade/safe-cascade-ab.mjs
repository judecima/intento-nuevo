import { createRequire } from "node:module";
import { optimizarV10ConSafeFastPathCascade } from "./integrated-v10-safe-cascade.mjs";

const require=createRequire(import.meta.url);
const {optimizarV10,nuevasMetricas,validarPlanIndustrial}=
  require("../../../../src/lib/optimizer/legacy/v10.cjs");
const {calidadPlanPlacas,compararCalidad}=
  require("../../../../src/lib/optimizer/legacy/motor.cjs");

process.env.OPTIMIZER_RUST_BEAM_RANK_CACHE_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_LEAN_BEAM_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_GREEDY_PLAN_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_LARGE_ROUND_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_SIMPLE_CHOOSE_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_MASTER_ROUND_REUSE_EXPERIMENTAL="0";
process.env.OPTIMIZER_MASTER_UNIQUE_MASKS_LE4_EXPERIMENTAL="1";

const CASES=[
  {
    name:"mono-parity",
    route:"MONOTYPE_V2",
    board:[2600,1830],saw:4.5,
    types:[{w:300,h:200,q:68}],
  },
  {
    name:"mono-remnant-win",
    route:"MONOTYPE_V2",
    board:[2600,1830],saw:4.4,
    types:[{w:360,h:750,q:6}],
  },
  {
    name:"mono-lb-fallback",
    route:"MONOTYPE_V2",
    board:[2400,1220],saw:4.5,
    types:[{w:145,h:380,q:97}],
    expectFallback:true,
  },
  {
    name:"r3-external-5344286",
    route:"R3M_V4",
    board:[2750,1830],saw:5,
    types:[{w:600,h:500,q:3},{w:2080,h:778,q:1}],
  },
  {
    name:"r3-external-5362238",
    route:"R3M_V4",
    board:[2750,1850],saw:5,
    types:[{w:492,h:432,q:10},{w:1862,h:572,q:2}],
  },
  {
    name:"r3-external-5407018",
    route:"R3M_V4",
    board:[3000,1200],saw:4.4,
    types:[{w:350,h:300,q:8},{w:2100,h:832,q:1}],
  },
  {
    name:"directional-mono-fallback",
    route:"MONOTYPE_V2",
    board:[2600,1830],saw:4.5,
    materialConVeta:true,
    types:[{w:800,h:400,q:2,veta:true,canRotate:false}],
    expectFallback:true,
  },
  {
    name:"outside-fast-path",
    route:"V3",
    board:[2600,1830],saw:4.5,
    types:[
      {w:500,h:300,q:2},
      {w:450,h:250,q:2},
      {w:400,h:200,q:2},
      {w:350,h:180,q:2},
    ],
    expectFallback:true,
  },
];

function lines(c){
  return c.types.map((t,i)=>({
    base:+t.w,
    altura:+t.h,
    cant:+t.q,
    veta:Boolean(t.veta),
    canRotate:t.canRotate??true,
    ref:String(i),
    detalle:c.name+"-"+i,
    cantos:null,
  }));
}
function config(c){
  return {
    placaBase:c.board[0],
    placaAltura:c.board[1],
    refiladoX:0,
    refiladoY:0,
    sierra:c.saw,
    etapas:4,
    materialConVeta:Boolean(c.materialConVeta),
    descontarCanto:false,
    cantoEspesor:0,
    restoMin:250,
    restoMax:400,
    usarOneBoard:true,
    usarMaster:true,
    usarMultiSlice:true,
    usarCompactacion:true,
    usarRustPatternGenerator:true,
    usarCache:false,
    maxPiezasCache:0,
    rondasPatrones:40,
    msMaster:8000,
    maxNodosMaster:1600000,
    watchdogMasterMs:12000,
    usarCotaBarataPostCompactacion:true,
    usarDffFs0PostCompactacion:true,
    usarMascarasUnicasMasterLe4:true,
    minPiezasMultiSliceExperimental:200,
    maxPiezasMultiSliceExperimental:500,
    masterIndustrialRulesV3Experimental:true,
    safeFastPathCascadeExperimental:true,
  };
}
function count(ls){return ls.reduce((s,l)=>s+l.cant,0);}
function quality(plan,C){return calidadPlanPlacas(plan?.placas||[],plan?.opts||C);}
function digest(plan){
  return JSON.stringify(
    (plan?.placas||[])
      .map(b=>(b.colocadas||[])
        .map(p=>[String(p?.pieza?.ref),+p.base,+p.altura,Boolean(p.rotada)])
        .sort())
      .sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),
  );
}

const rows=[];
let bad=0;
for(const c of CASES){
  const ls=lines(c),C=config(c),expected=count(ls);
  const a=optimizarV10ConSafeFastPathCascade(ls,C,nuevasMetricas());
  const b=optimizarV10(
    ls,
    {
      ...C,
      safeFastPathCascadeExperimental:false,
      monotypeV2FrozenExperimental:false,
      monotypeRemnantFirstExperimental:false,
      guideRowR3MV4Experimental:false,
      guideRowR3MEarlyCertificationExperimental:false,
    },
    nuevasMetricas(),
  );

  const va=Boolean(validarPlanIndustrial(a.plan,expected)?.ok);
  const vb=Boolean(validarPlanIndustrial(b.plan,expected)?.ok);
  const qa=quality(a.plan,C),qb=quality(b.plan,C);
  const qcmp=a.plan.resumen.placas===b.plan.resumen.placas
    ? compararCalidad(qa,qb)
    : null;
  const boardLoss=a.plan.resumen.placas>b.plan.resumen.placas;
  const remnantWorse=qcmp!=null&&qcmp<0;
  const routeOk=a.safeCascade?.route===c.route;
  const fallback=!a.safeCascade?.certified;
  const fallbackParity=!c.expectFallback || (
    a.plan.resumen.placas===b.plan.resumen.placas &&
    qcmp===0 &&
    digest(a.plan)===digest(b.plan)
  );

  if(
    !va||!vb||boardLoss||remnantWorse||!routeOk||
    (c.expectFallback&&!fallback)||!fallbackParity
  )bad++;

  rows.push({
    name:c.name,
    route:a.safeCascade?.route,
    certified:Boolean(a.safeCascade?.certified),
    reason:a.safeCascade?.reason,
    boardsA:a.plan.resumen.placas,
    boardsB:b.plan.resumen.placas,
    qcmp,
    digestEqual:digest(a.plan)===digest(b.plan),
    validA:va,
    validB:vb,
  });
}

console.log("SAFE_CASCADE_AB "+JSON.stringify({cases:CASES.length,bad,rows}));
if(bad)process.exitCode=2;

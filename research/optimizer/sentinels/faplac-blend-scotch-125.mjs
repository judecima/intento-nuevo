import { createRequire } from "node:module";

const require=createRequire(import.meta.url);
const {
  optimizarV10,
  nuevasMetricas,
  validarPlanIndustrial,
}=require("../../../src/lib/optimizer/legacy/v10.cjs");
const {
  calidadPlanPlacas,
}=require("../../../src/lib/optimizer/legacy/motor.cjs");
const {
  computeHybridLowerBound,
}=require("../../../src/lib/optimizer/experimental/hybrid-lower-bound.cjs");

process.env.OPTIMIZER_RUST_BEAM_RANK_CACHE_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_LEAN_BEAM_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_GREEDY_PLAN_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_LARGE_ROUND_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_SIMPLE_CHOOSE_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_MASTER_ROUND_REUSE_EXPERIMENTAL="0";
process.env.OPTIMIZER_MASTER_UNIQUE_MASKS_LE4_EXPERIMENTAL="1";

const DEMAND=[
  [2364,500,8],
  [600,500,4],
  [564,500,4],
  [1100,490,2],
  [273,480,8],
  [558,160,6],
  [450,120,24],
  [501,110,12],
  [523,500,4],
  [487,490,6],
  [2454,600,2],
  [2264,600,2],
  [2264,500,4],
  [664,500,3],
  [601,110,12],
  [658,160,6],
  [323,480,8],
  [1846,490,1],
  [1018,490,3],
  [2234,585,3],
  [750,585,1],
  [1018,150,2],
];

function lines(rotationAllowed){
  return DEMAND.map(([base,altura,cant],i)=>({
    base,altura,cant,
    veta:!rotationAllowed,
    canRotate:rotationAllowed,
    ref:String(i+1),
    detalle:String(i+1),
    cantos:null,
  }));
}

function config({rotationAllowed,trim}){
  return {
    placaBase:2750,
    placaAltura:1830,
    refiladoX:trim,
    refiladoY:trim,
    sierra:4.5,
    etapas:4,
    materialConVeta:!rotationAllowed,
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
  };
}

function timed(fn){
  const cpu0=process.cpuUsage();
  const t0=process.hrtime.bigint();
  const value=fn();
  const cpu=process.cpuUsage(cpu0);
  return {
    value,
    wallMs:Number(process.hrtime.bigint()-t0)/1e6,
    cpuMs:(cpu.user+cpu.system)/1000,
  };
}

const totalPieces=DEMAND.reduce((s,x)=>s+x[2],0);
const pieceArea=DEMAND.reduce((s,[w,h,q])=>s+w*h*q,0);

for(const scenario of [
  {name:"LOCKED_TRIM0",rotationAllowed:false,trim:0},
  {name:"ROTATE_TRIM0",rotationAllowed:true,trim:0},
  {name:"LOCKED_TRIM10",rotationAllowed:false,trim:10},
  {name:"ROTATE_TRIM10",rotationAllowed:true,trim:10},
]){
  const ls=lines(scenario.rotationAllowed);
  const C=config(scenario);
  const metrics=nuevasMetricas();
  const run=timed(()=>optimizarV10(ls,C,metrics));
  const plan=run.value.plan;
  const validation=validarPlanIndustrial(plan,totalPieces);
  const quality=calidadPlanPlacas(plan.placas,plan.opts||C);
  const rotated=(plan.placas||[]).flatMap(b=>b.colocadas||[]).filter(p=>Boolean(p.rotada)).length;
  const boardArea=(C.placaBase-C.refiladoX)*(C.placaAltura-C.refiladoY);
  const areaLB=Math.ceil(pieceArea/boardArea-1e-9);
  let hybrid=null;
  try{
    hybrid=computeHybridLowerBound(
      ls,
      plan.opts||C,
      plan.resumen.placas,
      {useRaster:false,claude:{usarRaster:false,usarDffFs0:true}},
    );
  }catch(error){
    hybrid={error:String(error?.message||error)};
  }
  console.log("SCOTCH_SENTINEL "+JSON.stringify({
    scenario:scenario.name,
    totalPieces,
    typeCount:ls.length,
    piecesPerType:totalPieces/ls.length,
    pieceArea,
    boardArea,
    rawUtilizationAtAreaLB:pieceArea/(areaLB*boardArea),
    areaLB,
    boards:plan.resumen.placas,
    valid:Boolean(validation?.ok),
    rotated,
    quality,
    hybrid,
    wallMs:run.wallMs,
    cpuMs:run.cpuMs,
    metrics:run.value.metricas||metrics,
  }));
}

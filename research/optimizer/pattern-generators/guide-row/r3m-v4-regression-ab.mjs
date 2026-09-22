import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { optimizarV10ConGuideRowR3MV4 } from "./integrated-v10-r3m-v4.mjs";

const require=createRequire(import.meta.url);
const ROOT=path.resolve(new URL("../../../../",import.meta.url).pathname);
const HERE=path.dirname(new URL(import.meta.url).pathname);
const FIXTURE=path.join(HERE,"fixtures/H2C_R2M_438_CASES.json.gz.b64");

process.env.OPTIMIZER_RUST_BEAM_RANK_CACHE_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_LEAN_BEAM_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_GREEDY_PLAN_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_LARGE_ROUND_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_SIMPLE_CHOOSE_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_MASTER_ROUND_REUSE_EXPERIMENTAL="0";
process.env.OPTIMIZER_MASTER_UNIQUE_MASKS_LE4_EXPERIMENTAL="1";

const {optimizarV10,nuevasMetricas,validarPlanIndustrial}=
  require(path.join(ROOT,"src/lib/optimizer/legacy/v10.cjs"));
const {calidadPlanPlacas,compararCalidad}=
  require(path.join(ROOT,"src/lib/optimizer/legacy/motor.cjs"));

function loadOriginal(){
  return JSON.parse(
    zlib.gunzipSync(
      Buffer.from(fs.readFileSync(FIXTURE,"utf8").trim(),"base64"),
    ).toString("utf8"),
  );
}

const EXTERNAL_REGRESSIONS=[
  {
    order:5344286,width:2750,height:1830,saw:5,
    types:[{ref:"2",w:600,h:500,q:3},{ref:"1",w:2080,h:778,q:1}],
  },
  {
    order:5344296,width:2750,height:1830,saw:5,
    types:[{ref:"2",w:600,h:500,q:3},{ref:"1",w:2080,h:778,q:1}],
  },
  {
    order:5362238,width:2750,height:1850,saw:5,
    types:[{ref:"2",w:492,h:432,q:10},{ref:"1",w:1862,h:572,q:2}],
  },
  {
    order:5407018,width:3000,height:1200,saw:4.4,
    types:[{ref:"2",w:350,h:300,q:8},{ref:"1",w:2100,h:832,q:1}],
  },
];

function lines(c){
  return c.types.map((t,i)=>({
    base:+t.w,
    altura:+t.h,
    cant:+t.q,
    veta:false,
    canRotate:true,
    ref:String(i),
    detalle:String(t.ref??i),
    cantos:null,
  }));
}

function config(c,flag=true){
  return {
    placaBase:+c.width,
    placaAltura:+c.height,
    refiladoX:0,
    refiladoY:0,
    sierra:+c.saw,
    etapas:4,
    materialConVeta:false,
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
    guideRowR3MV4Experimental:flag,
  };
}

function countPieces(ls){
  return ls.reduce((s,l)=>s+Number(l.cant||0),0);
}
function demandOk(plan,ls){
  const e=new Map(ls.map((l,i)=>[String(l.ref??i),Number(l.cant)]));
  const a=new Map();
  for(const b of plan?.placas||[])for(const p of b.colocadas||[]){
    const k=String(p?.pieza?.ref);
    a.set(k,(a.get(k)||0)+1);
  }
  if(e.size!==a.size)return false;
  for(const [k,v] of e)if(a.get(k)!==v)return false;
  return true;
}
function quality(plan,C){
  return calidadPlanPlacas(plan?.placas||[],plan?.opts||C);
}
function timed(fn){
  const t0=process.hrtime.bigint();
  try{
    return {ok:true,value:fn(),ms:Number(process.hrtime.bigint()-t0)/1e6,error:null};
  }catch(error){
    return {ok:false,value:null,ms:Number(process.hrtime.bigint()-t0)/1e6,error:String(error?.stack||error)};
  }
}
function quant(xs,p){
  const a=xs.slice().sort((x,y)=>x-y);
  const z=(a.length-1)*p,l=Math.floor(z),h=Math.ceil(z);
  return l===h?a[l]:a[l]+(a[h]-a[l])*(z-l);
}

const original=loadOriginal();
const cases=[...original,...EXTERNAL_REGRESSIONS];
const rows=[];
const counts={
  cases:cases.length,
  original:original.length,
  externalRegressions:EXTERNAL_REGRESSIONS.length,
  certified:0,
  invalid:0,
  referenceErrors:0,
  boardLosses:0,
  boardWins:0,
  remnantWorse:0,
  remnantEqual:0,
  remnantBetter:0,
  riskPolishAttempted:0,
  riskPolishSelected:0,
};

for(const c of cases){
  const ls=lines(c),C=config(c,true),expected=countPieces(ls);
  const ir=timed(()=>optimizarV10ConGuideRowR3MV4(ls,C,nuevasMetricas()));
  if(!ir.ok||!ir.value?.plan){
    counts.invalid++;
    rows.push({order:c.order,class:"INTEGRATED_ERROR",error:ir.error});
    continue;
  }
  const ip=ir.value.plan,meta=ir.value.guideRowR3MV4;
  if(meta?.certified)counts.certified++;
  if(meta?.riskPolishAttempted)counts.riskPolishAttempted++;
  if(
    meta?.riskPolishAttempted &&
    compararCalidad(meta?.quality||{},meta?.baseQuality||{})>0
  )counts.riskPolishSelected++;

  if(!validarPlanIndustrial(ip,expected)?.ok||!demandOk(ip,ls)){
    counts.invalid++;
    rows.push({order:c.order,class:"INVALID_INTEGRATED",meta});
    continue;
  }

  const rr=timed(()=>optimizarV10(
    ls,
    {
      ...C,
      guideRowR3MV4Experimental:false,
      guideRowR3MEarlyCertificationExperimental:false,
    },
    nuevasMetricas(),
  ));
  if(!rr.ok||!rr.value?.plan){
    counts.referenceErrors++;
    rows.push({order:c.order,class:"REFERENCE_ERROR",error:rr.error});
    continue;
  }
  const rp=rr.value.plan;
  if(!validarPlanIndustrial(rp,expected)?.ok||!demandOk(rp,ls)){
    counts.referenceErrors++;
    rows.push({order:c.order,class:"INVALID_REFERENCE"});
    continue;
  }

  const qi=quality(ip,C),qr=quality(rp,C);
  let cls,qcmp=null;
  if(ip.resumen.placas>rp.resumen.placas){
    cls="BOARD_LOSS";counts.boardLosses++;
  }else if(ip.resumen.placas<rp.resumen.placas){
    cls="BOARD_WIN";counts.boardWins++;
  }else{
    qcmp=compararCalidad(qi,qr);
    if(qcmp<0){cls="REMNANT_WORSE";counts.remnantWorse++;}
    else if(qcmp>0){cls="REMNANT_BETTER";counts.remnantBetter++;}
    else{cls="REMNANT_EQUAL";counts.remnantEqual++;}
  }

  rows.push({
    order:c.order,
    source:EXTERNAL_REGRESSIONS.includes(c)?"EXTERNAL_REGRESSION":"ORIGINAL_438",
    class:cls,
    qcmp,
    integratedBoards:ip.resumen.placas,
    referenceBoards:rp.resumen.placas,
    integratedQuality:qi,
    referenceQuality:qr,
    integratedMs:ir.ms,
    referenceMs:rr.ms,
    naturalStates:meta?.naturalStates,
    riskPolishAttempted:Boolean(meta?.riskPolishAttempted),
    riskPolishSelected:Boolean(
      meta?.riskPolishAttempted &&
      compararCalidad(meta?.quality||{},meta?.baseQuality||{})>0
    ),
  });
}

const good=rows.filter(r=>Number.isFinite(r.integratedMs)&&Number.isFinite(r.referenceMs));
const sum=(xs)=>xs.reduce((s,x)=>s+x,0);
const integratedTotal=sum(good.map(r=>r.integratedMs));
const referenceTotal=sum(good.map(r=>r.referenceMs));
const summary={
  counts,
  timing:{
    integratedTotalMs:integratedTotal,
    referenceTotalMs:referenceTotal,
    savingPct:referenceTotal?100*(1-integratedTotal/referenceTotal):null,
    speedup:integratedTotal?referenceTotal/integratedTotal:null,
    integratedP50:quant(good.map(r=>r.integratedMs),.5),
    referenceP50:quant(good.map(r=>r.referenceMs),.5),
    integratedP95:quant(good.map(r=>r.integratedMs),.95),
    referenceP95:quant(good.map(r=>r.referenceMs),.95),
    integratedP99:quant(good.map(r=>r.integratedMs),.99),
    referenceP99:quant(good.map(r=>r.referenceMs),.99),
  },
  external:rows.filter(r=>r.source==="EXTERNAL_REGRESSION"),
};

console.log("R3M_V4_AB "+JSON.stringify(summary));

if(
  counts.certified!==cases.length ||
  counts.invalid ||
  counts.referenceErrors ||
  counts.boardLosses ||
  counts.remnantWorse
)process.exitCode=2;

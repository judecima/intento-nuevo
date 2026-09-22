import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const require=createRequire(import.meta.url);
const ROOT=path.resolve(new URL("../../../",import.meta.url).pathname);
const HERE=path.dirname(new URL(import.meta.url).pathname);
const FIXTURE=path.join(HERE,"fixtures/NO_MASTER_SLOW_FAMILY_11.json.gz.b64");

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

function loadCases(){
  return JSON.parse(
    zlib.gunzipSync(
      Buffer.from(fs.readFileSync(FIXTURE,"utf8").trim(),"base64"),
    ).toString("utf8"),
  );
}
function lines(c){
  return c.types.map((t,i)=>({
    base:+t.w,altura:+t.h,cant:+t.q,
    veta:false,canRotate:true,ref:String(i),detalle:String(i),cantos:null,
  }));
}
function config(c,compact){
  return {
    placaBase:+c.width,placaAltura:+c.height,
    refiladoX:0,refiladoY:0,sierra:+c.saw,etapas:4,
    materialConVeta:false,
    descontarCanto:false,cantoEspesor:0,restoMin:250,restoMax:400,
    usarOneBoard:true,usarMaster:true,usarMultiSlice:true,
    usarCompactacion:compact,
    usarRustPatternGenerator:true,usarCache:false,maxPiezasCache:0,
    rondasPatrones:40,msMaster:8000,maxNodosMaster:1600000,watchdogMasterMs:12000,
    usarCotaBarataPostCompactacion:true,usarDffFs0PostCompactacion:true,
    usarMascarasUnicasMasterLe4:true,
    minPiezasMultiSliceExperimental:200,maxPiezasMultiSliceExperimental:500,
    masterIndustrialRulesV3Experimental:true,
  };
}
function demandOk(plan,ls){
  const e=new Map(ls.map((l,i)=>[String(l.ref??i),Number(l.cant)]));
  const a=new Map();
  for(const b of plan?.placas||[])for(const p of b.colocadas||[]){
    const k=String(p?.pieza?.ref);a.set(k,(a.get(k)||0)+1);
  }
  if(e.size!==a.size)return false;
  for(const [k,v] of e)if(a.get(k)!==v)return false;
  return true;
}
function timed(fn){
  const t0=process.hrtime.bigint(),c0=process.cpuUsage();
  const value=fn();
  const d=process.cpuUsage(c0);
  return {value,wallMs:Number(process.hrtime.bigint()-t0)/1e6,cpuMs:(d.user+d.system)/1000};
}
function quality(plan,C){return calidadPlanPlacas(plan?.placas||[],plan?.opts||C);}
function quant(xs,p){
  const a=xs.slice().sort((x,y)=>x-y);
  const z=(a.length-1)*p,l=Math.floor(z),h=Math.ceil(z);
  return l===h?a[l]:a[l]+(a[h]-a[l])*(z-l);
}

const rows=[];
const counts={
  cases:0,invalidOn:0,invalidOff:0,
  boardMismatch:0,qualityMismatch:0,
  exactParity:0,offBetter:0,onBetter:0,
  masterActivationsOn:0,masterActivationsOff:0,
};
for(const c of loadCases()){
  counts.cases++;
  const ls=lines(c),expected=ls.reduce((s,l)=>s+l.cant,0);
  const on=timed(()=>optimizarV10(ls,config(c,true),nuevasMetricas()));
  const off=timed(()=>optimizarV10(ls,config(c,false),nuevasMetricas()));
  const po=on.value.plan,pf=off.value.plan;
  if(!validarPlanIndustrial(po,expected)?.ok||!demandOk(po,ls)){counts.invalidOn++;continue;}
  if(!validarPlanIndustrial(pf,expected)?.ok||!demandOk(pf,ls)){counts.invalidOff++;continue;}

  const bo=po.resumen.placas,bf=pf.resumen.placas;
  const qo=quality(po,config(c,true)),qf=quality(pf,config(c,false));
  const qcmp=compararCalidad(qf,qo);
  if(bo!==bf)counts.boardMismatch++;
  else if(qcmp!==0){
    counts.qualityMismatch++;
    if(qcmp>0)counts.offBetter++;else counts.onBetter++;
  }else counts.exactParity++;

  const mo=on.value.metricas||{};
  const mf=off.value.metricas||{};
  counts.masterActivationsOn+=Number(mo?.master?.activaciones||0);
  counts.masterActivationsOff+=Number(mf?.master?.activaciones||0);

  rows.push({
    order:c.order,
    boardsOn:bo,boardsOff:bf,lepton:c.leptonBoards,
    qualityOn:qo,qualityOff:qf,qcmp,
    wallOn:on.wallMs,wallOff:off.wallMs,
    cpuOn:on.cpuMs,cpuOff:off.cpuMs,
    compactationMs:Number(mo?.compactacion?.ms||0),
    compactationActivations:Number(mo?.compactacion?.activaciones||0),
    compactationGains:Number(mo?.compactacion?.ganancias||0),
    lowerBoundOn:on.value.cota??null,
    lowerBoundOff:off.value.cota??null,
  });
}

const sum=xs=>xs.reduce((s,x)=>s+x,0);
const wallOn=sum(rows.map(r=>r.wallOn)),wallOff=sum(rows.map(r=>r.wallOff));
const cpuOn=sum(rows.map(r=>r.cpuOn)),cpuOff=sum(rows.map(r=>r.cpuOff));
const compactMs=sum(rows.map(r=>r.compactationMs));
const out={
  counts,
  timing:{
    wallOnMs:wallOn,wallOffMs:wallOff,
    wallSavingPct:wallOn?100*(1-wallOff/wallOn):null,
    wallSpeedup:wallOff?wallOn/wallOff:null,
    cpuOnMs:cpuOn,cpuOffMs:cpuOff,
    cpuSavingPct:cpuOn?100*(1-cpuOff/cpuOn):null,
    compactationMs:compactMs,
    p50On:quant(rows.map(r=>r.wallOn),.5),
    p50Off:quant(rows.map(r=>r.wallOff),.5),
    p95On:quant(rows.map(r=>r.wallOn),.95),
    p95Off:quant(rows.map(r=>r.wallOff),.95),
  },
  rows,
};
fs.writeFileSync(path.join(HERE,"compactation-slow-family-11-results.json"),JSON.stringify(out,null,2)+"\n");
console.log("COMPACTATION_FAMILY_11 "+JSON.stringify({counts:out.counts,timing:out.timing}));
console.log("COMPACTATION_FAMILY_11_ROWS "+JSON.stringify(rows));

if(
  counts.invalidOn||counts.invalidOff||
  counts.boardMismatch||counts.qualityMismatch
)process.exitCode=2;

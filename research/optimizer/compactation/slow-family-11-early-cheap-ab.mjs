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
  return JSON.parse(zlib.gunzipSync(Buffer.from(fs.readFileSync(FIXTURE,"utf8").trim(),"base64")).toString("utf8"));
}
function lines(c){
  return c.types.map((t,i)=>({base:+t.w,altura:+t.h,cant:+t.q,veta:false,canRotate:true,ref:String(i),detalle:String(i),cantos:null}));
}
function config(c,early){
  return {
    placaBase:+c.width,placaAltura:+c.height,refiladoX:0,refiladoY:0,sierra:+c.saw,etapas:4,
    materialConVeta:false,descontarCanto:false,cantoEspesor:0,restoMin:250,restoMax:400,
    usarCotaBarataAntesCompactacion:early,
    usarOneBoard:true,usarMaster:true,usarMultiSlice:true,usarCompactacion:true,
    usarRustPatternGenerator:true,usarCache:false,maxPiezasCache:0,rondasPatrones:40,
    msMaster:8000,maxNodosMaster:1600000,watchdogMasterMs:12000,
    usarCotaBarataPostCompactacion:true,usarDffFs0PostCompactacion:true,
    usarMascarasUnicasMasterLe4:true,minPiezasMultiSliceExperimental:200,maxPiezasMultiSliceExperimental:500,
    masterIndustrialRulesV3Experimental:true,
  };
}
function demandOk(plan,ls){
  const expected=ls.reduce((s,l)=>s+l.cant,0);
  let actual=0;for(const b of plan?.placas||[])actual+=(b.colocadas||[]).length;
  return actual===expected;
}
function timed(fn){
  const t0=process.hrtime.bigint(),c0=process.cpuUsage();
  const value=fn(),d=process.cpuUsage(c0);
  return {value,wallMs:Number(process.hrtime.bigint()-t0)/1e6,cpuMs:(d.user+d.system)/1000};
}
function quality(plan,C){return calidadPlanPlacas(plan?.placas||[],plan?.opts||C);}
function quant(xs,p){
  const a=xs.slice().sort((x,y)=>x-y),z=(a.length-1)*p,l=Math.floor(z),h=Math.ceil(z);
  return l===h?a[l]:a[l]+(a[h]-a[l])*(z-l);
}

const rows=[];
const counts={cases:0,invalidBase:0,invalidEarly:0,boardMismatch:0,qualityMismatch:0,exactParity:0,cheapRuns:0,cheapCertified:0,compactActivationsEarly:0,polishRuns:0,polishValid:0,polishChanged:0};
for(const c of loadCases()){
  counts.cases++;
  const ls=lines(c),expected=ls.reduce((s,l)=>s+l.cant,0);
  const base=timed(()=>optimizarV10(ls,config(c,false),nuevasMetricas()));
  const early=timed(()=>optimizarV10(ls,config(c,true),nuevasMetricas()));
  const pb=base.value.plan,pe=early.value.plan;
  if(!validarPlanIndustrial(pb,expected)?.ok||!demandOk(pb,ls)){counts.invalidBase++;continue;}
  if(!validarPlanIndustrial(pe,expected)?.ok||!demandOk(pe,ls)){counts.invalidEarly++;continue;}
  const qb=quality(pb,config(c,false)),qe=quality(pe,config(c,true));
  const qcmp=compararCalidad(qe,qb);
  if(pb.resumen.placas!==pe.resumen.placas)counts.boardMismatch++;
  else if(qcmp!==0)counts.qualityMismatch++;
  else counts.exactParity++;

  const m=early.value.metricas;
  counts.cheapRuns+=Number(m?.lowerBound?.cheapRuns||0);
  counts.cheapCertified+=Number(m?.lowerBound?.cheapCertified||0);
  counts.compactActivationsEarly+=Number(m?.compactacion?.activaciones||0);
  counts.polishRuns+=Number(m?.remnantPolish?.runs||0);
  counts.polishValid+=Number(m?.remnantPolish?.valid||0);
  counts.polishChanged+=Number(m?.remnantPolish?.changed||0);

  rows.push({
    order:c.order,boardsBase:pb.resumen.placas,boardsEarly:pe.resumen.placas,qcmp,
    qualityBase:qb,qualityEarly:qe,
    wallBase:base.wallMs,wallEarly:early.wallMs,cpuBase:base.cpuMs,cpuEarly:early.cpuMs,
    cheapValue:m?.lowerBound?.cheapValue??null,cheapReason:m?.lowerBound?.cheapReason??null,
    cheapCertified:Number(m?.lowerBound?.cheapCertified||0),
    compactEarly:Number(m?.compactacion?.activaciones||0),
    polishMs:Number(m?.remnantPolish?.ms||0),polishChanged:Number(m?.remnantPolish?.changed||0),
  });
}
const sum=xs=>xs.reduce((s,x)=>s+x,0);
const wallBase=sum(rows.map(r=>r.wallBase)),wallEarly=sum(rows.map(r=>r.wallEarly));
const cpuBase=sum(rows.map(r=>r.cpuBase)),cpuEarly=sum(rows.map(r=>r.cpuEarly));
const out={counts,timing:{
  wallBaseMs:wallBase,wallEarlyMs:wallEarly,wallSavingPct:100*(1-wallEarly/wallBase),wallSpeedup:wallBase/wallEarly,
  cpuBaseMs:cpuBase,cpuEarlyMs:cpuEarly,cpuSavingPct:100*(1-cpuEarly/cpuBase),
  p50Base:quant(rows.map(r=>r.wallBase),.5),p50Early:quant(rows.map(r=>r.wallEarly),.5),
  p95Base:quant(rows.map(r=>r.wallBase),.95),p95Early:quant(rows.map(r=>r.wallEarly),.95),
  polishTotalMs:sum(rows.map(r=>r.polishMs)),
},rows};
console.log("EARLY_CHEAP_FAMILY_11 "+JSON.stringify({counts:out.counts,timing:out.timing}));
console.log("EARLY_CHEAP_FAMILY_11_ROWS "+JSON.stringify(rows));
if(counts.invalidBase||counts.invalidEarly||counts.boardMismatch||counts.qualityMismatch||counts.compactActivationsEarly)process.exitCode=2;

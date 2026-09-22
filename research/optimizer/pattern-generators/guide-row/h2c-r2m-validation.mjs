import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { buildGuideRowCandidate } from "./complete-candidate.mjs";

const require=createRequire(import.meta.url);
const ROOT=path.resolve(new URL("../../../../",import.meta.url).pathname);
const HERE=path.dirname(new URL(import.meta.url).pathname);
const FIXTURE=path.join(HERE,"fixtures/H2C_R2M_438_CASES.json.gz.b64");
const MODE=process.argv[2]||"shard";
const SHARD_INDEX=Number(process.env.SHARD_INDEX||0);
const SHARD_TOTAL=Number(process.env.SHARD_TOTAL||1);

process.env.OPTIMIZER_RUST_BEAM_RANK_CACHE_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_LEAN_BEAM_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_GREEDY_PLAN_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_LARGE_ROUND_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_SIMPLE_CHOOSE_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_MASTER_ROUND_REUSE_EXPERIMENTAL="0";
process.env.OPTIMIZER_MASTER_UNIQUE_MASKS_LE4_EXPERIMENTAL="1";

const {optimizarV10,nuevasMetricas,validarPlanIndustrial}=require(path.join(ROOT,"src/lib/optimizer/legacy/v10.cjs"));
const {calidadPlanPlacas,compararCalidad}=require(path.join(ROOT,"src/lib/optimizer/legacy/motor.cjs"));
const {computeHybridLowerBound}=require(path.join(ROOT,"src/lib/optimizer/experimental/hybrid-lower-bound.cjs"));

if(MODE==="shard") shard();
else if(MODE==="report") report();
else throw new Error("mode shard|report");

function loadCases(){
  const b64=fs.readFileSync(FIXTURE,"utf8").trim();
  return JSON.parse(zlib.gunzipSync(Buffer.from(b64,"base64")).toString("utf8"));
}
function lines(c){return c.types.map((t,i)=>({base:+t.w,altura:+t.h,cant:+t.q,veta:false,canRotate:true,ref:i,detalle:String(t.ref??i),cantos:null}));}
function config(c){return {placaBase:+c.width,placaAltura:+c.height,refiladoX:0,refiladoY:0,sierra:+c.saw,etapas:4,materialConVeta:false,descontarCanto:false,cantoEspesor:0,restoMin:250,restoMax:400,usarOneBoard:true,usarMaster:true,usarMultiSlice:true,usarCompactacion:true,usarRustPatternGenerator:true,usarCache:false,maxPiezasCache:0,rondasPatrones:40,msMaster:8000,maxNodosMaster:1600000,watchdogMasterMs:12000,usarCotaBarataPostCompactacion:true,usarDffFs0PostCompactacion:true,usarMascarasUnicasMasterLe4:true,minPiezasMultiSliceExperimental:200,maxPiezasMultiSliceExperimental:500,masterIndustrialRulesV3Experimental:true};}
function demandOk(plan,ls){const e=new Map(ls.map(l=>[String(l.ref),Number(l.cant)])),a=new Map();for(const b of plan?.placas||[])for(const p of b.colocadas||[]){const k=String(p?.pieza?.ref);a.set(k,(a.get(k)||0)+1);}if(e.size!==a.size)return false;for(const [k,v] of e)if(a.get(k)!==v)return false;return true;}
function safeLB(ls,C,plan){
 const area=ls.reduce((s,l)=>s+l.cant*l.base*l.altura,0),boardArea=C.placaBase*C.placaAltura;
 const areaLB=Math.ceil(area/boardArea-1e-9);let hybrid=0,reason=null,violation=false;
 try{const r=computeHybridLowerBound(ls,plan?.opts||C,plan?.resumen?.placas,{useRaster:false,claude:{usarRaster:false,usarDffFs0:true}});const v=Math.floor(Number(r?.cheapLowerBound??r?.lowerBound??0));reason=r?.reason||null;if(v>0){if(v>plan.resumen.placas)violation=true;else hybrid=v;}}catch(e){reason="error:"+String(e?.message||e);}
 return {value:Math.max(areaLB,hybrid),areaLB,hybrid,reason,violation};
}
function timed(fn){const c0=process.cpuUsage(),t0=process.hrtime.bigint();try{const value=fn(),d=process.cpuUsage(c0);return {ok:true,value,wallMs:Number(process.hrtime.bigint()-t0)/1e6,cpuMs:(d.user+d.system)/1000,error:null};}catch(e){const d=process.cpuUsage(c0);return {ok:false,value:null,wallMs:Number(process.hrtime.bigint()-t0)/1e6,cpuMs:(d.user+d.system)/1000,error:String(e?.stack||e?.message||e)};}}
function quality(plan,C){return calidadPlanPlacas(plan?.placas||[],plan?.opts||C);}
function quant(xs,p){const a=xs.filter(Number.isFinite).slice().sort((x,y)=>x-y);if(!a.length)return null;const z=(a.length-1)*p,l=Math.floor(z),h=Math.ceil(z);return l===h?a[l]:a[l]+(a[h]-a[l])*(z-l);}

function shard(){
 const cases=loadCases(),rows=[];const counts={cohort:cases.length,assigned:0,candidateErrors:0,ruleMisses:0,referenceErrors:0,boardWins:0,boardLosses:0,remnantEqual:0,remnantBetter:0,remnantWorse:0};
 for(let i=SHARD_INDEX;i<cases.length;i+=SHARD_TOTAL){
  counts.assigned++;const c=cases[i],ls=lines(c),C=config(c),pieces=ls.reduce((s,l)=>s+l.cant,0);
  const cr=timed(()=>buildGuideRowCandidate(ls,C));const cand=cr.value?.plan||null;
  const cv=cand?validarPlanIndustrial(cand,pieces):{ok:false};const dem=cand?demandOk(cand,ls):false;
  if(!cr.ok||!cand||!cv?.ok||!dem){counts.candidateErrors++;rows.push({order:c.order,class:"CANDIDATE_ERROR",candidateMs:cr.wallMs,error:cr.error});continue;}
  const qCand=quality(cand,C),lb=safeLB(ls,C,cand),natural=cr.value.telemetry?.residual?.naturalStates??Infinity;
  const rule=ls.length>=2&&natural<=3&&qCand.segundo===0&&!lb.violation&&cand.resumen.placas<=lb.value;
  if(!rule){counts.ruleMisses++;rows.push({order:c.order,class:"RULE_MISS",types:ls.length,pieces,naturalStates:natural,candidateBoards:cand.resumen.placas,lb,quality:qCand,candidateMs:cr.wallMs});continue;}

  const rr=timed(()=>optimizarV10(ls,C,nuevasMetricas()));const ref=rr.value?.plan||null;
  const rv=ref?validarPlanIndustrial(ref,pieces):{ok:false};const refDemand=ref?demandOk(ref,ls):false;
  if(!rr.ok||!ref||!rv?.ok||!refDemand){counts.referenceErrors++;rows.push({order:c.order,class:"REFERENCE_ERROR",candidateMs:cr.wallMs,referenceMs:rr.wallMs,error:rr.error});continue;}
  const qRef=quality(ref,C),cb=cand.resumen.placas,rb=ref.resumen.placas;let cls,qcmp=null;
  if(cb<rb){cls="BOARD_WIN";counts.boardWins++;}
  else if(cb>rb){cls="BOARD_LOSS";counts.boardLosses++;}
  else{qcmp=compararCalidad(qCand,qRef);if(qcmp<0){cls="REMNANT_WORSE";counts.remnantWorse++;}else if(qcmp>0){cls="REMNANT_BETTER";counts.remnantBetter++;}else{cls="REMNANT_EQUAL";counts.remnantEqual++;}}
  rows.push({order:c.order,class:cls,pieces,types:ls.length,naturalStates:natural,candidateBoards:cb,referenceBoards:rb,lowerBound:lb,candidateQuality:qCand,referenceQuality:qRef,qualityCmp:qcmp,candidateMs:cr.wallMs,candidateCpuMs:cr.cpuMs,referenceMs:rr.wallMs,referenceCpuMs:rr.cpuMs,referenceMetrics:rr.value.metricas});
  console.log("H2C_R2M_CASE "+JSON.stringify({order:c.order,class:cls,pieces,types:ls.length,cb,rb,natural,candidateMs:+cr.wallMs.toFixed(2),referenceMs:+rr.wallMs.toFixed(2)}));
 }
 const payload={schema:"h2c-r2m-shard-v1",shard:SHARD_INDEX,shardTotal:SHARD_TOTAL,counts,rows};
 fs.writeFileSync(path.join(HERE,`h2c-r2m-shard-${SHARD_INDEX}.json`),JSON.stringify(payload,null,2)+"\n");
 console.log("H2C_R2M_SHARD "+JSON.stringify({shard:SHARD_INDEX,counts}));
}

function report(){
 const expected=Number(process.env.SHARD_TOTAL||16);
 const files=fs.readdirSync(HERE).filter(n=>/^h2c-r2m-shard-\d+\.json$/.test(n)).sort((a,b)=>Number(a.match(/\d+/)?.[0])-Number(b.match(/\d+/)?.[0]));
 if(files.length!==expected)throw new Error("expected "+expected+" shards, got "+files.length);
 const shards=files.map(f=>JSON.parse(fs.readFileSync(path.join(HERE,f),"utf8"))),rows=shards.flatMap(s=>s.rows||[]).sort((a,b)=>(a.order??Infinity)-(b.order??Infinity));
 const counts={};for(const s of shards)for(const [k,v] of Object.entries(s.counts||{}))counts[k]=(counts[k]||0)+Number(v||0);
 const compared=rows.filter(r=>["BOARD_WIN","BOARD_LOSS","REMNANT_EQUAL","REMNANT_BETTER","REMNANT_WORSE"].includes(r.class));
 const sum=xs=>xs.reduce((s,x)=>s+(Number.isFinite(x)?x:0),0);
 const result={schema:"h2c-r2m-results-v1",generatedAt:new Date().toISOString(),counts,summary:{compared:compared.length,bad:rows.filter(r=>["BOARD_LOSS","REMNANT_WORSE","CANDIDATE_ERROR","REFERENCE_ERROR"].includes(r.class)).map(r=>({order:r.order,class:r.class})),boardWins:rows.filter(r=>r.class==="BOARD_WIN").map(r=>r.order),remnantBetter:rows.filter(r=>r.class==="REMNANT_BETTER").map(r=>r.order),timing:{candidateTotalMs:sum(compared.map(r=>r.candidateMs)),referenceTotalMs:sum(compared.map(r=>r.referenceMs)),candidateP50:quant(compared.map(r=>r.candidateMs),.5),candidateP95:quant(compared.map(r=>r.candidateMs),.95),referenceP50:quant(compared.map(r=>r.referenceMs),.5),referenceP95:quant(compared.map(r=>r.referenceMs),.95)}},rows};
 fs.writeFileSync(path.join(HERE,"h2c-r2m-results.json"),JSON.stringify(result,null,2)+"\n");
 console.log("H2C_R2M_SUMMARY "+JSON.stringify({counts:result.counts,summary:result.summary}));
 if(result.summary.bad.length)process.exitCode=2;
}
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { optimizarV10ConGuideRowR3M } from "./integrated-v10-r3m.mjs";

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

if(MODE==="shard") shard();
else if(MODE==="report") report();
else throw new Error("mode shard|report");

function loadCases(){return JSON.parse(zlib.gunzipSync(Buffer.from(fs.readFileSync(FIXTURE,"utf8").trim(),"base64")).toString("utf8"));}
function lines(c){return c.types.map((t,i)=>({base:+t.w,altura:+t.h,cant:+t.q,veta:false,canRotate:true,ref:i,detalle:String(t.ref??i),cantos:null}));}
function config(c,flag=true){return {placaBase:+c.width,placaAltura:+c.height,refiladoX:0,refiladoY:0,sierra:+c.saw,etapas:4,materialConVeta:false,descontarCanto:false,cantoEspesor:0,restoMin:250,restoMax:400,usarOneBoard:true,usarMaster:true,usarMultiSlice:true,usarCompactacion:true,usarRustPatternGenerator:true,usarCache:false,maxPiezasCache:0,rondasPatrones:40,msMaster:8000,maxNodosMaster:1600000,watchdogMasterMs:12000,usarCotaBarataPostCompactacion:true,usarDffFs0PostCompactacion:true,usarMascarasUnicasMasterLe4:true,minPiezasMultiSliceExperimental:200,maxPiezasMultiSliceExperimental:500,masterIndustrialRulesV3Experimental:true,guideRowR3MEarlyCertificationExperimental:flag};}
function demandOk(plan,ls){const e=new Map(ls.map((l,i)=>[String(l.ref??i),Number(l.cant)])),a=new Map();for(const b of plan?.placas||[])for(const p of b.colocadas||[]){const k=String(p?.pieza?.ref);a.set(k,(a.get(k)||0)+1);}if(e.size!==a.size)return false;for(const [k,v] of e)if(a.get(k)!==v)return false;return true;}
function quality(plan,C){return calidadPlanPlacas(plan?.placas||[],plan?.opts||C);}
function timed(fn){const c0=process.cpuUsage(),t0=process.hrtime.bigint();try{const value=fn(),d=process.cpuUsage(c0);return {ok:true,value,wallMs:Number(process.hrtime.bigint()-t0)/1e6,cpuMs:(d.user+d.system)/1000,error:null};}catch(e){const d=process.cpuUsage(c0);return {ok:false,value:null,wallMs:Number(process.hrtime.bigint()-t0)/1e6,cpuMs:(d.user+d.system)/1000,error:String(e?.stack||e?.message||e)};}}
function quant(xs,p){const a=xs.filter(Number.isFinite).slice().sort((x,y)=>x-y);if(!a.length)return null;const z=(a.length-1)*p,l=Math.floor(z),h=Math.ceil(z);return l===h?a[l]:a[l]+(a[h]-a[l])*(z-l);}
function placementDigest(plan){return JSON.stringify((plan?.placas||[]).map(b=>(b.colocadas||[]).map(p=>[String(p?.pieza?.ref),+p.base,+p.altura,Boolean(p.rotada)]).sort()).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));}

function shard(){
 const cases=loadCases(),rows=[];const counts={cohort:cases.length,assigned:0,integratedErrors:0,referenceErrors:0,uncertified:0,boardLosses:0,remnantWorse:0,remnantEqual:0,remnantBetter:0};
 for(let i=SHARD_INDEX;i<cases.length;i+=SHARD_TOTAL){
  counts.assigned++;const c=cases[i],ls=lines(c),C=config(c,true),pieces=ls.reduce((s,l)=>s+l.cant,0);
  const ir=timed(()=>optimizarV10ConGuideRowR3M(ls,C,nuevasMetricas()));
  if(!ir.ok||!ir.value?.plan||!validarPlanIndustrial(ir.value.plan,pieces)?.ok||!demandOk(ir.value.plan,ls)){counts.integratedErrors++;rows.push({order:c.order,class:"INTEGRATED_ERROR",error:ir.error});continue;}
  if(!ir.value.guideRowR3M?.certified){counts.uncertified++;rows.push({order:c.order,class:"UNCERTIFIED",reason:ir.value.guideRowR3M?.reason,integratedMs:ir.wallMs});continue;}
  const rr=timed(()=>optimizarV10(ls,{...C,guideRowR3MEarlyCertificationExperimental:false},nuevasMetricas()));
  if(!rr.ok||!rr.value?.plan||!validarPlanIndustrial(rr.value.plan,pieces)?.ok||!demandOk(rr.value.plan,ls)){counts.referenceErrors++;rows.push({order:c.order,class:"REFERENCE_ERROR",error:rr.error});continue;}
  const a=ir.value.plan,b=rr.value.plan,qa=quality(a,C),qb=quality(b,C);let cls,qcmp=null;
  if(a.resumen.placas>b.resumen.placas){cls="BOARD_LOSS";counts.boardLosses++;}
  else if(a.resumen.placas<b.resumen.placas){cls="BOARD_WIN";}
  else{qcmp=compararCalidad(qa,qb);if(qcmp<0){cls="REMNANT_WORSE";counts.remnantWorse++;}else if(qcmp>0){cls="REMNANT_BETTER";counts.remnantBetter++;}else{cls="REMNANT_EQUAL";counts.remnantEqual++;}}
  rows.push({order:c.order,class:cls,integratedMs:ir.wallMs,integratedCpuMs:ir.cpuMs,referenceMs:rr.wallMs,referenceCpuMs:rr.cpuMs,qa,qb,qcmp,reason:ir.value.guideRowR3M.reason});
 }
 fs.writeFileSync(path.join(HERE,`r3m-integration-ab-shard-${SHARD_INDEX}.json`),JSON.stringify({shard:SHARD_INDEX,shardTotal:SHARD_TOTAL,counts,rows},null,2)+"\n");
 console.log("R3M_AB_SHARD "+JSON.stringify({shard:SHARD_INDEX,counts}));
}

function fallbackCases(){
 const base={placaBase:2600,placaAltura:1830,refiladoX:0,refiladoY:0,sierra:4.5,etapas:4,materialConVeta:false,descontarCanto:false,cantoEspesor:0,restoMin:250,restoMax:400,usarCache:false,maxPiezasCache:0,usarOneBoard:true,usarMaster:true,usarMultiSlice:true,usarCompactacion:true,usarRustPatternGenerator:true,rondasPatrones:40,msMaster:8000,masterIndustrialRulesV3Experimental:true,guideRowR3MEarlyCertificationExperimental:true};
 return [
  {name:"monotype",lines:[{base:300,altura:200,cant:136,veta:false,canRotate:true,ref:0,detalle:"M"}],config:base},
  {name:"directional",lines:[{base:800,altura:400,cant:2,veta:true,canRotate:false,ref:0,detalle:"A"},{base:600,altura:300,cant:2,veta:true,canRotate:false,ref:1,detalle:"B"}],config:{...base,materialConVeta:true}},
  {name:"low-branching-miss",lines:[{base:500,altura:300,cant:10,veta:false,canRotate:true,ref:0,detalle:"A"},{base:400,altura:250,cant:10,veta:false,canRotate:true,ref:1,detalle:"B"}],config:base},
 ];
}
function fallbackReport(){
 const out=[];
 for(const c of fallbackCases()){
  const a=optimizarV10ConGuideRowR3M(c.lines,c.config,nuevasMetricas());
  const b=optimizarV10(c.lines,{...c.config,guideRowR3MEarlyCertificationExperimental:false},nuevasMetricas());
  const qa=quality(a.plan,c.config),qb=quality(b.plan,c.config);
  out.push({name:c.name,certified:a.guideRowR3M?.certified,reason:a.guideRowR3M?.reason,boardsA:a.plan.resumen.placas,boardsB:b.plan.resumen.placas,qcmp:compararCalidad(qa,qb),digestEqual:placementDigest(a.plan)===placementDigest(b.plan)});
 }
 return out;
}

function report(){
 const expected=Number(process.env.SHARD_TOTAL||16);
 const files=fs.readdirSync(HERE).filter(n=>/^r3m-integration-ab-shard-\d+\.json$/.test(n));
 if(files.length!==expected)throw new Error("expected "+expected+" shards, got "+files.length);
 const shards=files.map(f=>JSON.parse(fs.readFileSync(path.join(HERE,f),"utf8"))),rows=shards.flatMap(s=>s.rows||[]);
 const counts={};for(const s of shards)for(const [k,v] of Object.entries(s.counts||{}))counts[k]=(counts[k]||0)+Number(v||0);
 const compared=rows.filter(r=>["BOARD_WIN","BOARD_LOSS","REMNANT_EQUAL","REMNANT_BETTER","REMNANT_WORSE"].includes(r.class));
 const sum=xs=>xs.reduce((s,x)=>s+(Number.isFinite(x)?x:0),0);
 const fallback=fallbackReport();
 const result={counts,fallback,timing:{integratedTotalMs:sum(compared.map(r=>r.integratedMs)),referenceTotalMs:sum(compared.map(r=>r.referenceMs)),integratedP50:quant(compared.map(r=>r.integratedMs),.5),referenceP50:quant(compared.map(r=>r.referenceMs),.5),integratedP95:quant(compared.map(r=>r.integratedMs),.95),referenceP95:quant(compared.map(r=>r.referenceMs),.95)},rows};
 fs.writeFileSync(path.join(HERE,"r3m-integration-ab-results.json"),JSON.stringify(result,null,2)+"\n");
 console.log("R3M_AB_SUMMARY "+JSON.stringify({counts,timing:result.timing,fallback}));
 const bad=counts.integratedErrors||counts.referenceErrors||counts.uncertified||counts.boardLosses||counts.remnantWorse||fallback.some(x=>x.certified||x.boardsA!==x.boardsB||x.qcmp!==0||!x.digestEqual);
 if(bad)process.exitCode=2;
}

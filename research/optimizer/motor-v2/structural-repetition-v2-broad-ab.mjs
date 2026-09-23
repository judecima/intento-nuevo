import {createRequire} from "node:module";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import {runStructuralRepetitionRescue,repetitionGate,compararCalidad} from "./structural-repetition-rescue-v2.mjs";

const require=createRequire(import.meta.url);
const ROOT=path.resolve(new URL("../../../",import.meta.url).pathname);
const {optimizarV10,nuevasMetricas,validarPlanIndustrial}=require(path.join(ROOT,"src/lib/optimizer/legacy/v10.cjs"));
const {calidadPlanPlacas}=require(path.join(ROOT,"src/lib/optimizer/legacy/motor.cjs"));

process.env.OPTIMIZER_RUST_BEAM_RANK_CACHE_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_LEAN_BEAM_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_GREEDY_PLAN_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_LARGE_ROUND_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_SIMPLE_CHOOSE_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_MASTER_ROUND_REUSE_EXPERIMENTAL="0";
process.env.OPTIMIZER_MASTER_UNIQUE_MASKS_LE4_EXPERIMENTAL="1";

const HERE=path.dirname(new URL(import.meta.url).pathname);
const FIX=path.resolve(HERE,"../holdout-v2-fixture");
const MODE=process.argv[2]||"shard";
const SI=+(process.env.SHARD_INDEX||0), ST=+(process.env.SHARD_TOTAL||32);

function decodeFixture(){
  const b64=[0,1,2,3].map(i=>fs.readFileSync(path.join(FIX,`part-0${i}.b64`),"utf8").trim()).join("");
  const b=zlib.brotliDecompressSync(Buffer.from(b64,"base64"));
  let p=5;if(b.subarray(0,5).toString()!=="MDFV1")throw Error("bad fixture");
  function v(){let n=0,s=0;for(;;){const x=b[p++];n+=(x&127)*2**s;if(!(x&128))return n;s+=7;}}
  const n=v(),out=[];let last=0;
  for(let k=0;k<n;k++){
    const id=last+v();last=id;
    const width=v()/10,height=v()/10,saw=v()/10,leptonBoards=v(),tc=v(),types=[];
    for(let j=0;j<tc;j++)types.push({w:v()/10,h:v()/10,q:v()});
    out.push({id,width,height,saw,leptonBoards,types});
  }
  return out;
}
const lines=c=>c.types.map((t,i)=>({base:t.w,altura:t.h,cant:t.q,veta:false,canRotate:true,ref:String(i),detalle:`V2-${c.id}-${i}`,cantos:null}));
const config=c=>({
  placaBase:c.width,placaAltura:c.height,refiladoX:0,refiladoY:0,sierra:c.saw,etapas:4,
  materialConVeta:false,descontarCanto:false,cantoEspesor:0,restoMin:250,restoMax:400,
  usarOneBoard:true,usarMaster:true,usarMultiSlice:true,usarCompactacion:true,usarRustPatternGenerator:true,
  usarCache:false,maxPiezasCache:0,rondasPatrones:40,msMaster:8000,maxNodosMaster:1600000,watchdogMasterMs:12000,
  usarCotaBarataPostCompactacion:true,usarDffFs0PostCompactacion:true,usarMascarasUnicasMasterLe4:true,
  minPiezasMultiSliceExperimental:200,maxPiezasMultiSliceExperimental:500,masterIndustrialRulesV3Experimental:true
});
function timed(fn){const t=process.hrtime.bigint();try{return {ok:true,value:fn(),ms:Number(process.hrtime.bigint()-t)/1e6,error:null};}catch(e){return {ok:false,value:null,ms:Number(process.hrtime.bigint()-t)/1e6,error:String(e?.stack||e)};}}
function cmp(a,b){return a<b?-1:a>b?1:0;}
function q(p,c){return calidadPlanPlacas(p?.placas||[],p?.opts||c);}
function quant(a,x){if(!a.length)return null;const s=a.slice().sort((a,b)=>a-b),i=(s.length-1)*x,l=Math.floor(i),h=Math.ceil(i);return l===h?s[l]:s[l]+(s[h]-s[l])*(i-l);}
function summarize(rows){
 const cert=rows.filter(r=>r.certified),fb=rows.filter(r=>!r.certified);
 const sum=a=>a.reduce((s,x)=>s+x,0);
 const cand=sum(rows.map(r=>r.rescueMs)),v3=sum(rows.map(r=>r.v3Ms)),route=sum(rows.map(r=>r.routeMs));
 return {
  cases:rows.length,certified:cert.length,fallback:fb.length,
  invalidCandidate:rows.filter(r=>r.certified&&!r.validCandidate).length,
  boardLoss:rows.filter(r=>r.boardCmp>0).length,boardWin:rows.filter(r=>r.boardCmp<0).length,
  remnantWorse:rows.filter(r=>r.boardCmp===0&&r.qcmp<0).length,
  remnantEqual:rows.filter(r=>r.boardCmp===0&&r.qcmp===0).length,
  remnantBetter:rows.filter(r=>r.boardCmp===0&&r.qcmp>0).length,
  vsLepton:{better:rows.filter(r=>r.routeVsLepton<0).length,equal:rows.filter(r=>r.routeVsLepton===0).length,worse:rows.filter(r=>r.routeVsLepton>0).length},
  boardsSaved:rows.reduce((s,r)=>s+Math.max(0,r.v3Boards-r.routeBoards),0),
  timing:{rescueTotalMs:cand,v3TotalMs:v3,routeTotalMs:route,routeSavingPct:v3?100*(1-route/v3):null,
   rescueP50:quant(rows.map(r=>r.rescueMs),.5),rescueP95:quant(rows.map(r=>r.rescueMs),.95),rescueP99:quant(rows.map(r=>r.rescueMs),.99),
   routeP50:quant(rows.map(r=>r.routeMs),.5),routeP95:quant(rows.map(r=>r.routeMs),.95),routeP99:quant(rows.map(r=>r.routeMs),.99),
   v3P50:quant(rows.map(r=>r.v3Ms),.5),v3P95:quant(rows.map(r=>r.v3Ms),.95),v3P99:quant(rows.map(r=>r.v3Ms),.99)}
 };
}

if(MODE==="shard"){
 const all=decodeFixture();
 const eligible=all.filter(c=>repetitionGate(lines(c)).eligible);
 const cases=eligible.filter((_,i)=>i%ST===SI);
 const rows=[];
 for(const c of cases){
   const L=lines(c),C=config(c),expected=L.reduce((s,x)=>s+x.cant,0);
   const a=timed(()=>runStructuralRepetitionRescue(L,C,{maxProbeTests:8,maxTotalTests:24}));
   const b=timed(()=>optimizarV10(L,C,nuevasMetricas()));
   const rescue=a.value||{},pb=b.value?.plan;
   const certified=Boolean(a.ok&&rescue.certified&&rescue.plan);
   const routePlan=certified?rescue.plan:pb;
   const validCandidate=certified?Boolean(validarPlanIndustrial(rescue.plan,expected)?.ok):true;
   const validV3=Boolean(b.ok&&pb&&validarPlanIndustrial(pb,expected)?.ok);
   const validRoute=Boolean(routePlan&&validarPlanIndustrial(routePlan,expected)?.ok);
   const rb=routePlan?.resumen?.placas??Infinity,vb=pb?.resumen?.placas??Infinity;
   const boardCmp=cmp(rb,vb);
   const qcmp=validRoute&&validV3&&boardCmp===0?compararCalidad(q(routePlan,C),q(pb,C)):null;
   rows.push({
     id:c.id,types:c.types.length,pieces:expected,gcd:repetitionGate(L).gcd,leptonBoards:c.leptonBoards,
     certified,validCandidate,validV3,validRoute,
     rescueBoards:rescue.boards??null,v3Boards:Number.isFinite(vb)?vb:null,routeBoards:Number.isFinite(rb)?rb:null,
     lb:rescue.lb??null,tests:rescue.tests??0,validMixed:rescue.validMixed??0,probeValid:rescue.probeValid??0,
     stopReason:rescue.stopReason??rescue.reason??null,boardCmp,qcmp,
     routeVsLepton:Number.isFinite(rb)?cmp(rb,c.leptonBoards):null,
     rescueMs:a.ms,v3Ms:b.ms,routeMs:a.ms+(certified?0:b.ms),
     errorRescue:a.error,errorV3:b.error
   });
 }
 const file=path.join(HERE,`structural-repetition-v2-shard-${SI}.json`);
 fs.writeFileSync(file,JSON.stringify({shard:SI,total:ST,eligibleCases:eligible.length,rows})+"\n");
 console.log("STRUCTURAL_REPETITION_SHARD "+JSON.stringify({shard:SI,cases:rows.length,eligible:eligible.length,summary:summarize(rows)}));
}else if(MODE==="report"){
 const rows=[];let eligibleCases=null;
 for(let i=0;i<ST;i++){const j=JSON.parse(fs.readFileSync(path.join(HERE,`structural-repetition-v2-shard-${i}.json`),"utf8"));eligibleCases=j.eligibleCases;rows.push(...j.rows);}
 rows.sort((a,b)=>a.id-b.id);
 const summary=summarize(rows);
 const failures=rows.filter(r=>!r.validV3||!r.validRoute||r.boardCmp>0||(r.boardCmp===0&&r.qcmp<0));
 const wins=rows.filter(r=>r.boardCmp<0);
 const remnantWins=rows.filter(r=>r.boardCmp===0&&r.qcmp>0);
 const out={status:failures.length?"FAIL":"PASS",eligibleCases,summary,failures,wins,remnantWins,
   stopReasons:Object.fromEntries([...new Set(rows.map(r=>r.stopReason))].map(k=>[k,rows.filter(r=>r.stopReason===k).length]))};
 fs.writeFileSync(path.join(HERE,"STRUCTURAL_REPETITION_V2_BROAD_RESULT.json"),JSON.stringify(out,null,2)+"\n");
 console.log("STRUCTURAL_REPETITION_RESULT "+JSON.stringify({status:out.status,summary,wins:wins.length,failures:failures.length,stopReasons:out.stopReasons}));
 if(failures.length||!(summary.timing.routeSavingPct>0))process.exitCode=2;
}else throw Error("mode");

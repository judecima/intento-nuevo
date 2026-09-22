import {createRequire} from "node:module";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import {optimizarV10ConSafeFastPathCascade} from "./integrated-v10-safe-cascade.mjs";

const require=createRequire(import.meta.url);
const ROOT=path.resolve(new URL("../../../../",import.meta.url).pathname);
const {optimizarV10,nuevasMetricas,validarPlanIndustrial}=require(path.join(ROOT,"src/lib/optimizer/legacy/v10.cjs"));
const {calidadPlanPlacas,compararCalidad}=require(path.join(ROOT,"src/lib/optimizer/legacy/motor.cjs"));

process.env.OPTIMIZER_RUST_BEAM_RANK_CACHE_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_LEAN_BEAM_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_GREEDY_PLAN_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_LARGE_ROUND_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_SIMPLE_CHOOSE_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_MASTER_ROUND_REUSE_EXPERIMENTAL="0";
process.env.OPTIMIZER_MASTER_UNIQUE_MASKS_LE4_EXPERIMENTAL="1";

const HERE=path.dirname(new URL(import.meta.url).pathname);
const FIX=path.resolve(HERE,"../../holdout-v2-fixture");
const MODE=process.argv[2]||"shard";
const SHARD_INDEX=+(process.env.SHARD_INDEX||0);
const SHARD_TOTAL=+(process.env.SHARD_TOTAL||16);

function decodeFixture(){
  const b64=[0,1,2,3].map(i=>fs.readFileSync(path.join(FIX,`part-0${i}.b64`),"utf8").trim()).join("");
  const b=zlib.brotliDecompressSync(Buffer.from(b64,"base64"));
  let p=0;
  const magic=b.subarray(0,5).toString(); p=5;
  if(magic!=="MDFV1")throw new Error("bad fixture magic "+magic);
  function v(){let n=0,s=0;for(;;){const x=b[p++];n+=(x&127)*2**s;if(!(x&128))return n;s+=7;if(s>49)throw Error("varint");}}
  const n=v(), out=[]; let lastId=0;
  for(let k=0;k<n;k++){
    const id=lastId+v();lastId=id;
    const width=v()/10,height=v()/10,saw=v()/10,leptonBoards=v(),tc=v(),types=[];
    for(let j=0;j<tc;j++)types.push({w:v()/10,h:v()/10,q:v()});
    out.push({id,width,height,saw,leptonBoards,types});
  }
  if(p!==b.length)throw new Error(`fixture trailing bytes ${b.length-p}`);
  return out;
}
function lines(c){return c.types.map((t,i)=>({base:t.w,altura:t.h,cant:t.q,veta:false,canRotate:true,ref:String(i),detalle:`HOLDOUT-V2-${c.id}-${i}`,cantos:null}));}
function config(c){return {
  placaBase:c.width,placaAltura:c.height,refiladoX:0,refiladoY:0,sierra:c.saw,etapas:4,
  materialConVeta:false,descontarCanto:false,cantoEspesor:0,restoMin:250,restoMax:400,
  usarOneBoard:true,usarMaster:true,usarMultiSlice:true,usarCompactacion:true,usarRustPatternGenerator:true,
  usarCache:false,maxPiezasCache:0,rondasPatrones:40,msMaster:8000,maxNodosMaster:1600000,watchdogMasterMs:12000,
  usarCotaBarataPostCompactacion:true,usarDffFs0PostCompactacion:true,usarMascarasUnicasMasterLe4:true,
  minPiezasMultiSliceExperimental:200,maxPiezasMultiSliceExperimental:500,masterIndustrialRulesV3Experimental:true,
  safeFastPathCascadeExperimental:true
};}
function timed(fn){const t=process.hrtime.bigint();try{return {ok:true,value:fn(),ms:Number(process.hrtime.bigint()-t)/1e6,error:null};}catch(e){return {ok:false,value:null,ms:Number(process.hrtime.bigint()-t)/1e6,error:String(e?.stack||e)};}}
function quality(p,c){return calidadPlanPlacas(p?.placas||[],p?.opts||c);}
function digest(plan){return JSON.stringify((plan?.placas||[]).map(b=>(b.colocadas||[]).map(p=>[String(p?.pieza?.ref),+p.base,+p.altura,Boolean(p.rotada)]).sort()).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));}
function pct(a,b){return b?100*a/b:null;}
function quantile(a,q){if(!a.length)return null;const x=a.slice().sort((a,b)=>a-b),i=(x.length-1)*q,lo=Math.floor(i),hi=Math.ceil(i);return lo===hi?x[lo]:x[lo]+(x[hi]-x[lo])*(i-lo);}
function summarize(rows,route=null){
  const r=route?rows.filter(x=>x.route===route):rows;
  const cert=r.filter(x=>x.certified), fb=r.filter(x=>!x.certified);
  const timesA=r.filter(x=>x.okA).map(x=>x.integratedMs),timesB=r.filter(x=>x.okB).map(x=>x.v3Ms);
  const sum=a=>a.reduce((s,x)=>s+x,0), ta=sum(timesA),tb=sum(timesB);
  const vsL=(key,val)=>r.filter(x=>x[key]===val).length;
  return {
    cases:r.length,certified:cert.length,fallback:fb.length,
    invalidIntegrated:r.filter(x=>!x.validA).length,invalidV3:r.filter(x=>!x.validB).length,
    boardLoss:r.filter(x=>x.boardCmp>0).length,boardWin:r.filter(x=>x.boardCmp<0).length,
    remnantWorse:r.filter(x=>x.boardCmp===0&&x.qcmp<0).length,
    remnantEqual:r.filter(x=>x.boardCmp===0&&x.qcmp===0).length,
    remnantBetter:r.filter(x=>x.boardCmp===0&&x.qcmp>0).length,
    fallbackParityExact:fb.filter(x=>x.fallbackParity).length,
    fallbackParityMismatch:fb.filter(x=>!x.fallbackParity).length,
    riskPolishAttempted:r.filter(x=>x.riskPolishAttempted).length,
    lepton:{integrated:{better:vsL("aVsLepton",-1),equal:vsL("aVsLepton",0),worse:vsL("aVsLepton",1)},
            v3:{better:vsL("bVsLepton",-1),equal:vsL("bVsLepton",0),worse:vsL("bVsLepton",1)}},
    timing:{integratedTotalMs:ta,v3TotalMs:tb,savingPct:tb?100*(1-ta/tb):null,speedup:ta?tb/ta:null,
      integratedP50:quantile(timesA,.5),integratedP95:quantile(timesA,.95),integratedP99:quantile(timesA,.99),
      v3P50:quantile(timesB,.5),v3P95:quantile(timesB,.95),v3P99:quantile(timesB,.99),
      fallbackIntegratedMs:sum(fb.map(x=>x.integratedMs)),fallbackV3Ms:sum(fb.map(x=>x.v3Ms)),
      certifiedIntegratedMs:sum(cert.map(x=>x.integratedMs)),certifiedV3Ms:sum(cert.map(x=>x.v3Ms))}
  };
}
function cmpBoards(a,b){return a<b?-1:a>b?1:0;}

if(MODE==="shard"){
  const all=decodeFixture();
  const cases=all.filter((_,i)=>i%SHARD_TOTAL===SHARD_INDEX);
  const rows=[];
  for(const c of cases){
    const L=lines(c),C=config(c),expected=L.reduce((s,x)=>s+x.cant,0);
    const a=timed(()=>optimizarV10ConSafeFastPathCascade(L,C,nuevasMetricas()));
    const b=timed(()=>optimizarV10(L,{...C,safeFastPathCascadeExperimental:false,monotypeV2FrozenExperimental:false,monotypeRemnantFirstExperimental:false,guideRowR3MV4Experimental:false,guideRowR3MEarlyCertificationExperimental:false},nuevasMetricas()));
    const pa=a.value?.plan,pb=b.value?.plan;
    const validA=Boolean(a.ok&&pa&&validarPlanIndustrial(pa,expected)?.ok);
    const validB=Boolean(b.ok&&pb&&validarPlanIndustrial(pb,expected)?.ok);
    const ba=pa?.resumen?.placas??Infinity,bb=pb?.resumen?.placas??Infinity;
    const boardCmp=cmpBoards(ba,bb);
    const qcmp=validA&&validB&&boardCmp===0?compararCalidad(quality(pa,C),quality(pb,C)):null;
    const certified=Boolean(a.value?.safeCascade?.certified);
    const fallbackParity=!certified&&validA&&validB&&boardCmp===0&&qcmp===0&&digest(pa)===digest(pb);
    rows.push({id:c.id,route:a.value?.safeCascade?.route??(c.types.length===1?"MONOTYPE_V2":"R3M_V4"),certified,
      reason:a.value?.safeCascade?.reason??null,okA:a.ok,okB:b.ok,errorA:a.error,errorB:b.error,validA,validB,
      integratedBoards:Number.isFinite(ba)?ba:null,v3Boards:Number.isFinite(bb)?bb:null,leptonBoards:c.leptonBoards,
      boardCmp,qcmp,fallbackParity,digestEqual:validA&&validB?digest(pa)===digest(pb):false,
      integratedMs:a.ms,v3Ms:b.ms,aVsLepton:Number.isFinite(ba)?cmpBoards(ba,c.leptonBoards):null,
      bVsLepton:Number.isFinite(bb)?cmpBoards(bb,c.leptonBoards):null,
      naturalStates:a.value?.guideRowR3MV4?.naturalStates??null,
      riskPolishAttempted:Boolean(a.value?.guideRowR3MV4?.riskPolishAttempted),
      childWallMs:a.value?.monotypeV2Frozen?.wallMs??a.value?.guideRowR3MV4?.wallMs??null});
  }
  const file=path.join(HERE,`sealed-holdout-v2-fast-shard-${SHARD_INDEX}.json`);
  fs.writeFileSync(file,JSON.stringify({shard:SHARD_INDEX,total:SHARD_TOTAL,fixtureCases:all.length,rows})+"\n");
  console.log("SEALED_HOLDOUT_V2_SHARD "+JSON.stringify({shard:SHARD_INDEX,cases:rows.length,summary:summarize(rows)}));
} else if(MODE==="report"){
  const rows=[];
  for(let i=0;i<SHARD_TOTAL;i++){
    const p=path.join(HERE,`sealed-holdout-v2-fast-shard-${i}.json`);
    rows.push(...JSON.parse(fs.readFileSync(p,"utf8")).rows);
  }
  rows.sort((a,b)=>a.id-b.id);
  const out={status:"BLIND_FROZEN_RESULT",fixtureCases:rows.length,
    combined:summarize(rows),monotype:summarize(rows,"MONOTYPE_V2"),r3mV4:summarize(rows,"R3M_V4"),
    failureRows:rows.filter(x=>!x.validA||!x.validB||x.boardCmp>0||(x.boardCmp===0&&x.qcmp<0)||(!x.certified&&!x.fallbackParity)),
    boardWins:rows.filter(x=>x.boardCmp<0),remnantWins:rows.filter(x=>x.boardCmp===0&&x.qcmp>0),
    reasons:Object.fromEntries([...new Set(rows.map(x=>x.reason))].map(k=>[k,rows.filter(x=>x.reason===k).length]))};
  fs.writeFileSync(path.join(HERE,"SEALED_HOLDOUT_V2_FAST_BLIND_RESULT.json"),JSON.stringify(out,null,2)+"\n");
  console.log("SEALED_HOLDOUT_V2_FAST_RESULT "+JSON.stringify({combined:out.combined,monotype:out.monotype,r3mV4:out.r3mV4,reasons:out.reasons,failures:out.failureRows.length}));
  if(out.failureRows.length)process.exitCode=2;
} else throw new Error("mode must be shard or report");

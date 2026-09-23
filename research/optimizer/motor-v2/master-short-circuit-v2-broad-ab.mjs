import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import {createRequire} from "node:module";
import {runMasterShortCircuitV2,runFrozenV10,validarPlanIndustrial} from "./master-short-circuit-v2.mjs";
import {repetitionGate} from "./structural-repetition-rescue-v2.mjs";

const require=createRequire(import.meta.url);
const ROOT=path.resolve(new URL("../../../",import.meta.url).pathname);
const {calidadPlanPlacas,compararCalidad}=require(path.join(ROOT,"src/lib/optimizer/legacy/motor.cjs"));

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
const lines=c=>c.types.map((t,i)=>({base:t.w,altura:t.h,cant:t.q,veta:false,canRotate:true,ref:String(i),detalle:`M2-${c.id}-${i}`,cantos:null}));
const config=c=>({
  placaBase:c.width,placaAltura:c.height,refiladoX:0,refiladoY:0,sierra:c.saw,etapas:4,
  materialConVeta:false,descontarCanto:false,cantoEspesor:0,restoMin:250,restoMax:400,
  usarOneBoard:true,usarMaster:true,usarMultiSlice:true,usarCompactacion:true,usarRustPatternGenerator:true,
  usarCache:false,maxPiezasCache:0,rondasPatrones:40,msMaster:8000,maxNodosMaster:1600000,watchdogMasterMs:12000,
  usarCotaBarataPostCompactacion:true,usarDffFs0PostCompactacion:true,usarMascarasUnicasMasterLe4:true,
  minPiezasMultiSliceExperimental:200,maxPiezasMultiSliceExperimental:500,masterIndustrialRulesV3Experimental:true
});
function timed(fn){const t=process.hrtime.bigint();try{return {ok:true,value:fn(),ms:Number(process.hrtime.bigint()-t)/1e6,error:null};}catch(e){return {ok:false,value:null,ms:Number(process.hrtime.bigint()-t)/1e6,error:String(e?.stack||e)};}}
const cmp=(a,b)=>a<b?-1:a>b?1:0;
const quant=(a,q)=>{if(!a.length)return null;const s=a.slice().sort((x,y)=>x-y),i=(s.length-1)*q,l=Math.floor(i),h=Math.ceil(i);return l===h?s[l]:s[l]+(s[h]-s[l])*(i-l);};
const quality=(p,c)=>calidadPlanPlacas(p?.placas||[],p?.opts||c);
function summarize(rows){
  const sum=a=>a.reduce((s,x)=>s+x,0),same=rows.filter(r=>r.boardCmp===0),wins=rows.filter(r=>r.boardCmp<0);
  const mt=sum(rows.map(r=>r.motor2Ms)),bt=sum(rows.map(r=>r.betaMs));
  return {
    cases:rows.length,
    masterGate:rows.filter(r=>r.masterGate).length,
    shortCircuit:rows.filter(r=>r.shortCircuit).length,
    invalidMotor2:rows.filter(r=>!r.validMotor2).length,
    invalidBeta:rows.filter(r=>!r.validBeta).length,
    boardLoss:rows.filter(r=>r.boardCmp>0).length,
    boardWin:wins.length,
    boardsSaved:wins.reduce((s,r)=>s+(r.betaBoards-r.motor2Boards),0),
    remnantWorse:same.filter(r=>r.qcmp<0).length,
    remnantEqual:same.filter(r=>r.qcmp===0).length,
    remnantBetter:same.filter(r=>r.qcmp>0).length,
    vsLepton:{better:rows.filter(r=>r.motor2VsLepton<0).length,equal:rows.filter(r=>r.motor2VsLepton===0).length,worse:rows.filter(r=>r.motor2VsLepton>0).length},
    timing:{motor2TotalMs:mt,betaTotalMs:bt,savingPct:bt?100*(1-mt/bt):null,speedup:mt?bt/mt:null,
      motor2P50:quant(rows.map(r=>r.motor2Ms),.5),motor2P95:quant(rows.map(r=>r.motor2Ms),.95),motor2P99:quant(rows.map(r=>r.motor2Ms),.99),
      betaP50:quant(rows.map(r=>r.betaMs),.5),betaP95:quant(rows.map(r=>r.betaMs),.95),betaP99:quant(rows.map(r=>r.betaMs),.99)}
  };
}

if(MODE==="shard"){
  const all=decodeFixture();
  const eligible=all.filter(c=>repetitionGate(lines(c)).eligible);
  const cases=eligible.filter((_,i)=>i%ST===SI);
  const rows=[];
  for(const c of cases){
    const L=lines(c),C1=config(c),C2=config(c),expected=L.reduce((s,x)=>s+x.cant,0);
    const a=timed(()=>runMasterShortCircuitV2(L,C1));
    const b=timed(()=>runFrozenV10(L,C2));
    const pa=a.value?.plan,pb=b.value?.plan;
    const va=Boolean(a.ok&&pa&&validarPlanIndustrial(pa,expected)?.ok);
    const vb=Boolean(b.ok&&pb&&validarPlanIndustrial(pb,expected)?.ok);
    const ba=pa?.resumen?.placas??Infinity,bb=pb?.resumen?.placas??Infinity;
    const boardCmp=cmp(ba,bb);
    const qcmp=va&&vb&&boardCmp===0?compararCalidad(quality(pa,C1),quality(pb,C2)):null;
    const m=a.value?.structuralMasterV2||{};
    rows.push({
      id:c.id,types:c.types.length,pieces:expected,gcd:repetitionGate(L).gcd,leptonBoards:c.leptonBoards,
      validMotor2:va,validBeta:vb,motor2Boards:Number.isFinite(ba)?ba:null,betaBoards:Number.isFinite(bb)?bb:null,
      boardCmp,qcmp,motor2VsLepton:Number.isFinite(ba)?cmp(ba,c.leptonBoards):null,
      masterGate:Boolean(m.gate),shortCircuit:Boolean(m.shortCircuit),rescueMs:m.rescueMs??0,
      lb:m.lb??null,rescueBoards:m.boards??null,tests:m.tests??0,validMixed:m.validMixed??0,patterns:m.patterns??0,stopReason:m.stopReason??null,
      motor2Ms:a.ms,betaMs:b.ms,errorMotor2:a.error,errorBeta:b.error
    });
  }
  fs.writeFileSync(path.join(HERE,`master-short-circuit-v2-shard-${SI}.json`),JSON.stringify({shard:SI,total:ST,eligibleCases:eligible.length,rows})+"\n");
  console.log("MASTER_SHORT_CIRCUIT_SHARD "+JSON.stringify({shard:SI,cases:rows.length,eligible:eligible.length,summary:summarize(rows)}));
}else if(MODE==="report"){
  const rows=[];let eligibleCases=null;
  for(let i=0;i<ST;i++){const j=JSON.parse(fs.readFileSync(path.join(HERE,`master-short-circuit-v2-shard-${i}.json`),"utf8"));eligibleCases=j.eligibleCases;rows.push(...j.rows);}
  rows.sort((a,b)=>a.id-b.id);
  const summary=summarize(rows);
  const failures=rows.filter(r=>!r.validMotor2||!r.validBeta||r.boardCmp>0||(r.boardCmp===0&&r.qcmp<0));
  const wins=rows.filter(r=>r.boardCmp<0);
  const shorts=rows.filter(r=>r.shortCircuit);
  const out={status:failures.length||!(summary.timing.savingPct>0)?"FAIL":"PASS",eligibleCases,summary,failures,wins,shortCircuits:shorts};
  fs.writeFileSync(path.join(HERE,"MASTER_SHORT_CIRCUIT_V2_RESULT.json"),JSON.stringify(out,null,2)+"\n");
  console.log("MASTER_SHORT_CIRCUIT_RESULT "+JSON.stringify({status:out.status,summary,wins:wins.length,shortCircuits:shorts.length,failures:failures.length}));
  if(out.status!=="PASS")process.exitCode=2;
}else throw Error("mode");

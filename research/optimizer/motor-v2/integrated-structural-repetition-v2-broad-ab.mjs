import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import {
  runIntegratedStructuralRepetitionV2,
  runFrozenV10,
  validarPlanIndustrial,
  calidadPlanPlacas,
  compararCalidad
} from "./integrated-v10-structural-repetition-v2.mjs";
import { repetitionGate } from "./structural-repetition-rescue-v2.mjs";

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
const cmp=(a,b)=>a<b?-1:a>b?1:0;
function q(p,c){return calidadPlanPlacas(p?.placas||[],p?.opts||c);}
function quant(a,x){if(!a.length)return null;const s=a.slice().sort((a,b)=>a-b),i=(s.length-1)*x,l=Math.floor(i),h=Math.ceil(i);return l===h?s[l]:s[l]+(s[h]-s[l])*(i-l);}
function summarize(rows){
 const wins=rows.filter(r=>r.boardCmp<0),same=rows.filter(r=>r.boardCmp===0);
 const sum=a=>a.reduce((s,x)=>s+x,0);
 const rt=sum(rows.map(r=>r.routeMs)),bt=sum(rows.map(r=>r.betaMs));
 return {
  cases:rows.length,
  attempted:rows.filter(r=>r.attempted).length,
  accepted:rows.filter(r=>r.accepted).length,
  earlyReturn:rows.filter(r=>r.earlyReturn).length,
  invalidRoute:rows.filter(r=>!r.validRoute).length,
  invalidBeta:rows.filter(r=>!r.validBeta).length,
  boardLoss:rows.filter(r=>r.boardCmp>0).length,
  boardWin:wins.length,
  boardsSaved:wins.reduce((s,r)=>s+(r.betaBoards-r.routeBoards),0),
  remnantWorse:same.filter(r=>r.qcmp<0).length,
  remnantEqual:same.filter(r=>r.qcmp===0).length,
  remnantBetter:same.filter(r=>r.qcmp>0).length,
  vsLepton:{better:rows.filter(r=>r.routeVsLepton<0).length,equal:rows.filter(r=>r.routeVsLepton===0).length,worse:rows.filter(r=>r.routeVsLepton>0).length},
  timing:{routeTotalMs:rt,betaTotalMs:bt,savingPct:bt?100*(1-rt/bt):null,speedup:rt?bt/rt:null,
   routeP50:quant(rows.map(r=>r.routeMs),.5),routeP95:quant(rows.map(r=>r.routeMs),.95),routeP99:quant(rows.map(r=>r.routeMs),.99),
   betaP50:quant(rows.map(r=>r.betaMs),.5),betaP95:quant(rows.map(r=>r.betaMs),.95),betaP99:quant(rows.map(r=>r.betaMs),.99)}
 };
}
if(MODE==="shard"){
 const all=decodeFixture();
 const eligible=all.filter(c=>repetitionGate(lines(c)).eligible);
 const cases=eligible.filter((_,i)=>i%ST===SI);
 const rows=[];
 for(const c of cases){
  const L=lines(c),C=config(c),expected=L.reduce((s,x)=>s+x.cant,0);
  const a=timed(()=>runIntegratedStructuralRepetitionV2(L,C));
  const b=timed(()=>runFrozenV10(L,C));
  const pa=a.value?.plan,pb=b.value?.plan;
  const va=Boolean(a.ok&&pa&&validarPlanIndustrial(pa,expected)?.ok);
  const vb=Boolean(b.ok&&pb&&validarPlanIndustrial(pb,expected)?.ok);
  const ba=pa?.resumen?.placas??Infinity,bb=pb?.resumen?.placas??Infinity;
  const boardCmp=cmp(ba,bb);
  const qcmp=va&&vb&&boardCmp===0?compararCalidad(q(pa,C),q(pb,C)):null;
  const s=a.value?.structural||{};
  rows.push({
    id:c.id,types:c.types.length,pieces:expected,gcd:repetitionGate(L).gcd,leptonBoards:c.leptonBoards,
    validRoute:va,validBeta:vb,routeBoards:Number.isFinite(ba)?ba:null,betaBoards:Number.isFinite(bb)?bb:null,
    boardCmp,qcmp,routeVsLepton:Number.isFinite(ba)?cmp(ba,c.leptonBoards):null,
    attempted:Boolean(s.attempted),accepted:Boolean(s.accepted),earlyReturn:Boolean(s.earlyReturn),
    reason:s.reason||null,lb:s.lb??null,baselineBoards:s.baselineBoards??null,candidateBoards:s.candidateBoards??null,
    tests:s.tests??0,validMixed:s.validMixed??0,stopReason:s.stopReason??null,polishChanged:Boolean(s.polishChanged),
    routeMs:a.ms,betaMs:b.ms,baselineMs:s.baselineMs??null,rescueMs:s.rescueMs??0,polishMs:s.polishMs??0,continuationMs:s.continuationMs??0,
    errorRoute:a.error,errorBeta:b.error
  });
 }
 fs.writeFileSync(path.join(HERE,`integrated-structural-v2-shard-${SI}.json`),JSON.stringify({shard:SI,total:ST,eligibleCases:eligible.length,rows})+"\n");
 console.log("INTEGRATED_STRUCTURAL_SHARD "+JSON.stringify({shard:SI,cases:rows.length,eligible:eligible.length,summary:summarize(rows)}));
}else if(MODE==="report"){
 const rows=[];let eligibleCases=null;
 for(let i=0;i<ST;i++){const j=JSON.parse(fs.readFileSync(path.join(HERE,`integrated-structural-v2-shard-${i}.json`),"utf8"));eligibleCases=j.eligibleCases;rows.push(...j.rows);}
 rows.sort((a,b)=>a.id-b.id);
 const summary=summarize(rows);
 const failures=rows.filter(r=>!r.validRoute||!r.validBeta||r.boardCmp>0||(r.boardCmp===0&&r.qcmp<0));
 const wins=rows.filter(r=>r.boardCmp<0);
 const out={status:failures.length||!(summary.timing.savingPct>0)?"FAIL":"PASS",eligibleCases,summary,failures,wins,
  reasons:Object.fromEntries([...new Set(rows.map(r=>r.reason))].map(k=>[k,rows.filter(r=>r.reason===k).length]))};
 fs.writeFileSync(path.join(HERE,"INTEGRATED_STRUCTURAL_REPETITION_V2_RESULT.json"),JSON.stringify(out,null,2)+"\n");
 console.log("INTEGRATED_STRUCTURAL_RESULT "+JSON.stringify({status:out.status,summary,wins:wins.length,failures:failures.length,reasons:out.reasons}));
 if(out.status!=="PASS")process.exitCode=2;
}else throw Error("mode");

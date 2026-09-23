import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import {
  runMasterStructuralShortCircuitV2,
  runFrozenV10,
  validarPlanIndustrial,
  calidadPlanPlacas,
  compararCalidad
} from "./master-structural-shortcircuit-v2.mjs";

process.env.OPTIMIZER_RUST_BEAM_RANK_CACHE_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_LEAN_BEAM_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_GREEDY_PLAN_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_LARGE_ROUND_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_SIMPLE_CHOOSE_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_MASTER_ROUND_REUSE_EXPERIMENTAL="0";
process.env.OPTIMIZER_MASTER_UNIQUE_MASKS_LE4_EXPERIMENTAL="1";

const HERE=path.dirname(new URL(import.meta.url).pathname);
const FIX=path.resolve(HERE,"../holdout-v2-fixture");
const TARGET_IDS=new Set([
  5432432,5441129,5447933,5451086,5461490,5468649,5474506,5482541,5492016,
  5493322,5504203,5504346,5515640,5521519,5526822,5526837,5526845,5531829
]);

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
    if(TARGET_IDS.has(id))out.push({id,width,height,saw,leptonBoards,types});
  }
  return out;
}
const lines=c=>c.types.map((t,i)=>({base:t.w,altura:t.h,cant:t.q,veta:false,canRotate:true,ref:String(i),detalle:`PERF-${c.id}-${i}`,cantos:null}));
const config=c=>({
  placaBase:c.width,placaAltura:c.height,refiladoX:0,refiladoY:0,sierra:c.saw,etapas:4,
  materialConVeta:false,descontarCanto:false,cantoEspesor:0,restoMin:250,restoMax:400,
  usarOneBoard:true,usarMaster:true,usarMultiSlice:true,usarCompactacion:true,usarRustPatternGenerator:true,
  usarCache:false,maxPiezasCache:0,rondasPatrones:40,msMaster:8000,maxNodosMaster:1600000,watchdogMasterMs:12000,
  usarCotaBarataPostCompactacion:true,usarDffFs0PostCompactacion:true,usarMascarasUnicasMasterLe4:true,
  minPiezasMultiSliceExperimental:200,maxPiezasMultiSliceExperimental:500,masterIndustrialRulesV3Experimental:true
});
function timed(fn){
  const t=process.hrtime.bigint();
  try{return {ok:true,value:fn(),ms:Number(process.hrtime.bigint()-t)/1e6,error:null};}
  catch(e){return {ok:false,value:null,ms:Number(process.hrtime.bigint()-t)/1e6,error:String(e?.stack||e)};}
}
const median=a=>{const s=a.slice().sort((x,y)=>x-y),n=s.length;return n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2;};
const quant=(a,q)=>{if(!a.length)return null;const s=a.slice().sort((x,y)=>x-y),i=(s.length-1)*q,l=Math.floor(i),h=Math.ceil(i);return l===h?s[l]:s[l]+(s[h]-s[l])*(i-l);};
const cmp=(a,b)=>a<b?-1:a>b?1:0;
const quality=(p,c)=>calidadPlanPlacas(p?.placas||[],p?.opts||c);

const cases=decodeFixture().sort((a,b)=>a.id-b.id);
if(cases.length!==TARGET_IDS.size)throw Error(`fixture target mismatch ${cases.length}/${TARGET_IDS.size}`);

const warm=cases[0],WL=lines(warm),WC=config(warm);
runFrozenV10(WL,WC); runMasterStructuralShortCircuitV2(WL,WC);

const rows=[];
for(const c of cases){
  const L=lines(c),C=config(c),expected=L.reduce((s,x)=>s+x.cant,0);
  const routeTimes=[],betaTimes=[];
  let routePlan=null,betaPlan=null,structural=null;
  for(let rep=0;rep<4;rep++){
    const order=rep%2===0?["route","beta"]:["beta","route"];
    for(const arm of order){
      if(arm==="route"){
        const r=timed(()=>runMasterStructuralShortCircuitV2(L,C));
        if(!r.ok)throw Error(`route ${c.id}: ${r.error}`);
        routeTimes.push(r.ms); routePlan=r.value.plan; structural=r.value.structuralMaster||null;
      }else{
        const r=timed(()=>runFrozenV10(L,C));
        if(!r.ok)throw Error(`beta ${c.id}: ${r.error}`);
        betaTimes.push(r.ms); betaPlan=r.value.plan;
      }
    }
  }
  const vr=Boolean(validarPlanIndustrial(routePlan,expected)?.ok),vb=Boolean(validarPlanIndustrial(betaPlan,expected)?.ok);
  const rb=routePlan?.resumen?.placas??Infinity,bb=betaPlan?.resumen?.placas??Infinity;
  const boardCmp=cmp(rb,bb),qcmp=vr&&vb&&boardCmp===0?compararCalidad(quality(routePlan,C),quality(betaPlan,C)):null;
  rows.push({
    id:c.id,leptonBoards:c.leptonBoards,pieces:expected,types:c.types.length,
    routeBoards:rb,betaBoards:bb,boardCmp,qcmp,validRoute:vr,validBeta:vb,
    structuralAttempted:Boolean(structural?.attempted),shortCircuit:Boolean(structural?.shortCircuit),
    structuralTests:structural?.tests??0,structuralMs:structural?.ms??0,
    routeTimes,betaTimes,routeMedianMs:median(routeTimes),betaMedianMs:median(betaTimes)
  });
  console.log("CASE "+JSON.stringify(rows.at(-1)));
}
const affected=rows.filter(r=>r.structuralAttempted);
const rt=affected.reduce((s,r)=>s+r.routeMedianMs,0),bt=affected.reduce((s,r)=>s+r.betaMedianMs,0);
const wins=affected.filter(r=>r.boardCmp<0),same=affected.filter(r=>r.boardCmp===0);
const summary={
  targetCases:rows.length,affectedCases:affected.length,shortCircuits:affected.filter(r=>r.shortCircuit).length,
  invalidRoute:affected.filter(r=>!r.validRoute).length,invalidBeta:affected.filter(r=>!r.validBeta).length,
  boardLoss:affected.filter(r=>r.boardCmp>0).length,boardWin:wins.length,
  boardsSaved:wins.reduce((s,r)=>s+r.betaBoards-r.routeBoards,0),
  remnantWorse:same.filter(r=>r.qcmp<0).length,remnantEqual:same.filter(r=>r.qcmp===0).length,remnantBetter:same.filter(r=>r.qcmp>0).length,
  routeMedianTotalMs:rt,betaMedianTotalMs:bt,savingPct:bt?100*(1-rt/bt):null,speedup:rt?bt/rt:null,
  fasterCases:affected.filter(r=>r.routeMedianMs<r.betaMedianMs).length,
  routeP50:quant(affected.map(r=>r.routeMedianMs),.5),routeP95:quant(affected.map(r=>r.routeMedianMs),.95),routeP99:quant(affected.map(r=>r.routeMedianMs),.99),
  betaP50:quant(affected.map(r=>r.betaMedianMs),.5),betaP95:quant(affected.map(r=>r.betaMedianMs),.95),betaP99:quant(affected.map(r=>r.betaMedianMs),.99)
};
const out={status:summary.invalidRoute===0&&summary.invalidBeta===0&&summary.boardLoss===0&&summary.remnantWorse===0&&summary.boardWin>=2&&summary.boardsSaved>=16&&summary.savingPct>0?"PASS":"FAIL",summary,rows};
fs.writeFileSync(path.join(HERE,"MASTER_STRUCTURAL_V2_SERIAL_PERF_RESULT.json"),JSON.stringify(out,null,2)+"\n");
console.log("SUMMARY "+JSON.stringify(out));
if(out.status!=="PASS")process.exitCode=2;

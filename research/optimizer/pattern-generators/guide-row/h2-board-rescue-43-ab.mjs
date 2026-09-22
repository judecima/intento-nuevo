import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { optimizarV10ConH2BoardRescue } from "./integrated-v10-h2-board-rescue.mjs";

const require=createRequire(import.meta.url);
const ROOT=path.resolve(new URL("../../../../",import.meta.url).pathname);
const HERE=path.dirname(new URL(import.meta.url).pathname);
const FIXTURE=path.join(HERE,"fixtures/HISTORICAL_43_LEPTON_GAPS.json.gz.b64");

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
    veta:Boolean(t.locked),canRotate:!Boolean(t.locked),
    ref:String(i),detalle:String(t.ref??i),cantos:null,
  }));
}
function config(c,rescue){
  return {
    placaBase:+c.width,placaAltura:+c.height,
    refiladoX:0,refiladoY:0,sierra:+c.saw,etapas:4,
    materialConVeta:Boolean(c.directional),
    descontarCanto:false,cantoEspesor:0,restoMin:250,restoMax:400,
    usarOneBoard:true,usarMaster:true,usarMultiSlice:true,usarCompactacion:true,
    usarRustPatternGenerator:true,usarCache:false,maxPiezasCache:0,
    rondasPatrones:40,msMaster:8000,maxNodosMaster:1600000,watchdogMasterMs:12000,
    usarCotaBarataPostCompactacion:true,usarDffFs0PostCompactacion:true,
    usarMascarasUnicasMasterLe4:true,
    minPiezasMultiSliceExperimental:200,maxPiezasMultiSliceExperimental:500,
    masterIndustrialRulesV3Experimental:true,
    guideRowH2BoardRescueExperimental:rescue,
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
function quality(plan,C){return calidadPlanPlacas(plan?.placas||[],plan?.opts||C);}
function timed(fn){
  const t0=process.hrtime.bigint(),c0=process.cpuUsage();
  try{
    const value=fn(),d=process.cpuUsage(c0);
    return {ok:true,value,wallMs:Number(process.hrtime.bigint()-t0)/1e6,cpuMs:(d.user+d.system)/1000,error:null};
  }catch(e){
    const d=process.cpuUsage(c0);
    return {ok:false,value:null,wallMs:Number(process.hrtime.bigint()-t0)/1e6,cpuMs:(d.user+d.system)/1000,error:String(e?.stack||e)};
  }
}
function quant(xs,p){
  const a=xs.filter(Number.isFinite).slice().sort((x,y)=>x-y);
  if(!a.length)return null;
  const z=(a.length-1)*p,l=Math.floor(z),h=Math.ceil(z);
  return l===h?a[l]:a[l]+(a[h]-a[l])*(z-l);
}

const rows=[];
const counts={
  cases:0,invalidRescue:0,invalidReference:0,
  attempted:0,accepted:0,notAttemptedAtLb:0,
  boardLosses:0,boardWins:0,boardsSaved:0,
  equalBoardQualityMismatch:0,
  leptonGapClosed:0,leptonStillGap:0,
};

for(const c of loadCases()){
  counts.cases++;
  const ls=lines(c),expected=ls.reduce((s,l)=>s+l.cant,0);
  const C=config(c,true);

  const ar=timed(()=>optimizarV10ConH2BoardRescue(ls,C,nuevasMetricas()));
  const rr=timed(()=>optimizarV10(ls,{...C,guideRowH2BoardRescueExperimental:false},nuevasMetricas()));

  const a=ar.value?.plan,b=rr.value?.plan;
  if(!ar.ok||!a||!validarPlanIndustrial(a,expected)?.ok||!demandOk(a,ls)){
    counts.invalidRescue++;
    rows.push({order:c.order,class:"INVALID_RESCUE",error:ar.error});
    continue;
  }
  if(!rr.ok||!b||!validarPlanIndustrial(b,expected)?.ok||!demandOk(b,ls)){
    counts.invalidReference++;
    rows.push({order:c.order,class:"INVALID_REFERENCE",error:rr.error});
    continue;
  }

  const meta=ar.value.h2BoardRescue;
  if(meta?.attempted)counts.attempted++;
  if(meta?.accepted)counts.accepted++;
  if(meta?.reason==="V3_AT_SAFE_LB")counts.notAttemptedAtLb++;

  const ab=a.resumen.placas,bb=b.resumen.placas;
  let cls;
  if(ab>bb){cls="BOARD_LOSS";counts.boardLosses++;}
  else if(ab<bb){
    cls="BOARD_WIN";counts.boardWins++;
    counts.boardsSaved+=bb-ab;
  }else{
    cls="EQUAL";
    if(compararCalidad(quality(a,C),quality(b,C))!==0)counts.equalBoardQualityMismatch++;
  }

  if(ab<=c.leptonBoards)counts.leptonGapClosed++;
  else counts.leptonStillGap++;

  rows.push({
    order:c.order,
    class:cls,
    lepton:c.leptonBoards,
    referenceBoards:bb,
    rescueBoards:ab,
    lowerBound:rr.value?.cota??null,
    attempted:Boolean(meta?.attempted),
    accepted:Boolean(meta?.accepted),
    reason:meta?.reason,
    h2Ms:meta?.h2Ms??0,
    rescueWallMs:ar.wallMs,
    referenceWallMs:rr.wallMs,
    structuralFp:c.structuralFp,
  });
}

const sum=xs=>xs.reduce((s,x)=>s+(Number.isFinite(x)?x:0),0);
const rescueTotal=sum(rows.map(r=>r.rescueWallMs));
const referenceTotal=sum(rows.map(r=>r.referenceWallMs));
const h2Extra=sum(rows.map(r=>r.h2Ms));
const out={
  counts,
  timing:{
    rescueTotalMs:rescueTotal,
    referenceTotalMs:referenceTotal,
    h2ExtraMs:h2Extra,
    overheadPct:referenceTotal?100*(rescueTotal/referenceTotal-1):null,
    rescueP50:quant(rows.map(r=>r.rescueWallMs),.5),
    referenceP50:quant(rows.map(r=>r.referenceWallMs),.5),
    rescueP95:quant(rows.map(r=>r.rescueWallMs),.95),
    referenceP95:quant(rows.map(r=>r.referenceWallMs),.95),
  },
  wins:rows.filter(r=>r.class==="BOARD_WIN"),
  rows,
};

fs.writeFileSync(path.join(HERE,"h2-board-rescue-43-results.json"),JSON.stringify(out,null,2)+"\n");
console.log("H2_BOARD_RESCUE_43 "+JSON.stringify({counts:out.counts,timing:out.timing}));
console.log("H2_BOARD_RESCUE_WINS "+JSON.stringify(out.wins));

if(
  counts.invalidRescue ||
  counts.invalidReference ||
  counts.boardLosses ||
  counts.equalBoardQualityMismatch
)process.exitCode=2;

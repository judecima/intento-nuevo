import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { buildGuideRowCandidate } from "./complete-candidate.mjs";

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
    base:+t.w,
    altura:+t.h,
    cant:+t.q,
    veta:Boolean(t.locked),
    canRotate:!Boolean(t.locked),
    ref:String(i),
    detalle:String(t.ref??i),
    cantos:null,
  }));
}

function config(c){
  return {
    placaBase:+c.width,
    placaAltura:+c.height,
    refiladoX:0,
    refiladoY:0,
    sierra:+c.saw,
    etapas:4,
    materialConVeta:Boolean(c.directional),
    descontarCanto:false,
    cantoEspesor:0,
    restoMin:250,
    restoMax:400,
    usarOneBoard:true,
    usarMaster:true,
    usarMultiSlice:true,
    usarCompactacion:true,
    usarRustPatternGenerator:true,
    usarCache:false,
    maxPiezasCache:0,
    rondasPatrones:40,
    msMaster:8000,
    maxNodosMaster:1600000,
    watchdogMasterMs:12000,
    usarCotaBarataPostCompactacion:true,
    usarDffFs0PostCompactacion:true,
    usarMascarasUnicasMasterLe4:true,
    minPiezasMultiSliceExperimental:200,
    maxPiezasMultiSliceExperimental:500,
    masterIndustrialRulesV3Experimental:true,
  };
}

function demandOk(plan,ls){
  const expected=new Map(ls.map((l,i)=>[String(l.ref??i),Number(l.cant||0)]));
  const actual=new Map();
  for(const b of plan?.placas||[])for(const p of b.colocadas||[]){
    const k=String(p?.pieza?.ref);
    actual.set(k,(actual.get(k)||0)+1);
  }
  if(expected.size!==actual.size)return false;
  for(const [k,v] of expected)if(actual.get(k)!==v)return false;
  return true;
}

function quality(plan,C){
  return calidadPlanPlacas(plan?.placas||[],plan?.opts||C);
}

function timed(fn){
  const t0=process.hrtime.bigint();
  const c0=process.cpuUsage();
  try{
    const value=fn();
    const d=process.cpuUsage(c0);
    return {
      ok:true,
      value,
      wallMs:Number(process.hrtime.bigint()-t0)/1e6,
      cpuMs:(d.user+d.system)/1000,
      error:null,
    };
  }catch(error){
    const d=process.cpuUsage(c0);
    return {
      ok:false,
      value:null,
      wallMs:Number(process.hrtime.bigint()-t0)/1e6,
      cpuMs:(d.user+d.system)/1000,
      error:String(error?.stack||error?.message||error),
    };
  }
}

const cases=loadCases();
const rows=[];
const summary={
  cases:cases.length,
  uniqueStructural:new Set(cases.map(c=>c.structuralFp)).size,
  candidateErrors:0,
  invalidCandidates:0,
  referenceErrors:0,
  closesGap:0,
  improvesButGap:0,
  sameAsV3:0,
  boardRegression:0,
  equalBoardRemnantWorse:0,
  equalBoardRemnantEqual:0,
  equalBoardRemnantBetter:0,
  directional:0,
  nondirectional:0,
};

for(const c of cases){
  if(c.directional)summary.directional++;else summary.nondirectional++;
  const ls=lines(c),C=config(c),expected=ls.reduce((s,l)=>s+l.cant,0);

  const hr=timed(()=>buildGuideRowCandidate(ls,C));
  const candidate=hr.value?.plan||null;
  if(!hr.ok||!candidate){
    summary.candidateErrors++;
    rows.push({order:c.order,class:"CANDIDATE_ERROR",error:hr.error,h2Ms:hr.wallMs});
    continue;
  }
  if(!validarPlanIndustrial(candidate,expected)?.ok||!demandOk(candidate,ls)){
    summary.invalidCandidates++;
    rows.push({order:c.order,class:"INVALID_CANDIDATE",h2Ms:hr.wallMs});
    continue;
  }

  const rr=timed(()=>optimizarV10(ls,C,nuevasMetricas()));
  const ref=rr.value?.plan||null;
  if(!rr.ok||!ref||!validarPlanIndustrial(ref,expected)?.ok||!demandOk(ref,ls)){
    summary.referenceErrors++;
    rows.push({order:c.order,class:"REFERENCE_ERROR",error:rr.error,h2Ms:hr.wallMs,v3Ms:rr.wallMs});
    continue;
  }

  const cb=candidate.resumen.placas;
  const rb=ref.resumen.placas;
  const cq=quality(candidate,C);
  const rq=quality(ref,C);
  let cls;

  if(cb>rb){
    cls="BOARD_REGRESSION";
    summary.boardRegression++;
  }else if(cb<=c.leptonBoards){
    cls="CLOSES_GAP";
    summary.closesGap++;
  }else if(cb<rb){
    cls="IMPROVES_BUT_GAP";
    summary.improvesButGap++;
  }else{
    cls="SAME_AS_V3";
    summary.sameAsV3++;
    const qcmp=compararCalidad(cq,rq);
    if(qcmp<0)summary.equalBoardRemnantWorse++;
    else if(qcmp>0)summary.equalBoardRemnantBetter++;
    else summary.equalBoardRemnantEqual++;
  }

  rows.push({
    order:c.order,
    structuralFp:c.structuralFp,
    directional:c.directional,
    pieces:c.pieces,
    typeCount:c.typeCount,
    leptonBoards:c.leptonBoards,
    storedV3Boards:c.v3Boards,
    currentV3Boards:rb,
    v3Cota:c.v3Cota,
    h2Boards:cb,
    class:cls,
    h2Quality:cq,
    v3Quality:rq,
    qualityCmpSameBoards:cb===rb?compararCalidad(cq,rq):null,
    naturalStates:hr.value?.telemetry?.residual?.naturalStates??null,
    rawStates:hr.value?.telemetry?.residual?.rawStates??null,
    h2Ms:hr.wallMs,
    v3Ms:rr.wallMs,
  });
}

const closed=rows.filter(r=>r.class==="CLOSES_GAP");
const closedFps=new Set(closed.map(r=>r.structuralFp));
const still=rows.filter(r=>["SAME_AS_V3","IMPROVES_BUT_GAP","BOARD_REGRESSION"].includes(r.class));
const out={
  summary:{
    ...summary,
    uniqueClosedStructural:closedFps.size,
    remainingGapCases:still.length,
    remainingStructural:new Set(still.map(r=>r.structuralFp)).size,
    h2TotalMs:rows.reduce((s,r)=>s+(Number(r.h2Ms)||0),0),
    v3TotalMs:rows.reduce((s,r)=>s+(Number(r.v3Ms)||0),0),
  },
  closed:closed.map(r=>({order:r.order,structuralFp:r.structuralFp,lepton:r.leptonBoards,v3:r.currentV3Boards,h2:r.h2Boards,h2Ms:r.h2Ms,v3Ms:r.v3Ms})),
  rows,
};
fs.writeFileSync(path.join(HERE,"historical-43-gap-h2-results.json"),JSON.stringify(out,null,2)+"\n");
console.log("HISTORICAL_43_GAP_H2 "+JSON.stringify(out.summary));
console.log("HISTORICAL_43_CLOSED "+JSON.stringify(out.closed));

if(
  summary.candidateErrors ||
  summary.invalidCandidates ||
  summary.referenceErrors ||
  summary.boardRegression ||
  summary.equalBoardRemnantWorse
)process.exitCode=2;

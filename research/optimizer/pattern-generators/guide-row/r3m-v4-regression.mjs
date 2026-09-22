import { createRequire } from "node:module";
import { optimizarV10ConGuideRowR3MV4 } from "./integrated-v10-r3m-v4.mjs";

const require=createRequire(import.meta.url);
const {
  optimizarV10,
  nuevasMetricas,
  validarPlanIndustrial,
}=require("../../../../src/lib/optimizer/legacy/v10.cjs");
const {
  calidadPlanPlacas,
  compararCalidad,
}=require("../../../../src/lib/optimizer/legacy/motor.cjs");

const CASES=[
  {id:5344286,board:[2750,1830],saw:5.0,types:[[600,500,3],[2080,778,1]]},
  {id:5362238,board:[2750,1850],saw:5.0,types:[[492,432,10],[1862,572,2]]},
  {id:5407018,board:[3000,1200],saw:4.4,types:[[350,300,8],[2100,832,1]]},
  {id:5344296,board:[2750,1830],saw:5.0,types:[[600,500,3],[2080,778,1]]},
  {id:5412222,board:[2750,910],saw:5.0,types:[[600,200,4],[938,368,4]]},
  {id:5412225,board:[2750,910],saw:5.0,types:[[600,200,4],[938,368,4]]},
  {id:5412236,board:[2750,910],saw:5.0,types:[[600,200,4],[938,368,4]]},
  {id:5352071,board:[2440,1220],saw:4.4,types:[[1982,61,4],[1146,945,2]]},
  {id:5337979,board:[2440,1220],saw:4.5,types:[[730,249.6,4],[2099,549,1]]},
  {id:5403827,board:[2440,1220],saw:4.5,types:[[2085,123,1],[2089.2,447.2,1],[2400,599.6,1]]},
];

function lines(c){
  return c.types.map((t,i)=>({
    base:t[0],
    altura:t[1],
    cant:t[2],
    veta:false,
    canRotate:true,
    ref:String(i),
    detalle:String(i),
    cantos:null,
  }));
}

function config(c,flag=true){
  return {
    placaBase:c.board[0],
    placaAltura:c.board[1],
    refiladoX:0,
    refiladoY:0,
    sierra:c.saw,
    etapas:4,
    materialConVeta:false,
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
    guideRowR3MV4Experimental:flag,
  };
}

function quality(plan,C){
  return calidadPlanPlacas(plan?.placas||[],plan?.opts||C);
}

function timed(fn){
  const t0=process.hrtime.bigint();
  const value=fn();
  return {value,wallMs:Number(process.hrtime.bigint()-t0)/1e6};
}

const rows=[];
let invalid=0,boardLoss=0,remnantWorse=0,remnantEqual=0,remnantBetter=0;
let candidateMs=0,referenceMs=0;

for(const c of CASES){
  const L=lines(c),C=config(c,true);
  const pieces=L.reduce((s,l)=>s+l.cant,0);

  const ir=timed(()=>optimizarV10ConGuideRowR3MV4(L,C,nuevasMetricas()));
  const rr=timed(()=>optimizarV10(L,{...C,guideRowR3MV4Experimental:false},nuevasMetricas()));

  candidateMs+=ir.wallMs;
  referenceMs+=rr.wallMs;

  const a=ir.value.plan,b=rr.value.plan;
  if(!ir.value.guideRowR3MV4?.certified)
    throw new Error("Expected v4 certification for "+c.id+" got "+ir.value.guideRowR3MV4?.reason);
  if(!validarPlanIndustrial(a,pieces)?.ok){
    invalid++;
  }

  const qa=quality(a,C),qb=quality(b,C);
  let cls,qcmp=null;
  if(a.resumen.placas>b.resumen.placas){
    cls="BOARD_LOSS";
    boardLoss++;
  }else if(a.resumen.placas<b.resumen.placas){
    cls="BOARD_WIN";
  }else{
    qcmp=compararCalidad(qa,qb);
    if(qcmp<0){cls="REMNANT_WORSE";remnantWorse++;}
    else if(qcmp>0){cls="REMNANT_BETTER";remnantBetter++;}
    else{cls="REMNANT_EQUAL";remnantEqual++;}
  }

  rows.push({
    id:c.id,
    cls,
    qcmp,
    candidateBoards:a.resumen.placas,
    referenceBoards:b.resumen.placas,
    candidateQuality:qa,
    referenceQuality:qb,
    riskPolishAttempted:ir.value.guideRowR3MV4.riskPolishAttempted,
    candidateMs:ir.wallMs,
    referenceMs:rr.wallMs,
  });
}

const summary={
  cases:CASES.length,
  invalid,
  boardLoss,
  remnantWorse,
  remnantEqual,
  remnantBetter,
  candidateMs,
  referenceMs,
  savingPct:referenceMs>0?(1-candidateMs/referenceMs)*100:null,
  speedup:candidateMs>0?referenceMs/candidateMs:null,
};

console.log("R3M_V4_REGRESSION "+JSON.stringify({summary,rows}));

if(invalid||boardLoss||remnantWorse)process.exitCode=2;

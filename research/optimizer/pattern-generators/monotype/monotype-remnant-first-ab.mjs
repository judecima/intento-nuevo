import { createRequire } from "node:module";
import { optimizarV10ConMonotypeRemnantFirst } from "./integrated-v10-monotype-remnant-first.mjs";

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
  // Original R2 monotype counterexamples.
  {id:5273448,board:[2600,1830],saw:4.5,qty:68,piece:[300,200]},
  {id:5326719,board:[2750,1830],saw:4.4,qty:12,piece:[644,560]},

  // Only raw candidate board-count loss in the 1,724-case mining cohort.
  {id:5245005,board:[2400,1220],saw:4.5,qty:97,piece:[145,380],expectFallback:true},

  // Equal-board remnant improvements discovered in the mining cohort.
  {id:5284937,board:[2600,1830],saw:4.4,qty:6,piece:[360,750]},
  {id:5287811,board:[2440,1220],saw:4.5,qty:24,piece:[300,366]},
  {id:5289644,board:[2440,1220],saw:4.5,qty:8,piece:[240,900]},
  {id:5291267,board:[2840,1220],saw:4.5,qty:6,piece:[294,808]},
  {id:5305265,board:[2600,1830],saw:4.4,qty:2,piece:[500,1500]},
  {id:5306739,board:[2750,1830],saw:4.5,qty:126,piece:[150,400]},
  {id:5228357,board:[2750,1830],saw:4.5,qty:250,piece:[70,120]},
  {id:5232998,board:[2750,1830],saw:4.5,qty:250,piece:[70,120]},
  {id:5238832,board:[3660,1830],saw:4.5,qty:16,piece:[390,890]},
  {id:5244295,board:[2750,1830],saw:4.5,qty:5,piece:[700,1500]},
  {id:5252856,board:[2750,1830],saw:4.5,qty:250,piece:[70,120]},
  {id:5269828,board:[2750,1850],saw:4.5,qty:2,piece:[700,1500]},
  {id:5271707,board:[2440,1220],saw:4.5,qty:2,piece:[280,770]},
  {id:5271713,board:[2440,1220],saw:4.5,qty:2,piece:[280,770]},
  {id:5271731,board:[2440,1220],saw:4.5,qty:2,piece:[280,770]},
  {id:5323930,board:[2440,1220],saw:4.5,qty:88,piece:[145,380]},
  {id:5327142,board:[2800,2070],saw:4.5,qty:2,piece:[399,1748]},
  {id:5327787,board:[2440,1220],saw:4.5,qty:2,piece:[199.2,769.2]},
  {id:5327892,board:[2800,2070],saw:4.5,qty:2,piece:[400,1750]},
  {id:5327902,board:[2800,2070],saw:4.5,qty:2,piece:[400,1750]},
  // Area LB is weak here, but the existing Hybrid LB certifies the 2-board candidate.
  {id:5329174,board:[2750,1830],saw:4.5,qty:7,piece:[460,1500]},
  {id:5330941,board:[2590,1820],saw:4.5,qty:6,piece:[500,673]},
];

function lines(c){
  return [{
    base:c.piece[0],
    altura:c.piece[1],
    cant:c.qty,
    veta:false,
    canRotate:true,
    ref:1,
    detalle:"MONO",
    cantos:null,
  }];
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
    usarCache:false,
    maxPiezasCache:0,
    minPiezasMultiSliceExperimental:200,
    masterIndustrialRulesV3Experimental:true,
    monotypeRemnantFirstExperimental:flag,
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
let certified=0,fallback=0,boardLoss=0,remnantWorse=0,remnantEqual=0,remnantBetter=0,invalid=0;
let integratedMs=0,referenceMs=0;

for(const c of CASES){
  const L=lines(c),C=config(c,true);
  const ir=timed(()=>optimizarV10ConMonotypeRemnantFirst(L,C,nuevasMetricas()));
  const rr=timed(()=>optimizarV10(L,{...C,monotypeRemnantFirstExperimental:false},nuevasMetricas()));
  integratedMs+=ir.wallMs;
  referenceMs+=rr.wallMs;

  const a=ir.value.plan,b=rr.value.plan;
  const va=validarPlanIndustrial(a,c.qty);
  if(!va?.ok) invalid++;

  const cert=Boolean(ir.value.monotypeRemnantFirst?.certified);
  if(cert) certified++; else fallback++;

  const qa=quality(a,C),qb=quality(b,C);
  let cls,qcmp=null;
  if(a.resumen.placas>b.resumen.placas){cls="BOARD_LOSS";boardLoss++;}
  else if(a.resumen.placas<b.resumen.placas){cls="BOARD_WIN";}
  else{
    qcmp=compararCalidad(qa,qb);
    if(qcmp<0){cls="REMNANT_WORSE";remnantWorse++;}
    else if(qcmp>0){cls="REMNANT_BETTER";remnantBetter++;}
    else{cls="REMNANT_EQUAL";remnantEqual++;}
  }

  if(Boolean(c.expectFallback)===cert){
    throw new Error(
      "Unexpected certification state for "+c.id+
      ": certified="+cert+" expectedFallback="+Boolean(c.expectFallback)
    );
  }

  rows.push({
    id:c.id,
    certified:cert,
    reason:ir.value.monotypeRemnantFirst?.reason,
    cls,
    integratedBoards:a.resumen.placas,
    referenceBoards:b.resumen.placas,
    qcmp,
    qa,
    qb,
    integratedMs:ir.wallMs,
    referenceMs:rr.wallMs,
  });
}

const summary={
  cases:CASES.length,
  certified,
  fallback,
  invalid,
  boardLoss,
  remnantWorse,
  remnantEqual,
  remnantBetter,
  integratedMs,
  referenceMs,
  savingPct:referenceMs>0?(1-integratedMs/referenceMs)*100:null,
  speedup:integratedMs>0?referenceMs/integratedMs:null,
};

console.log("MONOTYPE_AB "+JSON.stringify({summary,rows}));

if(invalid||boardLoss||remnantWorse) process.exitCode=2;

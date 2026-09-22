import { createRequire } from "node:module";
import { buildGuideRowCandidate } from "./complete-candidate.mjs";

const require=createRequire(import.meta.url);
const {
  optimizar,
  calidadPlanPlacas,
  compararCalidad,
}=require("../../../../src/lib/optimizer/legacy/motor.cjs");
const {
  optimizarV10,
  nuevasMetricas,
  validarPlanIndustrial,
}=require("../../../../src/lib/optimizer/legacy/v10.cjs");
const {computeHybridLowerBound}=
  require("../../../../src/lib/optimizer/experimental/hybrid-lower-bound.cjs");

export const GUIDE_ROW_R3M_V4_VERSION="guide-row-r3m-v4-risk-polish";

function piecesCount(lines){
  return lines.reduce((s,l)=>s+Number(l?.cant||0),0);
}

function exactDemandOk(plan,lines){
  const expected=new Map(lines.map((l,i)=>[String(l.ref??i),Number(l.cant||0)]));
  const actual=new Map();
  for(const board of plan?.placas||[]){
    for(const p of board.colocadas||[]){
      const key=String(p?.pieza?.ref);
      actual.set(key,(actual.get(key)||0)+1);
    }
  }
  if(expected.size!==actual.size)return false;
  for(const [key,count] of expected)if(actual.get(key)!==count)return false;
  return true;
}

function quality(plan,config){
  return calidadPlanPlacas(plan?.placas||[],plan?.opts||config);
}

function betterPlan(a,b,config){
  if(!a)return b;
  if(!b)return a;
  const ba=a?.resumen?.placas??Infinity;
  const bb=b?.resumen?.placas??Infinity;
  if(bb<ba)return b;
  if(ba<bb)return a;
  return compararCalidad(quality(b,config),quality(a,config))>0?b:a;
}

function safeLowerBound(lines,config,plan){
  const area=lines.reduce(
    (s,l)=>s+Number(l.cant||0)*Number(l.base)*Number(l.altura),
    0,
  );
  const boardArea=
    (Number(config.placaBase)-Number(config.refiladoX||0))*
    (Number(config.placaAltura)-Number(config.refiladoY||0));
  const areaLB=Math.ceil(area/boardArea-1e-9);
  let hybrid=0,reason=null,violation=false;
  try{
    const r=computeHybridLowerBound(
      lines,
      plan?.opts||config,
      plan?.resumen?.placas,
      {useRaster:false,claude:{usarRaster:false,usarDffFs0:true}},
    );
    const value=Math.floor(Number(r?.cheapLowerBound??r?.lowerBound??0));
    reason=r?.reason||null;
    if(value>0){
      if(value>plan.resumen.placas)violation=true;
      else hybrid=value;
    }
  }catch(error){
    reason="error:"+String(error?.message||error);
  }
  return {
    value:Math.max(areaLB,hybrid),
    areaLB,
    hybrid,
    reason,
    violation,
  };
}

function preGate(lines,config){
  if(config?.guideRowR3MV4Experimental!==true)
    return {ok:false,reason:"FLAG_OFF"};
  if(config?.materialConVeta===true)
    return {ok:false,reason:"DIRECTIONAL_EXCLUDED"};
  const pieces=piecesCount(lines);
  if(pieces>160)return {ok:false,reason:"PIECES_GT_160"};
  if(lines.length<2||lines.length>3)
    return {ok:false,reason:"TYPE_COUNT_OUTSIDE_2_3"};
  return {ok:true,pieces};
}

function runRiskPolish(lines,config,expectedPieces){
  try{
    const plan=optimizar(
      lines.map((line)=>structuredClone(line)),
      {
        ...structuredClone(config),
        preferirMenorProfundidad:false,
        ruido:0.4,
        pases:4,
        restartsPorPlaca:4,
        usarRescue:false,
        maxPiezasBeam:0,
        multiVariantes:false,
      },
    );
    if(!validarPlanIndustrial(plan,expectedPieces)?.ok)return null;
    if(!exactDemandOk(plan,lines))return null;
    return plan;
  }catch(_error){
    return null;
  }
}

/**
 * R3-M v4 does NOT expand the frozen R3-M certification region.
 *
 * It first evaluates the exact frozen R3-M v1 conditions. Only an already
 * certifiable hit may enter the risk-polish branch.
 *
 * New information from the first sealed external holdout showed four
 * equal-board remnant regressions, all inside:
 *   candidate boards = 1 && naturalStates = 3
 *
 * v4 therefore runs one extra remnant-first polish only in that risk region.
 * The polish competes lexicographically with the frozen candidate and cannot
 * make it worse. Every original R3-M miss still falls back to current V3.
 *
 * IMPORTANT: this version is holdout-informed. The same external corpus that
 * exposed the four regressions was used to design this polish. It is NOT an
 * external PASS until a later sealed corpus validates it without retuning.
 */
export function optimizarV10ConGuideRowR3MV4(
  lines,
  config,
  metricas=nuevasMetricas(),
){
  const started=process.hrtime.bigint();
  const gate=preGate(lines,config);

  if(!gate.ok){
    const result=optimizarV10(lines,config,metricas);
    return {
      ...result,
      guideRowR3MV4:{
        version:GUIDE_ROW_R3M_V4_VERSION,
        attempted:false,
        certified:false,
        reason:gate.reason,
        wallMs:Number(process.hrtime.bigint()-started)/1e6,
      },
    };
  }

  let candidateResult=null;
  try{
    candidateResult=buildGuideRowCandidate(lines,config);
  }catch(error){
    const result=optimizarV10(lines,config,metricas);
    return {
      ...result,
      guideRowR3MV4:{
        version:GUIDE_ROW_R3M_V4_VERSION,
        attempted:true,
        certified:false,
        reason:"CANDIDATE_ERROR",
        error:String(error?.message||error),
        wallMs:Number(process.hrtime.bigint()-started)/1e6,
      },
    };
  }

  const base=candidateResult?.plan||null;
  const basePhysical=base?validarPlanIndustrial(base,gate.pieces):{ok:false};
  const baseDemandOk=base?exactDemandOk(base,lines):false;
  const baseQuality=base?quality(base,config):null;
  const naturalStates=candidateResult?.telemetry?.residual?.naturalStates??Infinity;
  const lb=base&&basePhysical?.ok&&baseDemandOk
    ? safeLowerBound(lines,config,base)
    : {value:0,areaLB:0,hybrid:0,reason:null,violation:false};

  // Exact frozen R3-M v1 gate.
  const frozenCertified=Boolean(
    base &&
    basePhysical?.ok &&
    baseDemandOk &&
    naturalStates<=3 &&
    baseQuality?.segundo===0 &&
    !lb.violation &&
    Number.isFinite(base.resumen?.placas) &&
    base.resumen.placas<=lb.value
  );

  if(!frozenCertified){
    const result=optimizarV10(lines,config,metricas);
    return {
      ...result,
      guideRowR3MV4:{
        version:GUIDE_ROW_R3M_V4_VERSION,
        attempted:true,
        certified:false,
        reason:!base?"NO_CANDIDATE":
               !basePhysical?.ok?"INVALID_PHYSICAL":
               !baseDemandOk?"DEMAND_MISMATCH":
               naturalStates>3?"NATURAL_STATES_GT_3":
               baseQuality?.segundo!==0?"SECOND_REMNANT_NONZERO":
               lb.violation?"LB_VIOLATION":
               "LB_NOT_REACHED",
        naturalStates,
        baseQuality,
        lowerBound:lb,
        candidateTelemetry:candidateResult?.telemetry||null,
        wallMs:Number(process.hrtime.bigint()-started)/1e6,
      },
    };
  }

  let chosen=base;
  let riskPolishAttempted=false;
  let riskPolishQuality=null;

  if(base.resumen.placas===1 && naturalStates===3){
    riskPolishAttempted=true;
    const polish=runRiskPolish(lines,config,gate.pieces);
    if(polish){
      riskPolishQuality=quality(polish,config);
      chosen=betterPlan(base,polish,config);
    }
  }

  metricas.total.casos++;
  metricas.total.ms+=Number(process.hrtime.bigint()-started)/1e6;

  return {
    plan:chosen,
    metricas,
    cota:lb.value,
    cotaArea:lb.areaLB,
    guideRowR3MV4:{
      version:GUIDE_ROW_R3M_V4_VERSION,
      attempted:true,
      certified:true,
      reason:"R3M_V4_CERTIFIED",
      naturalStates,
      baseQuality,
      quality:quality(chosen,config),
      lowerBound:lb,
      riskPolishAttempted,
      riskPolishQuality,
      candidateTelemetry:candidateResult.telemetry,
      wallMs:Number(process.hrtime.bigint()-started)/1e6,
    },
  };
}

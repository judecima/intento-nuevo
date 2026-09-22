import { createRequire } from "node:module";
import { buildGuideRowCandidate } from "./complete-candidate.mjs";

const require=createRequire(import.meta.url);
const {optimizarV10,nuevasMetricas,validarPlanIndustrial}=
  require("../../../../src/lib/optimizer/legacy/v10.cjs");
const {calidadPlanPlacas}=
  require("../../../../src/lib/optimizer/legacy/motor.cjs");
const {computeHybridLowerBound}=
  require("../../../../src/lib/optimizer/experimental/hybrid-lower-bound.cjs");

export const GUIDE_ROW_R3M_INTEGRATION_VERSION="guide-row-r3m-integration-v1";

function piecesCount(lines){return lines.reduce((s,l)=>s+Number(l?.cant||0),0);}
function exactDemandOk(plan,lines){
  const expected=new Map(lines.map((l,i)=>[String(l.ref??i),Number(l.cant||0)]));
  const actual=new Map();
  for(const board of plan?.placas||[])for(const p of board.colocadas||[]){
    const key=String(p?.pieza?.ref);
    actual.set(key,(actual.get(key)||0)+1);
  }
  if(expected.size!==actual.size)return false;
  for(const [key,count] of expected)if(actual.get(key)!==count)return false;
  return true;
}
function safeLowerBound(lines,config,plan){
  const area=lines.reduce((s,l)=>s+Number(l.cant||0)*Number(l.base)*Number(l.altura),0);
  const boardArea=(Number(config.placaBase)-Number(config.refiladoX||0))*
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
  return {value:Math.max(areaLB,hybrid),areaLB,hybrid,reason,violation};
}
function preGate(lines,config){
  if(config?.guideRowR3MEarlyCertificationExperimental!==true)
    return {ok:false,reason:"FLAG_OFF"};
  if(config?.materialConVeta===true)
    return {ok:false,reason:"DIRECTIONAL_EXCLUDED"};
  const pieces=piecesCount(lines);
  if(pieces>160)return {ok:false,reason:"PIECES_GT_160"};
  if(lines.length<2||lines.length>3)
    return {ok:false,reason:"TYPE_COUNT_OUTSIDE_2_3"};
  return {ok:true,pieces};
}

/**
 * Research-only integration wrapper.
 * Default behavior is bit-for-bit delegation to current V10 because the flag
 * is false/absent. With the flag enabled, only the frozen R3-M envelope can
 * early-return; every miss delegates to current V10.
 */
export function optimizarV10ConGuideRowR3M(lines,config,metricas=nuevasMetricas()){
  const started=process.hrtime.bigint();
  const gate=preGate(lines,config);
  if(!gate.ok){
    const result=optimizarV10(lines,config,metricas);
    return {
      ...result,
      guideRowR3M:{
        version:GUIDE_ROW_R3M_INTEGRATION_VERSION,
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
      guideRowR3M:{
        version:GUIDE_ROW_R3M_INTEGRATION_VERSION,
        attempted:true,
        certified:false,
        reason:"CANDIDATE_ERROR",
        error:String(error?.message||error),
        wallMs:Number(process.hrtime.bigint()-started)/1e6,
      },
    };
  }

  const candidate=candidateResult?.plan||null;
  const physical=candidate?validarPlanIndustrial(candidate,gate.pieces):{ok:false};
  const demandOk=candidate?exactDemandOk(candidate,lines):false;
  const quality=candidate?calidadPlanPlacas(candidate.placas,candidate.opts||config):null;
  const naturalStates=candidateResult?.telemetry?.residual?.naturalStates??Infinity;
  const lb=candidate&&physical?.ok&&demandOk
    ? safeLowerBound(lines,config,candidate)
    : {value:0,areaLB:0,hybrid:0,reason:null,violation:false};

  const certified=Boolean(
    candidate &&
    physical?.ok &&
    demandOk &&
    naturalStates<=3 &&
    quality?.segundo===0 &&
    !lb.violation &&
    Number.isFinite(candidate.resumen?.placas) &&
    candidate.resumen.placas<=lb.value
  );

  if(certified){
    metricas.total.casos++;
    metricas.total.ms+=Number(process.hrtime.bigint()-started)/1e6;
    return {
      plan:candidate,
      metricas,
      cota:lb.value,
      cotaArea:lb.areaLB,
      guideRowR3M:{
        version:GUIDE_ROW_R3M_INTEGRATION_VERSION,
        attempted:true,
        certified:true,
        reason:"R3M_CERTIFIED",
        naturalStates,
        quality,
        lowerBound:lb,
        candidateTelemetry:candidateResult.telemetry,
        wallMs:Number(process.hrtime.bigint()-started)/1e6,
      },
    };
  }

  const result=optimizarV10(lines,config,metricas);
  return {
    ...result,
    guideRowR3M:{
      version:GUIDE_ROW_R3M_INTEGRATION_VERSION,
      attempted:true,
      certified:false,
      reason:!candidate?"NO_CANDIDATE":
             !physical?.ok?"INVALID_PHYSICAL":
             !demandOk?"DEMAND_MISMATCH":
             naturalStates>3?"NATURAL_STATES_GT_3":
             quality?.segundo!==0?"SECOND_REMNANT_NONZERO":
             lb.violation?"LB_VIOLATION":
             "LB_NOT_REACHED",
      naturalStates,
      quality,
      lowerBound:lb,
      candidateTelemetry:candidateResult?.telemetry||null,
      wallMs:Number(process.hrtime.bigint()-started)/1e6,
    },
  };
}

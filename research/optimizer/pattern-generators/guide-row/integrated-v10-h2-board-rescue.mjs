import { createRequire } from "node:module";
import { buildGuideRowCandidate } from "./complete-candidate.mjs";

const require=createRequire(import.meta.url);
const {optimizarV10,nuevasMetricas,validarPlanIndustrial}=
  require("../../../../src/lib/optimizer/legacy/v10.cjs");

export const H2_BOARD_RESCUE_VERSION="guide-row-h2-board-rescue-v1-20260922";

function piecesCount(lines){
  return lines.reduce((s,l)=>s+Number(l?.cant||0),0);
}

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

/**
 * Research-only board-count rescue.
 *
 * Safety architecture:
 * 1. Run current V3 unchanged.
 * 2. If V3 already reaches its safe lower bound, stop: H2 cannot improve boards.
 * 3. Otherwise build an H2 alternative.
 * 4. Accept H2 ONLY when it is physically valid, exact-demand valid, and uses
 *    strictly fewer boards than the final V3 incumbent.
 *
 * Equal-board H2 candidates are NEVER accepted, so H2 remnant regressions
 * cannot leak into the result. Any failure/miss returns the exact V3 result.
 *
 * This v1 intentionally optimizes quality before latency: H2 executes after V3.
 * If it proves useful broadly, a future version may move H2 earlier only after
 * separate certification.
 */
export function optimizarV10ConH2BoardRescue(
  lines,
  config,
  metricas=nuevasMetricas(),
){
  const started=process.hrtime.bigint();
  const base=optimizarV10(lines,config,metricas);

  if(config?.guideRowH2BoardRescueExperimental!==true){
    return {
      ...base,
      h2BoardRescue:{
        version:H2_BOARD_RESCUE_VERSION,
        attempted:false,
        accepted:false,
        reason:"FLAG_OFF",
        wallMs:Number(process.hrtime.bigint()-started)/1e6,
      },
    };
  }

  const baseBoards=Number(base?.plan?.resumen?.placas);
  const lowerBound=Number(base?.cota);

  if(
    !Number.isFinite(baseBoards) ||
    !Number.isFinite(lowerBound) ||
    lowerBound<=0 ||
    baseBoards<=lowerBound
  ){
    return {
      ...base,
      h2BoardRescue:{
        version:H2_BOARD_RESCUE_VERSION,
        attempted:false,
        accepted:false,
        reason:"V3_AT_SAFE_LB",
        baseBoards:Number.isFinite(baseBoards)?baseBoards:null,
        lowerBound:Number.isFinite(lowerBound)?lowerBound:null,
        wallMs:Number(process.hrtime.bigint()-started)/1e6,
      },
    };
  }

  const h2Started=process.hrtime.bigint();
  let candidateResult=null;
  let error=null;
  try{
    candidateResult=buildGuideRowCandidate(lines,config);
  }catch(e){
    error=String(e?.stack||e?.message||e);
  }
  const h2Ms=Number(process.hrtime.bigint()-h2Started)/1e6;
  const candidate=candidateResult?.plan||null;
  const expectedPieces=piecesCount(lines);
  const physical=candidate
    ? Boolean(validarPlanIndustrial(candidate,expectedPieces)?.ok)
    : false;
  const demandOk=candidate?exactDemandOk(candidate,lines):false;
  const candidateBoards=Number(candidate?.resumen?.placas);

  const accepted=Boolean(
    candidate &&
    physical &&
    demandOk &&
    Number.isFinite(candidateBoards) &&
    candidateBoards<baseBoards
  );

  if(!accepted){
    return {
      ...base,
      h2BoardRescue:{
        version:H2_BOARD_RESCUE_VERSION,
        attempted:true,
        accepted:false,
        reason:!candidate?"NO_CANDIDATE":
               !physical?"INVALID_PHYSICAL":
               !demandOk?"DEMAND_MISMATCH":
               "NO_BOARD_WIN",
        baseBoards,
        candidateBoards:Number.isFinite(candidateBoards)?candidateBoards:null,
        lowerBound,
        h2Ms,
        error,
        candidateTelemetry:candidateResult?.telemetry||null,
        wallMs:Number(process.hrtime.bigint()-started)/1e6,
      },
    };
  }

  return {
    ...base,
    plan:candidate,
    h2BoardRescue:{
      version:H2_BOARD_RESCUE_VERSION,
      attempted:true,
      accepted:true,
      reason:"STRICT_BOARD_WIN",
      baseBoards,
      candidateBoards,
      boardsSaved:baseBoards-candidateBoards,
      lowerBound,
      reachedLowerBound:candidateBoards<=lowerBound,
      h2Ms,
      candidateTelemetry:candidateResult.telemetry,
      wallMs:Number(process.hrtime.bigint()-started)/1e6,
    },
  };
}

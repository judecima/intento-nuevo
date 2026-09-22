import { createRequire } from "node:module";

const require=createRequire(import.meta.url);
const {optimizar,calidadPlanPlacas}=
  require("../../../../src/lib/optimizer/legacy/motor.cjs");
const {optimizarV10,nuevasMetricas,validarPlanIndustrial}=
  require("../../../../src/lib/optimizer/legacy/v10.cjs");

export const MONOTYPE_REMNANT_FIRST_VERSION="monotype-remnant-first-v1";

function pieceCount(lines){
  return lines.reduce((s,l)=>s+Number(l?.cant||0),0);
}

function exactDemandOk(plan,lines){
  const expected=pieceCount(lines);
  let actual=0;
  for(const board of plan?.placas||[]) actual+=(board.colocadas||[]).length;
  return actual===expected;
}

function areaLowerBound(lines,config){
  const area=lines.reduce(
    (s,l)=>s+Number(l?.cant||0)*Number(l?.base||0)*Number(l?.altura||0),0
  );
  const width=Number(config?.placaBase)-Number(config?.refiladoX||0);
  const height=Number(config?.placaAltura)-Number(config?.refiladoY||0);
  if(!(width>0&&height>0)) return 0;
  return Math.ceil(area/(width*height)-1e-9);
}

function preGate(lines,config){
  if(config?.monotypeRemnantFirstExperimental!==true)
    return {ok:false,reason:"FLAG_OFF"};
  if(!Array.isArray(lines)||lines.length!==1)
    return {ok:false,reason:"NOT_MONOTYPE"};
  if(config?.materialConVeta===true)
    return {ok:false,reason:"DIRECTIONAL_EXCLUDED"};
  if(lines[0]?.canRotate===false)
    return {ok:false,reason:"ROTATION_LOCKED_EXCLUDED"};
  if(Number(config?.refiladoX||0)!==0||Number(config?.refiladoY||0)!==0)
    return {ok:false,reason:"TRIM_OUTSIDE_VALIDATED_ENVELOPE"};
  const pieces=pieceCount(lines);
  if(pieces<1||pieces>300)
    return {ok:false,reason:"PIECES_OUTSIDE_1_300"};
  return {ok:true,pieces};
}

/**
 * Research-only monotype fast path.
 *
 * Discovery result on the current 16,986-case mining corpus:
 * - 1,724 geometry-only monotype cases
 * - 1,699/1,724 candidate plans reached the area lower bound
 * - among all equal-board comparisons: 0 remnant regressions
 * - the one raw candidate board loss did not reach the lower bound and is
 *   therefore rejected by this wrapper and delegated to V3.
 *
 * Default is OFF. This is not production-promoted and must be externally
 * validated on a future sealed corpus before promotion.
 */
export function optimizarV10ConMonotypeRemnantFirst(
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
      monotypeRemnantFirst:{
        version:MONOTYPE_REMNANT_FIRST_VERSION,
        attempted:false,
        certified:false,
        reason:gate.reason,
        wallMs:Number(process.hrtime.bigint()-started)/1e6,
      },
    };
  }

  let candidate=null;
  let error=null;
  try{
    // Critical difference from the general motor: for monotype research the
    // equal-board choice is remnant-first, not shortest-tree-first.
    candidate=optimizar(lines,{
      ...config,
      preferirMenorProfundidad:false,
    });
  }catch(e){
    error=String(e?.message||e);
  }

  const physical=candidate
    ? validarPlanIndustrial(candidate,gate.pieces)
    : {ok:false};
  const demandOk=candidate?exactDemandOk(candidate,lines):false;
  const lb=areaLowerBound(lines,config);
  const certified=Boolean(
    candidate &&
    physical?.ok &&
    demandOk &&
    lb>0 &&
    candidate?.resumen?.placas===lb
  );

  if(certified){
    metricas.total.casos++;
    metricas.total.ms+=Number(process.hrtime.bigint()-started)/1e6;
    return {
      plan:candidate,
      metricas,
      cota:lb,
      cotaArea:lb,
      monotypeRemnantFirst:{
        version:MONOTYPE_REMNANT_FIRST_VERSION,
        attempted:true,
        certified:true,
        reason:"MONOTYPE_AREA_LB_CERTIFIED",
        lowerBound:lb,
        quality:calidadPlanPlacas(candidate.placas,candidate.opts||config),
        wallMs:Number(process.hrtime.bigint()-started)/1e6,
      },
    };
  }

  const result=optimizarV10(lines,config,metricas);
  return {
    ...result,
    monotypeRemnantFirst:{
      version:MONOTYPE_REMNANT_FIRST_VERSION,
      attempted:true,
      certified:false,
      reason:!candidate?"CANDIDATE_ERROR":
             !physical?.ok?"INVALID_PHYSICAL":
             !demandOk?"DEMAND_MISMATCH":
             "AREA_LB_NOT_REACHED",
      error,
      candidateBoards:candidate?.resumen?.placas??null,
      lowerBound:lb,
      wallMs:Number(process.hrtime.bigint()-started)/1e6,
    },
  };
}

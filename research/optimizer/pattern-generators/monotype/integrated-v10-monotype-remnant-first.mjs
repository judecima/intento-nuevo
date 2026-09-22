import { createRequire } from "node:module";

const require=createRequire(import.meta.url);
const {optimizar,calidadPlanPlacas}=
  require("../../../../src/lib/optimizer/legacy/motor.cjs");
const {optimizarV10,nuevasMetricas,validarPlanIndustrial}=
  require("../../../../src/lib/optimizer/legacy/v10.cjs");
const {computeHybridLowerBound}=
  require("../../../../src/lib/optimizer/experimental/hybrid-lower-bound.cjs");

export const MONOTYPE_REMNANT_FIRST_VERSION="monotype-remnant-first-v2";

function pieceCount(lines){
  return lines.reduce((s,l)=>s+Number(l?.cant||0),0);
}

function exactDemandOk(plan,lines){
  const expected=pieceCount(lines);
  let actual=0;
  for(const board of plan?.placas||[]) actual+=(board.colocadas||[]).length;
  return actual===expected;
}

function safeLowerBound(lines,config,candidate){
  const area=lines.reduce(
    (s,l)=>s+Number(l?.cant||0)*Number(l?.base||0)*Number(l?.altura||0),0
  );
  const width=Number(config?.placaBase)-Number(config?.refiladoX||0);
  const height=Number(config?.placaAltura)-Number(config?.refiladoY||0);
  const areaLB=(width>0&&height>0)
    ? Math.ceil(area/(width*height)-1e-9)
    : 0;

  let hybrid=0,reason=null,violation=false;
  try{
    const r=computeHybridLowerBound(
      lines,
      candidate?.opts||config,
      candidate?.resumen?.placas,
      {
        useRaster:false,
        claude:{
          usarRaster:false,
          usarDffFs0:true,
        },
      },
    );
    const value=Math.floor(Number(r?.cheapLowerBound??r?.lowerBound??0));
    reason=r?.reason||null;
    if(value>0){
      if(candidate?.resumen?.placas!=null && value>candidate.resumen.placas)
        violation=true;
      else
        hybrid=value;
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
 * Current-corpus discovery:
 * - 1,724 geometry-only monotype cases
 * - raw remnant-first candidate: 0 equal-board remnant regressions,
 *   22 remnant improvements, 1 raw board loss
 * - area LB alone certifies 1,699/1,724
 * - existing Hybrid LB (Raster OFF + DFF FS0 ON) certifies 24 more
 * - final frozen research gate certifies 1,723/1,724 = 99.94%
 * - the single raw board loss (5245005) remains candidate=3 vs safe LB=2
 *   and therefore falls back to full V3
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
    // For monotype, compare equal-board plans by the official commercial
    // remnant objective instead of privileging shallower machine trees.
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
  const lb=candidate&&physical?.ok&&demandOk
    ? safeLowerBound(lines,config,candidate)
    : {value:0,areaLB:0,hybrid:0,reason:null,violation:false};

  const certified=Boolean(
    candidate &&
    physical?.ok &&
    demandOk &&
    !lb.violation &&
    lb.value>0 &&
    candidate?.resumen?.placas===lb.value
  );

  if(certified){
    metricas.total.casos++;
    metricas.total.ms+=Number(process.hrtime.bigint()-started)/1e6;
    return {
      plan:candidate,
      metricas,
      cota:lb.value,
      cotaArea:lb.areaLB,
      monotypeRemnantFirst:{
        version:MONOTYPE_REMNANT_FIRST_VERSION,
        attempted:true,
        certified:true,
        reason:"MONOTYPE_SAFE_LB_CERTIFIED",
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
             lb.violation?"LB_VIOLATION":
             "SAFE_LB_NOT_REACHED",
      error,
      candidateBoards:candidate?.resumen?.placas??null,
      lowerBound:lb,
      wallMs:Number(process.hrtime.bigint()-started)/1e6,
    },
  };
}

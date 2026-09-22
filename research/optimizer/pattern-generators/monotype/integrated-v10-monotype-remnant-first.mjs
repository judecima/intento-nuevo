import { createRequire } from "node:module";

const require=createRequire(import.meta.url);
const {optimizar,calidadPlanPlacas}=
  require("../../../../src/lib/optimizer/legacy/motor.cjs");
const {optimizarV10,nuevasMetricas,validarPlanIndustrial}=
  require("../../../../src/lib/optimizer/legacy/v10.cjs");
const {computeHybridLowerBound}=
  require("../../../../src/lib/optimizer/experimental/hybrid-lower-bound.cjs");

export const MONOTYPE_REMNANT_FIRST_VERSION="monotype-remnant-first-v3";

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

  const trimX=Number(config?.refiladoX||0);
  const trimY=Number(config?.refiladoY||0);
  if(
    !Number.isFinite(trimX) ||
    !Number.isFinite(trimY) ||
    trimX<0 ||
    trimY<0 ||
    trimX>20 ||
    trimY>20
  ){
    return {ok:false,reason:"TRIM_OUTSIDE_0_20_ENVELOPE"};
  }

  const pieces=pieceCount(lines);
  if(pieces<1||pieces>300)
    return {ok:false,reason:"PIECES_OUTSIDE_1_300"};

  // Orientation semantics are already effective at the legacy boundary:
  // veta=true means this line is locked; veta=false means rotation is allowed.
  // A grained board does not imply a lock when the user explicitly enabled
  // canRotate upstream; the production mapper converts that override to
  // veta=false before entering the legacy motor.
  return {
    ok:true,
    pieces,
    orientationLocked:Boolean(lines[0]?.veta),
    trimX,
    trimY,
  };
}

/**
 * Research-only monotype fast path.
 *
 * v2 current-corpus discovery:
 * - 1,724 geometry-only monotype cases
 * - 1,723/1,724 certified with the safe LB stack
 * - 0 accepted board losses
 * - 0 accepted equal-board remnant regressions
 * - 22 equal-board remnant improvements
 *
 * v3 controlled envelope extensions on the same 1,724 geometries:
 * - grained board + explicit rotation override:
 *   1,723/1,724 certified, 0 board/remnant regressions, 22 remnant wins
 * - orientation locked:
 *   873/873 valid loaded-orientation cases certified,
 *   0 board/remnant regressions
 * - trim 10x10:
 *   1,389/1,396 valid cases certified, 0 board/remnant regressions
 * - trim 20x20:
 *   1,282/1,305 valid cases certified, 0 board/remnant regressions
 * - trim 10x20:
 *   1,371/1,385 valid cases certified, 0 board/remnant regressions
 * - trim 20x10:
 *   1,302/1,315 valid cases certified, 0 board/remnant regressions
 *
 * These are research stress transforms, not external production traffic.
 * Default remains OFF. Any candidate that does not reach the safe LB falls
 * back to full current V3.
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
        orientationLocked:gate.orientationLocked,
        trimX:gate.trimX,
        trimY:gate.trimY,
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
      orientationLocked:gate.orientationLocked,
      trimX:gate.trimX,
      trimY:gate.trimY,
      error,
      candidateBoards:candidate?.resumen?.placas??null,
      lowerBound:lb,
      wallMs:Number(process.hrtime.bigint()-started)/1e6,
    },
  };
}

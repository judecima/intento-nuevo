import { createRequire } from "node:module";
import path from "node:path";
import { runStructuralRepetitionRescue, repetitionGate } from "./structural-repetition-rescue-v2.mjs";

const require=createRequire(import.meta.url);
const ROOT=path.resolve(new URL("../../../",import.meta.url).pathname);
const motorPath=path.join(ROOT,"src/lib/optimizer/legacy/motor.cjs");
const v10Path=path.join(ROOT,"src/lib/optimizer/legacy/v10.cjs");

const motor=require(motorPath);
const originalOptimizar=motor.optimizar;
const {calidadPlanPlacas,compararCalidad}=motor;
const {computeHybridLowerBound}=require(path.join(ROOT,"src/lib/optimizer/experimental/hybrid-lower-bound.cjs"));
const {defragmentarPlanPorPlaca}=require(path.join(ROOT,"src/lib/optimizer/experimental/per-board-remnant-defrag.cjs"));
const {validarPlanIndustrial}=require(path.join(ROOT,"src/lib/optimizer/legacy/validador_industrial_v3.cjs"));

let hook=null;
motor.optimizar=(lineas,config)=>{
  if(
    hook &&
    !hook.used &&
    lineas===hook.lineas &&
    config &&
    config.multiVariantes===false
  ){
    hook.used=true;
    return hook.baseline;
  }
  return originalOptimizar(lineas,config);
};
delete require.cache[require.resolve(v10Path)];
const {optimizarV10,nuevasMetricas}=require(v10Path);

function better(a,b,config){
  if(!a)return false;
  if(!b)return true;
  const ab=+a?.resumen?.placas,bb=+b?.resumen?.placas;
  if(ab!==bb)return ab<bb;
  return compararCalidad(
    calidadPlanPlacas(a.placas||[],a.opts||config),
    calidadPlanPlacas(b.placas||[],b.opts||config)
  )>0;
}
function safePolish(plan,expected,config){
  if(!plan)return {plan,changed:false,ms:0};
  const t=process.hrtime.bigint();
  try{
    const r=defragmentarPlanPorPlaca(plan,{piezasEsperadas:expected});
    const cand=r?.plan;
    const same=+cand?.resumen?.placas===+plan?.resumen?.placas;
    const valid=same&&Boolean(validarPlanIndustrial(cand,expected)?.ok);
    const qbetter=valid&&compararCalidad(
      calidadPlanPlacas(cand.placas||[],cand.opts||config),
      calidadPlanPlacas(plan.placas||[],plan.opts||config)
    )>0;
    return {
      plan:qbetter?cand:plan,
      changed:Boolean(qbetter),
      attemptedBoards:+r?.attemptedBoards||0,
      improvedBoards:+r?.improvedBoards||0,
      rejectedBoards:+r?.rejectedBoards||0,
      ms:Number(process.hrtime.bigint()-t)/1e6
    };
  }catch{
    return {plan,changed:false,ms:Number(process.hrtime.bigint()-t)/1e6};
  }
}

function callV10WithBaseline(lineas,config,baseline){
  hook={lineas,baseline,used:false};
  try{
    return optimizarV10(lineas,config,nuevasMetricas());
  }finally{
    hook=null;
  }
}

export function runIntegratedStructuralRepetitionV2(lineas,config){
  const started=process.hrtime.bigint();
  const expected=lineas.reduce((s,l)=>s+(+l.cant||0),0);
  const gate=repetitionGate(lineas);

  const tBase=process.hrtime.bigint();
  const baseline=originalOptimizar(lineas,{...config,multiVariantes:false});
  const baselineMs=Number(process.hrtime.bigint()-tBase)/1e6;

  const lbR=computeHybridLowerBound(lineas,config,baseline?.resumen?.placas,{
    useRaster:false,claude:{usarRaster:false,usarDffFs0:true}
  });
  const lb=Math.max(1,Math.floor(Number(lbR?.cheapLowerBound??lbR?.lowerBound??1)));

  // Crucial gate: if baseline already reaches the safe LB, this rescue cannot
  // improve objective #1. Preserve the frozen V10 path for remnant quality.
  if(!gate.eligible || baseline.resumen.placas<=lb){
    const t=process.hrtime.bigint();
    const frozen=callV10WithBaseline(lineas,config,baseline);
    const continuationMs=Number(process.hrtime.bigint()-t)/1e6;
    return {
      plan:frozen.plan,
      metricas:frozen.metricas,
      structural:{
        attempted:false,
        reason:!gate.eligible?gate.reason:"BASELINE_REACHED_SAFE_LB",
        lb,baselineBoards:baseline.resumen.placas,
        baselineMs,continuationMs,rescueMs:0,polishMs:0,
        accepted:false,earlyReturn:false,
        totalMs:Number(process.hrtime.bigint()-started)/1e6
      }
    };
  }

  const tRescue=process.hrtime.bigint();
  const rescue=runStructuralRepetitionRescue(lineas,config,{maxProbeTests:8,maxTotalTests:24});
  const rescueMs=Number(process.hrtime.bigint()-tRescue)/1e6;

  let candidate=rescue?.valid&&rescue?.plan?rescue.plan:null;
  if(candidate && +candidate.resumen.placas>=+baseline.resumen.placas)candidate=null;

  // If a valid candidate reaches the safe LB, no later search can reduce boards.
  // Apply only globally-gated remnant polish and return.
  if(candidate && +candidate.resumen.placas<=lb){
    const polished=safePolish(candidate,expected,config);
    const valid=Boolean(validarPlanIndustrial(polished.plan,expected)?.ok);
    if(valid){
      return {
        plan:polished.plan,
        metricas:null,
        structural:{
          attempted:true,reason:"STRUCTURAL_SAFE_LB",
          lb,baselineBoards:baseline.resumen.placas,
          candidateBoards:candidate.resumen.placas,
          finalBoards:polished.plan.resumen.placas,
          baselineMs,rescueMs,polishMs:polished.ms,continuationMs:0,
          polishChanged:polished.changed,
          tests:rescue.tests,validMixed:rescue.validMixed,stopReason:rescue.stopReason,
          accepted:true,earlyReturn:true,
          totalMs:Number(process.hrtime.bigint()-started)/1e6
        }
      };
    }
  }

  // Otherwise continue the exact frozen V10 path, reusing the already-built
  // baseline, then compare globally. Fallback remains bit-for-bit V10 behavior.
  const t=process.hrtime.bigint();
  const frozen=callV10WithBaseline(lineas,config,baseline);
  const continuationMs=Number(process.hrtime.bigint()-t)/1e6;
  let final=frozen.plan,accepted=false,polishMs=0,polishChanged=false;

  if(candidate && better(candidate,final,config)){
    const polished=safePolish(candidate,expected,config);
    polishMs=polished.ms;polishChanged=polished.changed;
    if(Boolean(validarPlanIndustrial(polished.plan,expected)?.ok) && better(polished.plan,final,config)){
      final=polished.plan;accepted=true;
    }
  }

  return {
    plan:final,
    metricas:frozen.metricas,
    structural:{
      attempted:true,reason:accepted?"STRUCTURAL_ACCEPTED":"FROZEN_V10_FALLBACK",
      lb,baselineBoards:baseline.resumen.placas,
      candidateBoards:candidate?.resumen?.placas??null,
      finalBoards:final?.resumen?.placas??null,
      baselineMs,rescueMs,polishMs,continuationMs,polishChanged,
      tests:rescue?.tests??0,validMixed:rescue?.validMixed??0,stopReason:rescue?.stopReason??null,
      accepted,earlyReturn:false,
      totalMs:Number(process.hrtime.bigint()-started)/1e6
    }
  };
}

export function runFrozenV10(lineas,config){
  return optimizarV10(lineas,config,nuevasMetricas());
}

export { validarPlanIndustrial, calidadPlanPlacas, compararCalidad };

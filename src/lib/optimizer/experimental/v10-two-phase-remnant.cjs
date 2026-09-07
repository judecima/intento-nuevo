"use strict";

// V18 experimental: split primary board optimality from same-board remnant refinement.
// This module does NOT change the synchronous V17 pipeline. It exposes an opt-in
// two-phase API suitable for a Web Worker/background refinement path.

const { optimizar, calidadPlanPlacas, compararCalidad } = require("../legacy/motor.cjs");
const { validarPlanIndustrial } = require("../legacy/validador_industrial_v3.cjs");
const { computeHybridLowerBound } = require("./hybrid-lower-bound.cjs");

function hayRiesgoFranjaMuerta(lineas, O){
  const saw=+O.sierra||0;
  const restoMin=+O.restoMin||0;
  if(!(restoMin>Math.max(saw,10))) return false;
  const ors=[];
  for(const l of lineas){
    const base=+l.base, altura=+l.altura, area=base*altura;
    ors.push({a:base,b:altura,area});
    if(!(O.materialConVeta && l.veta) && Math.abs(base-altura)>1e-9)
      ors.push({a:altura,b:base,area});
  }
  for(const u of ors) for(const v of ors){
    if(v.area<=u.area*1.05) continue;
    const resid=u.a-v.a-saw;
    if(resid>Math.max(saw,10) && resid<restoMin) return true;
  }
  return false;
}

function detectarDeltasEstructurales(lineas,O){
  const restoMin=+O.restoMin||60;
  const saw=+O.sierra||0;
  const candidatos=[];
  for(let i=0;i<lineas.length;i++){
    const li=lineas[i];
    const oi=[{a:+li.base,b:+li.altura}];
    if(!(O.materialConVeta && li.veta) && Math.abs(+li.base-(+li.altura))>1e-9)
      oi.push({a:+li.altura,b:+li.base});
    for(let j=i+1;j<lineas.length;j++){
      const lj=lineas[j];
      const oj=[{a:+lj.base,b:+lj.altura}];
      if(!(O.materialConVeta && lj.veta) && Math.abs(+lj.base-(+lj.altura))>1e-9)
        oj.push({a:+lj.altura,b:+lj.base});
      for(const a of oi) for(const b of oj){
        if(Math.abs(a.b-b.b)>Math.max(1,saw+0.5)) continue;
        const delta=Math.abs(a.a-b.a);
        if(delta<=Math.max(10,saw) || delta>=restoMin) continue;
        candidatos.push(delta);
      }
    }
  }
  const cnt=new Map();
  for(const d of candidatos){ const k=Math.round(d*10)/10; cnt.set(k,(cnt.get(k)||0)+1); }
  return [...cnt.entries()].filter(([,n])=>n>=2).map(([delta,n])=>({delta,n}))
    .sort((a,b)=>b.n-a.n||a.delta-b.delta);
}

function betterSameBoardRemnant(candidate, base){
  if(!candidate?.resumen || !base?.resumen) return false;
  if(candidate.resumen.placas!==base.resumen.placas) return false;
  const cq=calidadPlanPlacas(candidate.placas||[],candidate.opts||base.opts||{});
  const bq=calidadPlanPlacas(base.placas||[],base.opts||candidate.opts||{});
  return compararCalidad(cq,bq)>0;
}

function runPrimaryBoardPhase(lineas, config, options={}){
  const t0=Date.now();
  const expectedPieces=lineas.reduce((s,l)=>s+(+l.cant||0),0);
  const baseline=optimizar(lineas,{...config,multiVariantes:false});
  const baselineMs=Date.now()-t0;
  const tLb=Date.now();
  const bound=computeHybridLowerBound(lineas,baseline.opts||config,baseline.resumen.placas,{
    ...(options.lowerBound||{}),
    useRaster: options.enableRasterLowerBound!==false,
    rasterMaxPieces: options.rasterMaxPieces??40,
    rasterMaxTypes: options.rasterMaxTypes??16,
  });
  const lowerBoundMs=Date.now()-tLb;
  const validation=validarPlanIndustrial(baseline,expectedPieces);
  const certified=validation.ok && bound.lowerBound>=baseline.resumen.placas;
  const refinementEligible=certified && config.usarCompactacion!==false &&
    expectedPieces<=120 && lineas.length<=40 && hayRiesgoFranjaMuerta(lineas,config);
  return {
    plan:baseline,
    certified,
    validation,
    lowerBound:bound,
    refinementEligible,
    reason:certified ? "boards-certified-remnant-refinement-optional" : "boards-not-certified-use-full-staged",
    metrics:{baselineMs,lowerBoundMs,totalMs:Date.now()-t0},
  };
}

function runRemnantRefinement(lineas, config, primaryPlan){
  const t0=Date.now();
  const expectedPieces=lineas.reduce((s,l)=>s+(+l.cant||0),0);
  if(!primaryPlan?.resumen) return {plan:primaryPlan,accepted:false,reason:"no-primary-plan",metrics:{totalMs:0}};
  if(config.usarCompactacion===false || expectedPieces>120 || lineas.length>40 || !hayRiesgoFranjaMuerta(lineas,config))
    return {plan:primaryPlan,accepted:false,reason:"compactation-not-eligible",metrics:{totalMs:Date.now()-t0}};
  const deltasEstructurales=detectarDeltasEstructurales(lineas,config);
  let candidate=null;
  try{
    candidate=optimizar(lineas,{
      ...config,
      multiVariantes:false,
      penalizarFranjaMuerta:true,
      deltasEstructurales,
    });
  }catch(_){
    return {plan:primaryPlan,accepted:false,reason:"compactation-failed",metrics:{totalMs:Date.now()-t0}};
  }
  const validation=validarPlanIndustrial(candidate,expectedPieces);
  if(!validation.ok)
    return {plan:primaryPlan,accepted:false,reason:"candidate-invalid",validation,metrics:{totalMs:Date.now()-t0}};
  if(candidate.resumen.placas<primaryPlan.resumen.placas)
    return {plan:candidate,accepted:true,reason:"fewer-boards-unexpected-but-valid",validation,metrics:{totalMs:Date.now()-t0}};
  if(betterSameBoardRemnant(candidate,primaryPlan))
    return {plan:candidate,accepted:true,reason:"same-boards-better-remnant",validation,metrics:{totalMs:Date.now()-t0}};
  return {plan:primaryPlan,accepted:false,reason:"no-remnant-improvement",validation,metrics:{totalMs:Date.now()-t0}};
}

module.exports={runPrimaryBoardPhase,runRemnantRefinement,hayRiesgoFranjaMuerta,detectarDeltasEstructurales};

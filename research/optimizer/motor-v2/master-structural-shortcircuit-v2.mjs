import { createRequire } from "node:module";
import path from "node:path";
import { runStructuralRepetitionRescue, repetitionGate } from "./structural-repetition-rescue-v2.mjs";

const require=createRequire(import.meta.url);
const ROOT=path.resolve(new URL("../../../",import.meta.url).pathname);
const incPath=path.join(ROOT,"src/lib/optimizer/legacy/rust/incremental-master.cjs");
const v10Path=path.join(ROOT,"src/lib/optimizer/legacy/v10.cjs");
const motorPath=path.join(ROOT,"src/lib/optimizer/legacy/motor.cjs");
const valPath=path.join(ROOT,"src/lib/optimizer/legacy/validador_industrial_v3.cjs");

const inc=require(incPath);
const originalCreate=inc.createIncrementalRustMasterGenerator;
const {calidadPlanPlacas,compararCalidad}=require(motorPath);
const {validarPlanIndustrial}=require(valPath);

let activeTelemetry=null;

function vectorFromBoard(board,n){
  const v=new Array(n).fill(0);
  for(const c of board?.colocadas||[]){
    const i=Number(c?.pieza?.ref);
    if(!Number.isInteger(i)||i<0||i>=n)return null;
    v[i]++;
  }
  return v;
}
function patternFromBoard(board,n){
  const v=vectorFromBoard(board,n);
  if(!v)return null;
  const uso=new Map(v.map((q,i)=>[i,q]).filter(([,q])=>q>0));
  return {uso,area:(board.colocadas||[]).reduce((s,c)=>s+c.base*c.altura,0),placa:board};
}
function uniquePatternsFromPlan(plan,n){
  const m=new Map();
  for(const b of plan?.placas||[]){
    const p=patternFromBoard(b,n); if(!p)continue;
    const k=[...p.uso.entries()].map(([i,q])=>i+":"+q).join(",");
    if(!m.has(k))m.set(k,p);
  }
  return [...m.values()];
}

inc.createIncrementalRustMasterGenerator=function(lineas,config,rondas=40,semilla=7){
  const base=originalCreate(lineas,config,rondas,semilla);
  const enabled=activeTelemetry!==null;
  const normalized=lineas.map((l,i)=>({...l,ref:i}));
  const gate=enabled?repetitionGate(normalized):{eligible:false,reason:"STRUCTURAL_DISABLED"};
  let checked=false,shortCircuit=false,extra=[],rescueMeta=null;

  function maybeCheck(){
    if(checked)return;
    checked=true;
    if(!gate.eligible){
      rescueMeta={attempted:false,reason:gate.reason};
      if(activeTelemetry)activeTelemetry.structural=rescueMeta;
      return;
    }
    const t=process.hrtime.bigint();
    const r=runStructuralRepetitionRescue(normalized,config,{maxProbeTests:1,maxTotalTests:1});
    const ms=Number(process.hrtime.bigint()-t)/1e6;
    rescueMeta={
      attempted:true,certified:Boolean(r?.certified),valid:Boolean(r?.valid),
      boards:r?.boards??null,lb:r?.lb??null,tests:r?.tests??0,validMixed:r?.validMixed??0,
      stopReason:r?.stopReason??null,ms
    };
    if(r?.certified&&r?.valid&&r?.plan){
      extra=uniquePatternsFromPlan(r.plan,lineas.length);
      if(extra.length)shortCircuit=true;
    }
    rescueMeta.shortCircuit=shortCircuit;
    rescueMeta.extraPatterns=extra.length;
    if(activeTelemetry)activeTelemetry.structural=rescueMeta;
  }

  function execute(rounds){
    maybeCheck();
    if(shortCircuit){
      return {
        newlyExecuted:[],
        executedRounds:[],
        missingRounds:base.missingRounds(),
        generationCpuMs:0,
        structuralShortCircuit:true
      };
    }
    return base.execute(rounds);
  }
  function patterns(roundFilter=null){
    maybeCheck();
    return shortCircuit?extra:base.patterns(roundFilter);
  }
  return {
    execute,patterns,
    executedRounds:()=>shortCircuit?[]:base.executedRounds(),
    missingRounds:()=>shortCircuit?base.missingRounds():base.missingRounds(),
    schedule:base.schedule,
    uniqueMaskPolicy:base.uniqueMaskPolicy,
    allowedRounds:base.allowedRounds,
    get generationCpuMs(){return shortCircuit?0:base.generationCpuMs;},
    get candidateCount(){return shortCircuit?extra.length:base.candidateCount;}
  };
};

delete require.cache[require.resolve(v10Path)];
const {optimizarV10,nuevasMetricas}=require(v10Path);

export function runMasterStructuralShortCircuitV2(lineas,config){
  activeTelemetry={structural:null};
  const t=process.hrtime.bigint();
  try{
    const r=optimizarV10(lineas,config,nuevasMetricas());
    const ms=Number(process.hrtime.bigint()-t)/1e6;
    return {...r,structuralMaster:activeTelemetry.structural,totalWallMs:ms};
  }finally{
    activeTelemetry=null;
  }
}
export function runFrozenV10(lineas,config){
  activeTelemetry=null;
  return optimizarV10(lineas,config,nuevasMetricas());
}
export {validarPlanIndustrial,calidadPlanPlacas,compararCalidad};

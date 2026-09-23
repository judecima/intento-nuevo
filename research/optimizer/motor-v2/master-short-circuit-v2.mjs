import { createRequire } from "node:module";
import path from "node:path";
import { runStructuralRepetitionRescue, repetitionGate } from "./structural-repetition-rescue-v2.mjs";

const require=createRequire(import.meta.url);
const ROOT=path.resolve(new URL("../../../",import.meta.url).pathname);
const incrementalPath=path.join(ROOT,"src/lib/optimizer/legacy/rust/incremental-master.cjs");
const v10Path=path.join(ROOT,"src/lib/optimizer/legacy/v10.cjs");

const incrementalModule=require(incrementalPath);
const originalCreate=incrementalModule.createIncrementalRustMasterGenerator;
const telemetry=new WeakMap();

function patternKey(uso){
  return [...uso.entries()].sort((a,b)=>a[0]-b[0]).map(([i,q])=>i+":"+q).join("|");
}
function patternsFromPlan(plan,lineas){
  const byRef=new Map();
  lineas.forEach((l,i)=>byRef.set(String(l.ref??i),i));
  const out=[],seen=new Set();
  for(const board of plan?.placas||[]){
    const uso=new Map();
    let area=0,ok=true;
    for(const c of board?.colocadas||[]){
      const p=c?.pieza;
      let i=byRef.get(String(p?.ref??p?._codigoXml??""));
      if(i===undefined && Number.isInteger(+p?.ref) && +p.ref>=0 && +p.ref<lineas.length)i=+p.ref;
      if(i===undefined){ok=false;break;}
      uso.set(i,(uso.get(i)||0)+1);
      area+=(+c.base||0)*(+c.altura||0);
    }
    if(!ok||!uso.size)continue;
    const k=patternKey(uso);
    if(seen.has(k))continue;
    seen.add(k);
    out.push({uso,area,placa:board,_structuralMasterV2:true});
  }
  return out;
}

incrementalModule.createIncrementalRustMasterGenerator=function(lineas,O,rondas=40,semilla=7){
  const gate=repetitionGate(lineas);
  if(gate.eligible){
    const t=process.hrtime.bigint();
    let rescue=null;
    try{
      rescue=runStructuralRepetitionRescue(lineas,O,{maxProbeTests:1,maxTotalTests:1});
    }catch(error){
      rescue={attempted:true,certified:false,error:String(error?.stack||error)};
    }
    const ms=Number(process.hrtime.bigint()-t)/1e6;
    const rawPatternPlan=rescue?.certified&&rescue?.valid&&Array.isArray(rescue?.patternPlan)?rescue.patternPlan:[];
    const seen=new Set(),pats=[];
    for(const p of rawPatternPlan){
      const k=patternKey(p?.uso||new Map());
      if(!k||seen.has(k))continue;
      seen.add(k);
      pats.push(p);
    }
    const shortCircuit=Boolean(pats.length&&rescue?.boards<=rescue?.lb);
    telemetry.set(O,{
      gate:true,shortCircuit,rescueMs:ms,lb:rescue?.lb??null,boards:rescue?.boards??null,
      tests:rescue?.tests??0,validMixed:rescue?.validMixed??0,stopReason:rescue?.stopReason??rescue?.reason??null,
      patterns:pats.length,error:rescue?.error??null
    });
    if(shortCircuit){
      let executed=[];
      return {
        execute(rounds){executed=[...(rounds||[])];return {newlyExecuted:executed,executedRounds:executed,missingRounds:[],generationCpuMs:0,structuralShortCircuit:true};},
        patterns(){return pats;},
        executedRounds(){return executed.slice();},
        missingRounds(){return [];},
        schedule:[],
        uniqueMaskPolicy:false,
        allowedRounds:[],
        get generationCpuMs(){return 0;},
        get candidateCount(){return pats.length;}
      };
    }
  }
  const g=originalCreate(lineas,O,rondas,semilla);
  const prior=telemetry.get(O)||{};
  telemetry.set(O,{...prior,gate:gate.eligible,shortCircuit:false});
  return g;
};

delete require.cache[require.resolve(v10Path)];
const {optimizarV10,nuevasMetricas,validarPlanIndustrial}=require(v10Path);

export function runMasterShortCircuitV2(lineas,config){
  telemetry.delete(config);
  const result=optimizarV10(lineas,config,nuevasMetricas());
  return {...result,structuralMasterV2:telemetry.get(config)||{gate:false,shortCircuit:false}};
}
export function runFrozenV10(lineas,config){
  // Temporarily disable the wrapper for the reference run by making the
  // repetition gate ineligible through a shallow config marker checked here.
  // The legacy V10 source itself is unchanged.
  const saved=incrementalModule.createIncrementalRustMasterGenerator;
  incrementalModule.createIncrementalRustMasterGenerator=originalCreate;
  try{
    return optimizarV10(lineas,config,nuevasMetricas());
  }finally{
    incrementalModule.createIncrementalRustMasterGenerator=saved;
  }
}
export {validarPlanIndustrial};

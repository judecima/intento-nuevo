"use strict";

const path = require("node:path");
const { optimizarLegacyHybrid } = require("../../../src/lib/optimizer/legacy/rust/rust-hybrid.cjs");
const { legacyRoundSubsets } = require("../../../src/lib/optimizer/legacy/rust/rust-patrones.cjs");

const addonPath = path.join(__dirname,"../../../native/optimizer-pattern-generator/optimizer_pattern_generator.node");
let addon;
function native() {
  addon ??= require(addonPath);
  if (typeof addon.legacyDedupBoards !== "function") throw new Error("native addon does not expose legacyDedupBoards");
  return addon;
}
function normalizeRounds(rounds,totalRounds){
  const out=[],seen=new Set();
  for(const raw of rounds??[]){
    const round=Number(raw);
    if(!Number.isInteger(round)||round<0||round>=totalRounds||seen.has(round))continue;
    seen.add(round);out.push(round);
  }
  return out;
}
function toPatternCandidate(board,payloadIndex,round,boardOrdinal){
  return {round,boardOrdinal,payloadIndex,placements:(board.colocadas??[]).map(p=>({
    typeIndex:typeof p?.pieza?.ref==="number"?p.pieza.ref:null,base:p.base,altura:p.altura
  }))};
}
function patternFromSelected(entry,boards){
  return {uso:new Map(entry.usageVector.map((count,index)=>[index,count]).filter(([,count])=>count>0)),
    area:entry.area,placa:boards[entry.payloadIndex]};
}
function createIncrementalRustMasterGenerator(lineas,O,rondas=40,semilla=7){
  if(!Array.isArray(lineas)||!lineas.length)throw new TypeError("incremental Master requires nonempty lines");
  const schedule=legacyRoundSubsets(lineas.length,rondas,semilla);
  const conRef=lineas.map((linea,index)=>({...linea,ref:index,_refOriginal:linea.ref}));
  const boards=[],candidates=[],executed=new Set();
  let generationCpuMs=0;
  function execute(rounds){
    const selected=normalizeRounds(rounds,schedule.length),newlyExecuted=[];
    for(const round of selected){
      if(executed.has(round))continue;
      executed.add(round);newlyExecuted.push(round);
      const indices=schedule[round];
      if(!indices?.length)continue;
      const started=process.cpuUsage();
      try{
        const result=optimizarLegacyHybrid(indices.map(index=>({...conRef[index]})),{...O,semilla:1000+round,pases:2});
        const cpu=process.cpuUsage(started);generationCpuMs+=(cpu.user+cpu.system)/1000;
        let boardOrdinal=0;
        for(const board of result.placas??[]){
          const payloadIndex=boards.length;boards.push(board);
          candidates.push(toPatternCandidate(board,payloadIndex,round,boardOrdinal++));
        }
      }catch(error){
        const cpu=process.cpuUsage(started);generationCpuMs+=(cpu.user+cpu.system)/1000;
        if(process.env.RUST_LEGACY_DEBUG_ERRORS==="1")throw error;
      }
    }
    return {newlyExecuted,executedRounds:executedRounds(),missingRounds:missingRounds(),generationCpuMs};
  }
  function orderedCandidates(roundFilter=null){
    const allowed=roundFilter==null?executed:new Set(normalizeRounds(roundFilter,schedule.length));
    return candidates.filter(c=>allowed.has(c.round)).slice().sort((a,b)=>a.round-b.round||a.boardOrdinal-b.boardOrdinal);
  }
  function patterns(roundFilter=null){
    const ordered=orderedCandidates(roundFilter);if(!ordered.length)return [];
    const nativeCandidates=ordered.map(c=>({payloadIndex:c.payloadIndex,placements:c.placements}));
    const selected=JSON.parse(native().legacyDedupBoards(JSON.stringify(nativeCandidates),lineas.length));
    return selected.map(entry=>patternFromSelected(entry,boards));
  }
  function executedRounds(){return [...executed].sort((a,b)=>a-b);}
  function missingRounds(){const out=[];for(let r=0;r<schedule.length;r++)if(!executed.has(r))out.push(r);return out;}
  return {execute,patterns,executedRounds,missingRounds,schedule,
    get generationCpuMs(){return generationCpuMs;},
    get candidateCount(){return candidates.length;}
  };
}
module.exports={createIncrementalRustMasterGenerator,normalizeRounds};

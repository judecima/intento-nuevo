import { createRequire } from 'node:module';
import { certifyEquivalentPatternDominance } from './remnant-aware-dominance.mjs';
const require=createRequire(import.meta.url);
const {optimizar}=require('../../../../src/lib/optimizer/legacy/motor.cjs');
const {claveVector}=require('../../../../src/lib/optimizer/legacy/patrones.cjs');

export function detectStructuralDeltas(lines,O){
  const restoMin=+O.restoMin||60,saw=+O.sierra||0,candidates=[];
  for(let i=0;i<lines.length;i++){
    const li=lines[i],oi=[{a:+li.base,b:+li.altura}];
    if(!(O.materialConVeta&&li.veta)&&Math.abs(+li.base-(+li.altura))>1e-9)oi.push({a:+li.altura,b:+li.base});
    for(let j=i+1;j<lines.length;j++){
      const lj=lines[j],oj=[{a:+lj.base,b:+lj.altura}];
      if(!(O.materialConVeta&&lj.veta)&&Math.abs(+lj.base-(+lj.altura))>1e-9)oj.push({a:+lj.altura,b:+lj.base});
      for(const a of oi)for(const b of oj){if(Math.abs(a.b-b.b)>Math.max(1,saw+0.5))continue;const d=Math.abs(a.a-b.a);if(d<=Math.max(10,saw)||d>=restoMin)continue;candidates.push(d)}
    }
  }
  const cnt=new Map();for(const d of candidates){const k=Math.round(d*10)/10;cnt.set(k,(cnt.get(k)||0)+1)}
  return [...cnt.entries()].filter(([,n])=>n>=2).map(([delta,n])=>({delta,n})).sort((a,b)=>b.n-a.n||a.delta-b.delta);
}
function patternsFromPlan(plan){const out=[];for(const board of plan?.placas??[]){const uso=new Map();for(const p of board.colocadas??[]){const t=p?.pieza?.ref;if(typeof t!=='number')continue;uso.set(t,(uso.get(t)??0)+1)}if(!uso.size)continue;out.push({uso,area:(board.colocadas??[]).reduce((s,p)=>s+p.base*p.altura,0),placa:board,provenance:{generator:'remnant-aware-v1'}})}return out}
export function generateRemnantAwareAlternatives(lines,config){
  const indexed=lines.map((line,index)=>({...line,ref:index,_refOriginal:line.ref}));
  const deltasEstructurales=detectStructuralDeltas(indexed,config),started=process.cpuUsage();
  let plan=null,error=null;try{plan=optimizar(indexed,{...config,semilla:7919,pases:2,restartsPorPlaca:14,usarRescue:true,maxPiezasBeam:0,multiVariantes:false,penalizarFranjaMuerta:true,deltasEstructurales})}catch(e){error=String(e?.message??e)}
  const cpu=process.cpuUsage(started);return{patterns:patternsFromPlan(plan),cpuMs:(cpu.user+cpu.system)/1000,deltasEstructurales,error};
}
export function certifiedAugmentEquivalentPatterns(basePatterns,candidates,config={}){
  const byKey=new Map(basePatterns.map((p,i)=>[claveVector(p.uso),{p,i}])),out=basePatterns.slice();
  const stats={candidatePatterns:0,equivalentCandidates:0,certifiedReplacements:0,ignoredNewVectors:0,rejectedUncertified:0};
  for(const c of candidates??[]){stats.candidatePatterns++;const hit=byKey.get(claveVector(c.uso));if(!hit){stats.ignoredNewVectors++;continue}stats.equivalentCandidates++;const cert=certifyEquivalentPatternDominance(c,out[hit.i],config);if(cert.certified){out[hit.i]=c;hit.p=c;stats.certifiedReplacements++}else stats.rejectedUncertified++}
  return{patterns:out,stats};
}

"use strict";

function orientations(line, opts, permissiveUnknown = true) {
  const b=+line.base, h=+line.altura;
  const out=[{a:b,b:h,area:b*h}];
  // For offline/canonical uncertainty, permissiveUnknown=true means allow rotation
  // unless the individual line explicitly has veta=true. At runtime the real
  // line.veta is known, so this exactly mirrors the motor rule.
  const locked = !!(opts.materialConVeta && line.veta);
  if(!locked && Math.abs(b-h)>1e-9) out.push({a:h,b:b,area:b*h});
  return out;
}

function structuralDeltas(lineas, opts) {
  const saw=+opts.sierra||0, restoMin=+opts.restoMin||60;
  const candidates=[];
  for(let i=0;i<lineas.length;i++){
    const oi=orientations(lineas[i],opts);
    for(let j=i+1;j<lineas.length;j++){
      const oj=orientations(lineas[j],opts);
      for(const a of oi) for(const b of oj){
        if(Math.abs(a.b-b.b)>Math.max(1,saw+0.5)) continue;
        const d=Math.abs(a.a-b.a);
        if(d<=Math.max(10,saw) || d>=restoMin) continue;
        candidates.push(Math.round(d*10)/10);
      }
    }
  }
  const cnt=new Map();
  for(const d of candidates) cnt.set(d,(cnt.get(d)||0)+1);
  return [...cnt.entries()].filter(([,n])=>n>=2).map(([delta,n])=>({delta,n}));
}

/**
 * Necessary static condition for the compactation run to differ from baseline.
 * Returns false only when no single-piece candidate can ever receive
 * riesgoFranja>0 in motor.elegir(), even before considering dynamic regions.
 * Therefore false => penalizarFranjaMuerta cannot change cmpCand ordering.
 */
function hasPotentialDeadStripPenalty(lineas, opts) {
  const restoMin=+opts.restoMin||0, saw=+opts.sierra||0;
  if(!(restoMin>Math.max(saw,10))) return false;
  const deltas=structuralDeltas(lineas,opts);
  const all=lineas.map((l,i)=>({i,cant:+l.cant||1,ors:orientations(l,opts)}));
  for(const u of all){
    for(const a of u.ors){
      const areaCand=a.a*a.b;
      for(const q of all){
        for(const o of q.ors){
          const d=o.a, qb=o.b;
          if(d>=a.a-1e-9) continue;
          const resid=a.a-d;
          if(resid<=Math.max(saw,10) || resid>=restoMin) continue;
          const qa=d*qb;
          // Signal A from motor.cjs.
          if(qa>areaCand*1.05) return true;
          // Signal B from motor.cjs. Dynamic perp-fit is intentionally omitted:
          // omitting it can only create false positives, never an unsafe skip.
          const rep=deltas.find(x=>Math.abs(x.delta-resid)<=0.6);
          if(rep && Math.abs(qb-a.b)<=Math.max(1,saw+0.5)) return true;
        }
      }
    }
  }
  return false;
}

module.exports={hasPotentialDeadStripPenalty,structuralDeltas};

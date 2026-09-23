import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(new URL("../../../", import.meta.url).pathname);

const { optimizar, calidadPlanPlacas, compararCalidad } = require(path.join(ROOT,"src/lib/optimizer/legacy/motor.cjs"));
const { patronesMonotipo } = require(path.join(ROOT,"src/lib/optimizer/legacy/patrones.cjs"));
const { resolverCobertura } = require(path.join(ROOT,"src/lib/optimizer/legacy/cobertura.cjs"));
const { materializar } = require(path.join(ROOT,"src/lib/optimizer/legacy/materializar.cjs"));
const { validarPlanIndustrial } = require(path.join(ROOT,"src/lib/optimizer/legacy/validador_industrial_v3.cjs"));
const { computeHybridLowerBound } = require(path.join(ROOT,"src/lib/optimizer/experimental/hybrid-lower-bound.cjs"));

const gcd2=(a,b)=>{a=Math.abs(a|0);b=Math.abs(b|0);while(b){const t=a%b;a=b;b=t;}return a;};
const gcdAll=a=>a.reduce((g,x)=>gcd2(g,x),0);

function key(v){return v.join(",");}
function vectorOf(p,n){const v=new Array(n).fill(0);for(const [i,q] of p.uso||[])if(i>=0&&i<n)v[i]=q;return v;}
function patternFromBoard(board,n){
  const uso=new Map();
  for(const c of board?.colocadas||[]){
    const i=Number(c?.pieza?.ref);
    if(!Number.isInteger(i)||i<0||i>=n)return null;
    uso.set(i,(uso.get(i)||0)+1);
  }
  if(!uso.size)return null;
  return {uso,area:(board.colocadas||[]).reduce((s,c)=>s+c.base*c.altura,0),placa:board};
}

function pushUnique(out,seen,v,demand,maxs,family,priority){
  const x=v.map((q,i)=>Math.max(0,Math.min(demand[i],maxs[i],Math.floor(q))));
  const positive=x.filter(q=>q>0).length;
  if(positive<2)return;
  const k=key(x);
  if(seen.has(k))return;
  seen.add(k);
  out.push({v:x,family,priority});
}

function structuralPortfolio(demand,maxs,lb){
  const n=demand.length,out=[],seen=new Set();
  const target=demand.map(q=>q/lb);
  const lo=target.map(x=>Math.floor(x)), hi=target.map(x=>Math.ceil(x));

  // Family A: exact neighbourhood of average consumption q/LB.
  for(let mask=0;mask<(1<<n);mask++){
    const v=target.map((_,i)=>(mask&(1<<i))?hi[i]:lo[i]);
    pushUnique(out,seen,v,demand,maxs,"AVG_NEIGHBOR",0);
  }

  // Family B: scale average demand to allow >1 "kit share" per physical board.
  for(const scale of [1.25,1.5,2]){
    for(let mask=0;mask<(1<<n);mask++){
      const v=target.map((x,i)=>(mask&(1<<i))?Math.ceil(x*scale):Math.floor(x*scale));
      pushUnique(out,seen,v,demand,maxs,"SCALED_AVG",1);
    }
  }

  // Family C: one anchor family at a capacity level, companions near q/LB.
  for(let a=0;a<n;a++){
    const levels=[maxs[a],Math.ceil(maxs[a]*.75),Math.ceil(maxs[a]*.5),Math.max(1,hi[a])];
    for(const level of levels){
      for(let mask=0;mask<(1<<(n-1));mask++){
        let bit=0;
        const v=target.map((_,i)=>{
          if(i===a)return level;
          const q=(mask&(1<<bit))?hi[i]:lo[i]; bit++; return q;
        });
        pushUnique(out,seen,v,demand,maxs,"ANCHOR_CAPACITY",2);
      }
    }
  }

  // Family D: one copy of each non-hub anchor plus hub fill levels.
  for(let hub=0;hub<n;hub++){
    for(const level of [maxs[hub],Math.ceil(maxs[hub]*.75),Math.ceil(maxs[hub]*.5),hi[hub]]){
      const v=demand.map((_,i)=>i===hub?level:1);
      pushUnique(out,seen,v,demand,maxs,"HUB_FILL",2);
    }
  }

  // Cheap deterministic ordering: average-neighbour first, then dense structural alternatives.
  const areasRank=(v)=>v.reduce((s,q,i)=>s+q/(maxs[i]||1),0);
  out.sort((a,b)=>a.priority-b.priority || areasRank(b.v)-areasRank(a.v) || key(a.v).localeCompare(key(b.v)));
  return out;
}

function solvePool(pool,lines,config,incumbent){
  const area=(config.placaBase-(config.refiladoX||0))*(config.placaAltura-(config.refiladoY||0));
  const s=resolverCobertura(pool,lines.map(l=>l.cant),area,incumbent,8000,{maxNodos:1600000,watchdogMs:12000});
  return s?.resolver(lines.map(l=>l.base*l.altura))||null;
}
function materialize(sol,lines,config){
  if(!sol?.plan)return null;
  const opts={...config,anchoUtil:config.placaBase-(config.refiladoX||0),altoUtil:config.placaAltura-(config.refiladoY||0)};
  return materializar(sol.plan,lines,opts);
}

export function repetitionGate(lines){
  if(lines.length<2||lines.length>3)return {eligible:false,reason:"TYPE_COUNT"};
  const demand=lines.map(l=>+l.cant||0);
  const pieces=demand.reduce((a,b)=>a+b,0);
  if(pieces<6)return {eligible:false,reason:"PIECES_LT_6"};
  // Synchronous beta-v2 envelope. Larger repeated batches remain valid inputs
  // but use the frozen fallback / future XL effort route instead of paying
  // deep structural probes on the interactive path.
  if(pieces>300)return {eligible:false,reason:"PIECES_GT_300"};
  const g=gcdAll(demand);
  if(g<2)return {eligible:false,reason:"NO_QUANTITY_REPETITION"};
  return {eligible:true,reason:"ELIGIBLE",gcd:g,pieces};
}

export function runStructuralRepetitionRescue(lines,config,{maxProbeTests=8,maxTotalTests=24}={}){
  const gate=repetitionGate(lines);
  const t0=performance.now();
  if(!gate.eligible)return {...gate,attempted:false,certified:false,ms:performance.now()-t0};

  const demand=lines.map(l=>+l.cant);
  const expected=demand.reduce((a,b)=>a+b,0);
  const lbR=computeHybridLowerBound(lines,config,null,{useRaster:false,claude:{usarRaster:false,usarDffFs0:true}});
  const lb=Math.max(
    1,
    Math.floor(Number(lbR?.cheapLowerBound ?? 0)),
    Math.floor(Number(lbR?.lowerBound ?? 0)),
  );

  const mono=patronesMonotipo(lines,config);
  const maxs=new Array(lines.length).fill(0);
  for(const p of mono)for(const [i,q] of p.uso)maxs[i]=Math.max(maxs[i],q);
  if(maxs.some(x=>!x))return {...gate,attempted:true,certified:false,reason:"MONO_CAPACITY_MISSING",lb,ms:performance.now()-t0};

  const pool=new Map();
  for(const p of mono)pool.set(key(vectorOf(p,lines.length)),p);
  const portfolio=structuralPortfolio(demand,maxs,lb);

  let tests=0,validMixed=0,probeValid=0,probeSolved=null,sol=solvePool([...pool.values()],lines,config,Number.MAX_SAFE_INTEGER);
  let best=sol?.placas??Number.MAX_SAFE_INTEGER;
  let stopReason="PORTFOLIO_EXHAUSTED";

  for(let idx=0;idx<portfolio.length;idx++){
    if(best<=lb){stopReason="REACHED_SAFE_LB";break;}
    if(tests>=maxTotalTests){stopReason="WORK_LIMIT";break;}

    // After the cheap probe, only escalate if it found at least one physical
    // mixed pattern and coverage moved reasonably close to the lower bound.
    if(idx>=maxProbeTests && tests>=maxProbeTests){
      const close=Number.isFinite(best)&&best<=lb+Math.max(1,Math.ceil(lb*.08));
      if(probeValid===0 || !close){stopReason="PROBE_REJECT";break;}
    }

    const cand=portfolio[idx];
    // materializar() indexes pattern pieces by numeric logical type.
    // The external line ref may be a string XML code, so research patterns
    // must use the stable numeric type index internally.
    const sub=lines.map((l,i)=>({...l,ref:i,cant:cand.v[i]})).filter(l=>l.cant>0);
    const subPieces=sub.reduce((s,l)=>s+l.cant,0);
    if(subPieces>120)continue;

    tests++;
    let r=null;
    try{
      r=optimizar(sub,{...config,pases:2,restartsPorPlaca:4,usarRescue:false,presupuestoBeamMs:250,maxPiezasBeam:120,preferirMenorProfundidad:false});
    }catch{r=null;}
    if(!r||r.resumen?.placas!==1||!r.placas?.[0])continue;

    const p=patternFromBoard(r.placas[0],lines.length);
    if(!p)continue;
    const k=key(vectorOf(p,lines.length));
    if(pool.has(k))continue;

    const one={placas:[p.placa],opts:r.opts,resumen:{placas:1,piezas:(p.placa.colocadas||[]).length}};
    if(!validarPlanIndustrial(one,(p.placa.colocadas||[]).length)?.ok)continue;

    pool.set(k,p);validMixed++;
    if(tests<=maxProbeTests)probeValid++;
    sol=solvePool([...pool.values()],lines,config,Number.MAX_SAFE_INTEGER);
    if(sol?.placas<best)best=sol.placas;
    if(tests===maxProbeTests)probeSolved=best;
  }

  const plan=materialize(sol,lines,config);
  const valid=Boolean(plan&&validarPlanIndustrial(plan,expected)?.ok);
  const certified=Boolean(valid&&sol?.plan&&sol.placas<=lb);
  const quality=valid?calidadPlanPlacas(plan.placas,plan.opts||config):null;

  return {
    ...gate,attempted:true,certified,valid,plan,quality,lb,lbReason:lbR?.reason||null,
    boards:valid&&sol?.plan?sol.placas:null,tests,validMixed,probeValid,probeSolved,
    poolSize:pool.size,portfolioSize:portfolio.length,solverNodes:sol?.nodos??null,
    solverExhausted:sol?.agotado??null,stopReason,ms:performance.now()-t0
  };
}

export { compararCalidad };

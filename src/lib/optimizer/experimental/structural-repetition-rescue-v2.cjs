"use strict";

const { optimizar, calidadPlanPlacas } = require("../legacy/motor.cjs");
const { patronesMonotipo } = require("../legacy/patrones.cjs");
const { resolverCobertura } = require("../legacy/cobertura.cjs");
const { materializar } = require("../legacy/materializar.cjs");
const { validarPlanIndustrial } = require("../legacy/validador_industrial_v3.cjs");
const { computeHybridLowerBound } = require("./hybrid-lower-bound.cjs");

const gcd2=(a,b)=>{a=Math.abs(a|0);b=Math.abs(b|0);while(b){const t=a%b;a=b;b=t;}return a;};
const gcdAll=a=>a.reduce((g,x)=>gcd2(g,x),0);
const key=v=>v.join(",");

function vectorOf(pattern,typeCount){
  const v=new Array(typeCount).fill(0);
  for(const [i,q] of pattern?.uso||[]) if(i>=0&&i<typeCount) v[i]=q;
  return v;
}
function patternFromBoard(board,typeCount){
  const uso=new Map();
  for(const c of board?.colocadas||[]){
    const i=Number(c?.pieza?.ref);
    if(!Number.isInteger(i)||i<0||i>=typeCount)return null;
    uso.set(i,(uso.get(i)||0)+1);
  }
  if(!uso.size)return null;
  return {uso,area:(board.colocadas||[]).reduce((s,c)=>s+c.base*c.altura,0),placa:board};
}
function pushUnique(out,seen,v,demand,maxs,family,priority){
  const x=v.map((q,i)=>Math.max(0,Math.min(demand[i],maxs[i],Math.floor(q))));
  if(x.filter(q=>q>0).length<2)return;
  const k=key(x);
  if(seen.has(k))return;
  seen.add(k);
  out.push({v:x,family,priority});
}
function structuralPortfolio(demand,maxs,lb){
  const n=demand.length,out=[],seen=new Set();
  const target=demand.map(q=>q/lb),lo=target.map(Math.floor),hi=target.map(Math.ceil);

  for(let mask=0;mask<(1<<n);mask++){
    pushUnique(out,seen,target.map((_,i)=>(mask&(1<<i))?hi[i]:lo[i]),demand,maxs,"AVG_NEIGHBOR",0);
  }
  for(const scale of [1.25,1.5,2]){
    for(let mask=0;mask<(1<<n);mask++){
      pushUnique(out,seen,target.map((x,i)=>(mask&(1<<i))?Math.ceil(x*scale):Math.floor(x*scale)),demand,maxs,"SCALED_AVG",2);
    }
  }
  for(let a=0;a<n;a++){
    const levels=[maxs[a],Math.ceil(maxs[a]*.75),Math.ceil(maxs[a]*.5),Math.max(1,hi[a])];
    for(const level of levels){
      for(let mask=0;mask<(1<<(n-1));mask++){
        let bit=0;
        const v=target.map((_,i)=>{
          if(i===a)return level;
          const q=(mask&(1<<bit))?hi[i]:lo[i];bit++;return q;
        });
        pushUnique(out,seen,v,demand,maxs,"ANCHOR_CAPACITY",1);
      }
    }
  }
  for(let hub=0;hub<n;hub++){
    for(const level of [maxs[hub],Math.ceil(maxs[hub]*.75),Math.ceil(maxs[hub]*.5),hi[hub]]){
      pushUnique(out,seen,demand.map((_,i)=>i===hub?level:1),demand,maxs,"HUB_FILL",1);
    }
  }
  const rank=v=>v.reduce((s,q,i)=>s+q/(maxs[i]||1),0);
  out.sort((a,b)=>a.priority-b.priority||rank(b.v)-rank(a.v)||key(a.v).localeCompare(key(b.v)));
  return out;
}
function solvePool(pool,lineas,config,incumbent){
  const area=(config.placaBase-(config.refiladoX||0))*(config.placaAltura-(config.refiladoY||0));
  const s=resolverCobertura(pool,lineas.map(l=>l.cant),area,incumbent,8000,{
    maxNodos:1600000,watchdogMs:12000
  });
  return s?.resolver(lineas.map(l=>l.base*l.altura))||null;
}
function materialize(sol,lineas,config){
  if(!sol?.plan)return null;
  return materializar(sol.plan,lineas,{
    ...config,
    anchoUtil:config.placaBase-(config.refiladoX||0),
    altoUtil:config.placaAltura-(config.refiladoY||0)
  });
}
function repetitionGate(lineas){
  if(!Array.isArray(lineas)||lineas.length<2||lineas.length>3)return {eligible:false,reason:"TYPE_COUNT"};
  const demand=lineas.map(l=>+l.cant||0),pieces=demand.reduce((a,b)=>a+b,0);
  if(pieces<6)return {eligible:false,reason:"PIECES_LT_6"};
  if(lineas.length===2&&pieces>300)return {eligible:false,reason:"TYPE2_PIECES_GT_300"};
  if(lineas.length===3&&pieces>100)return {eligible:false,reason:"TYPE3_PIECES_GT_100_SYNC"};
  const gcd=gcdAll(demand);
  if(gcd<2)return {eligible:false,reason:"NO_QUANTITY_REPETITION"};
  if(gcd<3)return {eligible:false,reason:"REPETITION_GCD_LT_3",gcd,pieces};
  return {eligible:true,reason:"ELIGIBLE",gcd,pieces};
}
function runStructuralRepetitionRescue(lineas,config,options={}){
  const maxProbeTests=Number(options.maxProbeTests??1);
  const maxTotalTests=Number(options.maxTotalTests??1);
  const gate=repetitionGate(lineas),started=process.hrtime.bigint();
  const elapsed=()=>Number(process.hrtime.bigint()-started)/1e6;
  if(!gate.eligible)return {...gate,attempted:false,certified:false,ms:elapsed()};

  const demand=lineas.map(l=>+l.cant),expected=demand.reduce((a,b)=>a+b,0);
  const lbR=computeHybridLowerBound(lineas,config,null,{useRaster:false,claude:{usarRaster:false,usarDffFs0:true}});
  const lb=Math.max(1,Math.floor(Number(lbR?.cheapLowerBound??0)),Math.floor(Number(lbR?.lowerBound??0)));

  const mono=patronesMonotipo(lineas,config),maxs=new Array(lineas.length).fill(0);
  for(const p of mono)for(const [i,q] of p.uso)maxs[i]=Math.max(maxs[i],q);
  if(maxs.some(x=>!x))return {...gate,attempted:true,certified:false,reason:"MONO_CAPACITY_MISSING",lb,ms:elapsed()};

  const pool=new Map();
  for(const p of mono)pool.set(key(vectorOf(p,lineas.length)),p);
  const portfolio=structuralPortfolio(demand,maxs,lb);
  let tests=0,validMixed=0,probeValid=0,probeSolved=null;
  let sol=solvePool([...pool.values()],lineas,config,Number.MAX_SAFE_INTEGER);
  let best=sol?.placas??Number.MAX_SAFE_INTEGER,stopReason="PORTFOLIO_EXHAUSTED";

  for(let idx=0;idx<portfolio.length;idx++){
    if(best<=lb){stopReason="REACHED_SAFE_LB";break;}
    if(tests>=maxTotalTests){stopReason="WORK_LIMIT";break;}
    if(idx>=maxProbeTests&&tests>=maxProbeTests){
      const close=Number.isFinite(best)&&best<=lb+Math.max(1,Math.ceil(lb*.08));
      if(probeValid===0||!close){stopReason="PROBE_REJECT";break;}
    }

    const cand=portfolio[idx];
    const sub=lineas.map((l,i)=>({...l,ref:i,cant:cand.v[i]})).filter(l=>l.cant>0);
    const subPieces=sub.reduce((s,l)=>s+l.cant,0);
    if(subPieces>120)continue;

    tests++;
    let r=null;
    try{
      r=optimizar(sub,{
        ...config,pases:1,restartsPorPlaca:1,usarRescue:false,presupuestoBeamMs:100,
        maxPiezasBeam:120,preferirMenorProfundidad:false,
        masterStructuralV2:false
      });
    }catch{r=null;}
    if(!r||r.resumen?.placas!==1||!r.placas?.[0])continue;

    const p=patternFromBoard(r.placas[0],lineas.length);
    if(!p)continue;
    const k=key(vectorOf(p,lineas.length));
    if(pool.has(k))continue;
    const one={placas:[p.placa],opts:r.opts,resumen:{placas:1,piezas:(p.placa.colocadas||[]).length}};
    if(!validarPlanIndustrial(one,(p.placa.colocadas||[]).length)?.ok)continue;

    pool.set(k,p);validMixed++;
    if(tests<=maxProbeTests)probeValid++;
    sol=solvePool([...pool.values()],lineas,config,Number.MAX_SAFE_INTEGER);
    if(sol?.placas<best)best=sol.placas;
    if(tests===maxProbeTests)probeSolved=best;
  }

  const plan=materialize(sol,lineas,config);
  const valid=Boolean(plan&&validarPlanIndustrial(plan,expected)?.ok);
  const certified=Boolean(valid&&sol?.plan&&sol.placas<=lb);
  return {
    ...gate,attempted:true,certified,valid,plan,
    quality:valid?calidadPlanPlacas(plan.placas,plan.opts||config):null,
    lb,lbReason:lbR?.reason||null,boards:valid&&sol?.plan?sol.placas:null,
    tests,validMixed,probeValid,probeSolved,poolSize:pool.size,portfolioSize:portfolio.length,
    solverNodes:sol?.nodos??null,solverExhausted:sol?.agotado??null,stopReason,
    patternPlan:sol?.plan||null,ms:elapsed()
  };
}

module.exports={repetitionGate,runStructuralRepetitionRescue};

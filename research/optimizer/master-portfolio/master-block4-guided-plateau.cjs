"use strict";

const fs=require("node:fs");
const path=require("node:path");
const {performance}=require("node:perf_hooks");

const ROOT=path.resolve(__dirname,"../../..");
const CANONICAL=path.join(ROOT,"experiencia/canonical_cases.json");
const MANIFEST=path.join(ROOT,"research/optimizer/master-portfolio/MASTER_ACTIVE_323_MANIFEST_2026-09-18.json");
const OUT_DIR=path.join(ROOT,"research/optimizer/master-portfolio/out");
const OUT=path.join(OUT_DIR,"MASTER_BLOCK4_CARRY_BEST_2026-09-21.json");

const LEGACY=path.join(ROOT,"src/lib/optimizer/legacy");
const {optimizarV10,nuevasMetricas,validarPlanIndustrial}=require(path.join(LEGACY,"v10.cjs"));
const {patronesMonotipo}=require(path.join(LEGACY,"patrones.cjs"));
const {resolverCobertura}=require(path.join(LEGACY,"cobertura.cjs"));
const {materializar}=require(path.join(LEGACY,"materializar.cjs"));
const {calidadPlanPlacas,compararCalidad}=require(path.join(LEGACY,"motor.cjs"));
const {createIncrementalRustMasterGenerator}=require("./incremental-rust-master.cjs");

const P16=Object.freeze([0,2,6,10,12,13,16,17,18,19,20,21,22,25,34,36]);
const GUIDED_FIRST=Object.freeze([9,23,32,1]);
const REMAINDER=Object.freeze([...Array(40).keys()].filter(r=>!P16.includes(r)&&!GUIDED_FIRST.includes(r)));
const ORDER=Object.freeze([...P16,...GUIDED_FIRST,...REMAINDER]);
const CHECKPOINTS=Object.freeze([3,16,20,24,28,32,36,40]);

const MAX_CASES=Number(process.env.GUIDED_MAX_CASES||24);
const MAX_PIECES=Number(process.env.GUIDED_MAX_PIECES||300);
const PROBE_NODES=Number(process.env.GUIDED_PROBE_NODES||10000);
const PROBE_WATCHDOG_MS=Number(process.env.GUIDED_PROBE_WATCHDOG_MS||30);
const FULL_NODES=Number(process.env.GUIDED_FULL_NODES||1600000);
const FULL_WATCHDOG_MS=Number(process.env.GUIDED_FULL_WATCHDOG_MS||12000);

function num(v,f=0){const n=Number(v);return Number.isFinite(n)?n:f;}
function boolTrue(v){return v===true||v===1||v==="1"||v==="true"||v==="TRUE";}
function basename(v){return typeof v==="string"?v.replaceAll("\\","/").split("/").pop():null;}
function qty(p){for(const k of ["quantity","qty","count","cant","num","q","qMin"]){const n=Number(p?.[k]);if(Number.isFinite(n)&&n>0)return n;}return 1;}
function dims(p){return {w:num(p?.width??p?.base??p?.l??p?.L),h:num(p?.height??p?.altura??p?.w??p?.W)};}
function features(row){
  const ps=Array.isArray(row.pieces)?row.pieces:[];
  return {file:basename(row.source_path||((row.case_id||"")+".xml")),pieceCount:num(row.piece_count,ps.reduce((s,p)=>s+qty(p),0)),typeCount:num(row.piece_types,ps.length)};
}
function gate(m){
  const gap=num(m.preMasterBoards)-num(m.lowerBound);
  const mult=num(m.typeCount)?num(m.pieces)/num(m.typeCount):0;
  return gap>1||mult>=4.75;
}
function toLines(row){
  const fmt=String(row.source_format||"").toLowerCase();
  return (row.pieces||[]).map((p,i)=>({
    ref:String(i+1),detalle:String(i+1),cant:qty(p),base:dims(p).w,altura:dims(p).h,
    veta:fmt==="order"&&(boolTrue(p?.xmlPartGrain)||boolTrue(p?.rawGrain)||boolTrue(p?.grain)),cantos:null
  }));
}
function toConfig(row){
  const fmt=String(row.source_format||"").toLowerCase();
  return {
    placaBase:num(row.stock_width,2600),placaAltura:num(row.stock_height,1830),refiladoX:0,refiladoY:0,
    sierra:num(row.saw,4.5),etapas:4,materialConVeta:fmt==="order"?boolTrue(row.directional):false,
    descontarCanto:false,cantoEspesor:0,restoMin:250,restoMax:400,usarCache:true,maxPiezasCache:3000,
    usarCompactacion:true,usarMultiSlice:true,usarOneBoard:true,usarMaster:false,rondasPatrones:40,msMaster:8000
  };
}
function solve(pool,lines,area,incumbent,isFinal,stopAtBoards=null){
  const t=performance.now();
  const h=resolverCobertura(pool,lines.map(l=>l.cant),area,incumbent,8000,{
    maxNodos:isFinal?FULL_NODES:PROBE_NODES,
    watchdogMs:isFinal?FULL_WATCHDOG_MS:PROBE_WATCHDOG_MS,
    stopAtBoards,
  });
  const sol=h?h.resolver(lines.map(l=>l.base*l.altura)):null;
  return {sol,ms:performance.now()-t};
}
function materializeSafe(sol,lines,prePlan,expected){
  if(!sol?.plan)return null;
  try{
    const plan=materializar(sol.plan,lines,prePlan.opts);
    const v=plan?validarPlanIndustrial(plan,expected):null;
    if(!v?.ok)return null;
    return {plan,boards:plan?.resumen?.placas??sol?.placas,quality:calidadPlanPlacas(plan.placas||[],plan.opts||prePlan.opts)};
  }catch(_){return null;}
}
function objectiveCmp(a,b){
  if(a.boards!==b.boards)return a.boards<b.boards?1:-1;
  return compararCalidad(a.quality,b.quality);
}
function firstPlateau(checkpoints, preBoards, stableAfter){
  for(let i=0;i<checkpoints.length;i++){
    const c=checkpoints[i];
    if(!(c.boards<preBoards))continue;
    let ok=true;
    for(let k=1;k<=stableAfter;k++){
      if(i+k>=checkpoints.length||checkpoints[i+k].boards!==c.boards){ok=false;break;}
    }
    if(ok)return checkpoints[i+stableAfter];
  }
  return null;
}
function run(row,h){
  const lines=toLines(row),config=toConfig(row),expected=lines.reduce((s,l)=>s+num(l.cant),0);
  const pre=optimizarV10(lines,{...config,usarMaster:false},nuevasMetricas());
  const prePlan=pre?.plan;
  const preValid=prePlan?validarPlanIndustrial(prePlan,expected):null;
  if(!prePlan||!preValid?.ok)return {error:"invalid-pre"};

  const preParity=prePlan.resumen.placas===num(h.preMasterBoards)&&pre.cota===num(h.lowerBound);
  const area=(config.placaBase-config.refiladoX)*(config.placaAltura-config.refiladoY);
  const mono=patronesMonotipo(lines,config);
  const gen=createIncrementalRustMasterGenerator(lines,config,40,7);
  const checkpoints=[];
  const preQuality=calidadPlanPlacas(prePlan.placas||[],prePlan.opts||config);
  let best={boards:prePlan.resumen.placas,quality:preQuality,source:"pre"};
  let prev=0;
  let firstLBSize=null;

  for(const size of CHECKPOINTS){
    const added=ORDER.slice(prev,size);
    const tg=performance.now();
    gen.execute(added);
    const patterns=gen.patterns(ORDER.slice(0,size));
    const generationDeltaMs=performance.now()-tg;
    let s={sol:null,ms:0};
    let improved=false;

    if(best.boards>pre.cota){
      s=solve(patterns.concat(mono),lines,area,best.boards,false,pre.cota);
      const mat=materializeSafe(s.sol,lines,prePlan,expected);
      if(mat&&Number.isFinite(mat.boards)&&mat.boards<best.boards){
        best={boards:mat.boards,quality:mat.quality,source:size};
        improved=true;
      }
    }
    if(best.boards===pre.cota&&firstLBSize===null) firstLBSize=size;

    checkpoints.push({
      size,added,boards:best.boards,quality:best.quality,improved,reachesLB:best.boards===pre.cota&&best.boards<prePlan.resumen.placas,
      generationDeltaMs,generationCpuMs:gen.generationCpuMs,patterns:patterns.length,
      solveMs:s.ms,nodes:s.sol?.nodos??null,exhausted:s.sol?.agotado??null,targetHit:s.sol?.objetivoAlcanzado??false
    });
    prev=size;
  }

  const allPatterns=gen.patterns();
  const fullSolve=solve(allPatterns.concat(mono),lines,area,prePlan.resumen.placas,true,null);
  const fullMat=materializeSafe(fullSolve.sol,lines,prePlan,expected);
  const fullRef=fullMat&&Number.isFinite(fullMat.boards)&&fullMat.boards<prePlan.resumen.placas
    ? {boards:fullMat.boards,quality:fullMat.quality,generationCpuMs:gen.generationCpuMs,solveMs:fullSolve.ms,nodes:fullSolve.sol?.nodos??null}
    : {boards:prePlan.resumen.placas,quality:preQuality,generationCpuMs:gen.generationCpuMs,solveMs:fullSolve.ms,nodes:fullSolve.sol?.nodos??null};

  const p1=firstPlateau(checkpoints,prePlan.resumen.placas,1);
  const p2=firstPlateau(checkpoints,prePlan.resumen.placas,2);
  const lb=firstLBSize!==null?checkpoints.find(c=>c.size===firstLBSize):null;
  const assess=c=>c?{
    size:c.size,boards:c.boards,cmpVsFull:objectiveCmp(c,fullRef),boardParity:c.boards===fullRef.boards,
    qualityCmpVsFull:c.boards===fullRef.boards?compararCalidad(c.quality,fullRef.quality):null,
    generationCpuMs:c.generationCpuMs,
    savedGenerationCpuPct:fullRef.generationCpuMs?1-c.generationCpuMs/fullRef.generationCpuMs:null
  }:null;

  return {
    order:h.order,pieces:features(row).pieceCount,typeCount:features(row).typeCount,
    gap:num(h.preMasterBoards)-num(h.lowerBound),historicalWin:Boolean(h.masterWin),
    historical:{preBoards:num(h.preMasterBoards),lowerBound:num(h.lowerBound),finalBoards:num(h.finalBoards)},
    preParity,preBoards:prePlan.resumen.placas,cota:pre.cota,
    full40:fullRef,
    firstImprovement:checkpoints.find(c=>c.improved)?.size??null,
    firstLB:assess(lb),plateau1:assess(p1),plateau2:assess(p2),
    checkpoints
  };
}
function main(){
  const manifest=JSON.parse(fs.readFileSync(MANIFEST,"utf8"));
  const raw=JSON.parse(fs.readFileSync(CANONICAL,"utf8"));
  const all=Array.isArray(raw)?raw:raw.cases||[];
  const byFile=new Map(all.map(r=>[features(r).file,r]));
  const eligible=(manifest.cases||[]).filter(gate)
    .filter(m=>num(m.typeCount)>4)
    .filter(m=>num(m.pieces)<=MAX_PIECES)
    .sort((a,b)=>(num(b.generationMs)+num(b.solveMs))-(num(a.generationMs)+num(a.solveMs)));

  const chosen=[],unavailable=[];
  for(const m of eligible){
    if(chosen.length>=MAX_CASES)break;
    let row=byFile.get(basename(m.file));
    if(!row)row=all.find(r=>String(r.case_id||r.source_path||"").includes(String(m.order)));
    if(!row){unavailable.push({order:m.order,reason:"missing"});continue;}
    const f=features(row);
    if(f.pieceCount!==num(m.pieces)||f.typeCount!==num(m.typeCount)){
      unavailable.push({order:m.order,reason:"snapshot"});continue;
    }
    chosen.push({m,row});
  }

  const records=[];
  for(const {m,row} of chosen){
    const rec=run(row,m);records.push(rec);
    console.log("CARRY_CASE",JSON.stringify({
      order:rec.order,gap:rec.gap,preParity:rec.preParity,full40:rec.full40.boards,
      firstImprovement:rec.firstImprovement,firstLB:rec.firstLB?.size??null,
      plateau1:rec.plateau1&&{size:rec.plateau1.size,cmp:rec.plateau1.cmpVsFull,saved:rec.plateau1.savedGenerationCpuPct},
      plateau2:rec.plateau2&&{size:rec.plateau2.size,cmp:rec.plateau2.cmpVsFull,saved:rec.plateau2.savedGenerationCpuPct},
      stages:rec.checkpoints.map(c=>({n:c.size,b:c.boards,lb:c.reachesLB,solve:c.solveMs,nodes:c.nodes,cpu:c.generationCpuMs}))
    }));
  }

  const scored=records.filter(r=>r.preParity);
  const p1=scored.filter(r=>r.plateau1);
  const p2=scored.filter(r=>r.plateau2);
  const summary={
    schema:"master-block4-carry-best-v1",generatedAt:new Date().toISOString(),
    order:ORDER,checkpoints:CHECKPOINTS,
    counts:{
      eligible:eligible.length,chosen:records.length,scored:scored.length,unavailable:unavailable.length,
      currentImprovements:scored.filter(r=>r.full40.boards<r.preBoards).map(r=>r.order),
      firstLBEarly:scored.filter(r=>r.firstLB&&r.firstLB.size<40).map(r=>({order:r.order,size:r.firstLB.size})),
      plateau1Candidates:p1.length,plateau1SafeVsFull:p1.filter(r=>r.plateau1.cmpVsFull>=0).length,
      plateau1Regressions:p1.filter(r=>r.plateau1.cmpVsFull<0).map(r=>r.order),
      plateau2Candidates:p2.length,plateau2SafeVsFull:p2.filter(r=>r.plateau2.cmpVsFull>=0).length,
      plateau2Regressions:p2.filter(r=>r.plateau2.cmpVsFull<0).map(r=>r.order),
    },
    averages:{
      plateau1SavedGenerationCpuPct:p1.length?p1.reduce((s,r)=>s+num(r.plateau1.savedGenerationCpuPct),0)/p1.length:null,
      plateau2SavedGenerationCpuPct:p2.length?p2.reduce((s,r)=>s+num(r.plateau2.savedGenerationCpuPct),0)/p2.length:null,
    },
    records,unavailable
  };
  fs.mkdirSync(OUT_DIR,{recursive:true});
  fs.writeFileSync(OUT,JSON.stringify(summary,null,2)+"\n");
  console.log("CARRY_SUMMARY",JSON.stringify({counts:summary.counts,averages:summary.averages}));
}
main();

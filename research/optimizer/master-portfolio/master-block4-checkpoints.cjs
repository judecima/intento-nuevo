"use strict";

const fs=require("node:fs");
const path=require("node:path");
const {performance}=require("node:perf_hooks");

const ROOT=path.resolve(__dirname,"../../..");
const CANONICAL=path.join(ROOT,"experiencia/canonical_cases.json");
const MANIFEST=path.join(ROOT,"research/optimizer/master-portfolio/MASTER_ACTIVE_323_MANIFEST_2026-09-18.json");
const OUT_DIR=path.join(ROOT,"research/optimizer/master-portfolio/out");
const OUT=path.join(OUT_DIR,"MASTER_BLOCK4_CHECKPOINTS_2026-09-21.json");

const LEGACY=path.join(ROOT,"src/lib/optimizer/legacy");
const {optimizarV10,nuevasMetricas,validarPlanIndustrial}=require(path.join(LEGACY,"v10.cjs"));
const {patronesMonotipo}=require(path.join(LEGACY,"patrones.cjs"));
const {resolverCobertura}=require(path.join(LEGACY,"cobertura.cjs"));
const {materializar}=require(path.join(LEGACY,"materializar.cjs"));
const {calidadPlanPlacas,compararCalidad}=require(path.join(LEGACY,"motor.cjs"));
const {createIncrementalRustMasterGenerator}=require("./incremental-rust-master.cjs");

const P16=Object.freeze([0,2,6,10,12,13,16,17,18,19,20,21,22,25,34,36]);
const CORE3=Object.freeze([0,2,6]);
const REMAINDER=Object.freeze([...Array(40).keys()].filter(r=>!P16.includes(r)));
const ORDER=Object.freeze([...P16,...REMAINDER]);
const CHECKPOINTS=Object.freeze([3,16,20,24,28,32,36,40]);

const MAX_CASES=Number(process.env.BLOCK4_MAX_CASES||12);
const MAX_PIECES=Number(process.env.BLOCK4_MAX_PIECES||250);
const PROBE_NODES=Number(process.env.BLOCK4_PROBE_NODES||100000);
const PROBE_WATCHDOG_MS=Number(process.env.BLOCK4_PROBE_WATCHDOG_MS||300);
const FULL_NODES=Number(process.env.BLOCK4_FULL_NODES||1600000);
const FULL_WATCHDOG_MS=Number(process.env.BLOCK4_FULL_WATCHDOG_MS||12000);

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
function historicalQuality(h){
  const q=h?.quality||{};
  return {
    mayor:num(q.largestCommercialRemnantM2)*1e6,
    segundo:num(q.secondLargestCommercialRemnantM2)*1e6,
    fragmentos:num(q.commercialRemnantCount),
    total:num(q.commercialRemnantAreaM2)*1e6,
  };
}
function solve(pool,lines,area,incumbent,isFinal){
  const t=performance.now();
  const h=resolverCobertura(pool,lines.map(l=>l.cant),area,incumbent,8000,{
    maxNodos:isFinal?FULL_NODES:PROBE_NODES,
    watchdogMs:isFinal?FULL_WATCHDOG_MS:PROBE_WATCHDOG_MS,
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
function run(row,h){
  const lines=toLines(row),config=toConfig(row),expected=lines.reduce((s,l)=>s+num(l.cant),0);
  const preStart=performance.now();
  const pre=optimizarV10(lines,{...config,usarMaster:false},nuevasMetricas());
  const preMs=performance.now()-preStart;
  const prePlan=pre?.plan;
  const preValid=prePlan?validarPlanIndustrial(prePlan,expected):null;
  if(!prePlan||!preValid?.ok)return {error:"invalid-pre"};

  const preParity=prePlan.resumen.placas===num(h.preMasterBoards)&&pre.cota===num(h.lowerBound);
  const area=(config.placaBase-config.refiladoX)*(config.placaAltura-config.refiladoY);
  const monoStart=performance.now();
  const mono=patronesMonotipo(lines,config);
  const monoMs=performance.now()-monoStart;
  const gen=createIncrementalRustMasterGenerator(lines,config,40,7);

  const checkpoints=[];
  let prev=0,stop=null;
  for(const size of CHECKPOINTS){
    const added=ORDER.slice(prev,size);
    const tg=performance.now();
    gen.execute(added);
    const patterns=gen.patterns(ORDER.slice(0,size));
    const generationDeltaMs=performance.now()-tg;
    const isFinal=size===40;
    const s=solve(patterns.concat(mono),lines,area,prePlan.resumen.placas,isFinal);
    const mat=materializeSafe(s.sol,lines,prePlan,expected);
    const boards=mat&&Number.isFinite(mat.boards)&&mat.boards<prePlan.resumen.placas?mat.boards:prePlan.resumen.placas;
    const quality=mat&&boards===mat.boards?mat.quality:calidadPlanPlacas(prePlan.placas||[],prePlan.opts||config);
    const reachesLB=boards===pre.cota&&boards<prePlan.resumen.placas;
    const histBoards=num(h.finalBoards);
    const boardCmp=boards<histBoards?1:boards>histBoards?-1:0;
    const qcmp=boardCmp===0?compararCalidad(quality,historicalQuality(h)):null;
    const objectiveParity=boardCmp===0&&qcmp===0;
    const objectiveNotWorse=boardCmp>0||(boardCmp===0&&qcmp>=0);
    const cp={
      size,added,rounds:ORDER.slice(0,size),generationDeltaMs,generationCpuMs:gen.generationCpuMs,
      patterns:patterns.length,solveMs:s.ms,nodes:s.sol?.nodos??null,exhausted:s.sol?.agotado??null,
      boards,reachesLB,boardCmpVsHistorical:boardCmp,qualityCmpVsHistorical:qcmp,
      objectiveParity,objectiveNotWorse
    };
    checkpoints.push(cp);
    if(!stop&&reachesLB){
      stop={size,boards,quality,objectiveParity,objectiveNotWorse};
      break;
    }
    prev=size;
  }

  // If we stopped before 40, this is the actual proposed runtime result.
  // Otherwise the 40-stage result is the actual result.
  const terminal=checkpoints[checkpoints.length-1];
  return {
    order:h.order,pieces:features(row).pieceCount,typeCount:features(row).typeCount,
    gap:num(h.preMasterBoards)-num(h.lowerBound),historicalWin:Boolean(h.masterWin),
    historical:{preBoards:num(h.preMasterBoards),lowerBound:num(h.lowerBound),finalBoards:num(h.finalBoards),quality:historicalQuality(h)},
    preMs,preParity,monoMs,stoppedAt:stop?.size??40,
    terminalObjectiveNotWorse:terminal.objectiveNotWorse,
    terminalBoardCmp:terminal.boardCmpVsHistorical,
    terminalQualityCmp:terminal.qualityCmpVsHistorical,
    checkpoints
  };
}
function main(){
  const manifest=JSON.parse(fs.readFileSync(MANIFEST,"utf8"));
  const raw=JSON.parse(fs.readFileSync(CANONICAL,"utf8"));
  const all=Array.isArray(raw)?raw:raw.cases||[];
  const byFile=new Map(all.map(r=>[features(r).file,r]));

  const eligible=(manifest.cases||[]).filter(gate).filter(m=>num(m.pieces)<=MAX_PIECES)
    .sort((a,b)=>(num(b.generationMs)+num(b.monotypeMs)+num(b.solveMs))-(num(a.generationMs)+num(a.monotypeMs)+num(a.solveMs)));

  const must=new Set([4050594,4056900,4057401,4059200]);
  const chosen=[],unavailable=[];
  for(const m of eligible){
    if(chosen.length>=MAX_CASES&&!must.has(num(m.order)))continue;
    let row=byFile.get(basename(m.file));
    if(!row)row=all.find(r=>String(r.case_id||r.source_path||"").includes(String(m.order)));
    if(!row){unavailable.push({order:m.order,reason:"missing"});continue;}
    const f=features(row);
    if(f.pieceCount!==num(m.pieces)||f.typeCount!==num(m.typeCount)){
      unavailable.push({order:m.order,reason:"snapshot",historical:{pieces:num(m.pieces),types:num(m.typeCount)},current:f});
      continue;
    }
    chosen.push({m,row});
  }

  const records=[];
  for(const {m,row} of chosen){
    const rec=run(row,m);
    records.push(rec);
    console.log("BLOCK4_CASE",JSON.stringify({
      order:rec.order,gap:rec.gap,win:rec.historicalWin,preParity:rec.preParity,
      stoppedAt:rec.stoppedAt,terminalObjectiveNotWorse:rec.terminalObjectiveNotWorse,
      checkpoints:rec.checkpoints.map(c=>({n:c.size,b:c.boards,lb:c.reachesLB,obj:c.objectiveParity,q:c.qualityCmpVsHistorical,genCpu:c.generationCpuMs,solve:c.solveMs,nodes:c.nodes}))
    }));
  }

  const scored=records.filter(r=>r.preParity);
  const stopCounts={};
  for(const r of scored)stopCounts[r.stoppedAt]=(stopCounts[r.stoppedAt]||0)+1;
  const firstHistoricalBoardMatch={};
  const firstHistoricalObjectiveMatch={};
  for(const r of scored){
    firstHistoricalBoardMatch[r.order]=r.checkpoints.find(c=>c.boardCmpVsHistorical===0)?.size??null;
    firstHistoricalObjectiveMatch[r.order]=r.checkpoints.find(c=>c.objectiveParity)?.size??null;
  }
  const summary={
    schema:"master-block4-checkpoints-v1",generatedAt:new Date().toISOString(),
    order:ORDER,checkpoints:CHECKPOINTS,
    policy:{
      stages:"Core3 -> P16 -> +4 until 40",
      stop:"only when valid improving solution reaches current lower bound",
      intermediateSolver:{maxNodes:PROBE_NODES,watchdogMs:PROBE_WATCHDOG_MS},
      finalSolver:{maxNodes:FULL_NODES,watchdogMs:FULL_WATCHDOG_MS}
    },
    counts:{
      eligible:eligible.length,chosen:records.length,scored:scored.length,unavailable:unavailable.length,
      objectiveNotWorse:scored.filter(r=>r.terminalObjectiveNotWorse).length,
      boardRegressions:scored.filter(r=>r.terminalBoardCmp<0).map(r=>r.order),
      qualityRegressions:scored.filter(r=>r.terminalBoardCmp===0&&r.terminalQualityCmp<0).map(r=>r.order),
      stopCounts
    },
    firstHistoricalBoardMatch,firstHistoricalObjectiveMatch,
    pass:scored.length>0&&scored.every(r=>r.terminalObjectiveNotWorse),
    unavailable,records
  };
  fs.mkdirSync(OUT_DIR,{recursive:true});
  fs.writeFileSync(OUT,JSON.stringify(summary,null,2)+"\n","utf8");
  console.log("BLOCK4_SUMMARY",JSON.stringify({
    pass:summary.pass,counts:summary.counts,
    firstHistoricalBoardMatch,firstHistoricalObjectiveMatch
  }));
  if(!summary.pass)process.exitCode=2;
}
main();

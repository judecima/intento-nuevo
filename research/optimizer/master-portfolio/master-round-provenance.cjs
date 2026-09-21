"use strict";

const fs=require("node:fs");
const path=require("node:path");
const {performance}=require("node:perf_hooks");

const ROOT=path.resolve(__dirname,"../../..");
const CANONICAL=path.join(ROOT,"experiencia/canonical_cases.json");
const MANIFEST=path.join(ROOT,"research/optimizer/master-portfolio/MASTER_ACTIVE_323_MANIFEST_2026-09-18.json");
const FIX4056900=path.join(ROOT,"research/optimizer/pattern-generators/guide-slice/INDUSTRIAL_PORTFOLIO_4056900_CHECKPOINT_2026-09-14.json");
const OUT_DIR=path.join(ROOT,"research/optimizer/master-portfolio/out");
const OUT=path.join(OUT_DIR,"MASTER_ROUND_PROVENANCE_2026-09-21.json");

const LEGACY=path.join(ROOT,"src/lib/optimizer/legacy");
const {optimizarV10,nuevasMetricas,validarPlanIndustrial}=require(path.join(LEGACY,"v10.cjs"));
const {patronesMonotipo}=require(path.join(LEGACY,"patrones.cjs"));
const {resolverCobertura}=require(path.join(LEGACY,"cobertura.cjs"));
const {materializar}=require(path.join(LEGACY,"materializar.cjs"));
const {calidadPlanPlacas,compararCalidad}=require(path.join(LEGACY,"motor.cjs"));
const {createIncrementalRustMasterGenerator}=require("./incremental-rust-master.cjs");

const THRESHOLD=Number(process.env.MASTER_GATE_MULT||4.75);
const MAX_CASES=Number(process.env.PROV_MAX_CASES||12);
const MAX_PIECES=Number(process.env.PROV_MAX_PIECES||180);
const MASTER_MS=Number(process.env.PROV_MASTER_MS||8000);

function num(v,f=0){const n=Number(v);return Number.isFinite(n)?n:f;}
function boolTrue(v){return v===true||v===1||v==="1"||v==="true"||v==="TRUE";}
function basename(v){return typeof v==="string"?v.replaceAll("\\","/").split("/").pop():null;}
function qty(p){for(const k of ["quantity","qty","count","cant","num","q","qMin"]){const n=Number(p?.[k]);if(Number.isFinite(n)&&n>0)return n;}return 1;}
function dims(p){return {w:num(p?.width??p?.base??p?.l??p?.L),h:num(p?.height??p?.altura??p?.w??p?.W)};}
function features(row){
  const ps=Array.isArray(row.pieces)?row.pieces:[];
  return {
    file:basename(row.source_path||((row.case_id||"")+".xml")),
    pieceCount:num(row.piece_count,ps.reduce((s,p)=>s+qty(p),0)),
    typeCount:num(row.piece_types,ps.length),
  };
}
function gate(m){
  const gap=num(m.preMasterBoards)-num(m.lowerBound);
  const mult=num(m.typeCount)?num(m.pieces)/num(m.typeCount):0;
  return gap>1||mult>=THRESHOLD;
}
function toLines(row){
  const fmt=String(row.source_format||"").toLowerCase();
  return (row.pieces||[]).map((p,i)=>({
    ref:String(i+1),detalle:String(i+1),cant:qty(p),base:dims(p).w,altura:dims(p).h,
    veta:fmt==="order"&&(boolTrue(p?.xmlPartGrain)||boolTrue(p?.rawGrain)||boolTrue(p?.grain)),
    cantos:null,
  }));
}
function toConfig(row){
  const fmt=String(row.source_format||"").toLowerCase();
  return {
    placaBase:num(row.stock_width,2600),placaAltura:num(row.stock_height,1830),
    refiladoX:0,refiladoY:0,sierra:num(row.saw,4.5),etapas:4,
    materialConVeta:fmt==="order"?boolTrue(row.directional):false,
    descontarCanto:false,cantoEspesor:0,restoMin:250,restoMax:400,
    usarCache:true,maxPiezasCache:3000,usarCompactacion:true,usarMultiSlice:true,usarOneBoard:true,
    usarMaster:false,rondasPatrones:40,msMaster:MASTER_MS,
  };
}
function synthetic4056900(){
  const cp=JSON.parse(fs.readFileSync(FIX4056900,"utf8")).source;
  return {
    case_id:"4056900__Alfredo_Arrua4056900",source_path:cp.file,source_format:cp.format,
    stock_width:cp.board.width,stock_height:cp.board.height,saw:cp.board.kerf,directional:false,
    piece_count:cp.pieceQuantity,piece_types:cp.pieceTypes,
    pieces:cp.lines.map(x=>({base:x.width,altura:x.height,cant:x.quantity})),
    _syntheticFrozen:true,
  };
}
function synthetic4057401(){
  return {
    case_id:"4057401__GABRIEL_TUMBACO CRUZ4057401",source_path:"4057401__GABRIEL_TUMBACO CRUZ4057401.xml",
    source_format:"project",stock_width:2742,stock_height:1822,saw:4.5,directional:false,
    piece_count:19,piece_types:4,
    pieces:[
      {base:1800,altura:1050,cant:2},{base:2000,altura:1100,cant:2},
      {base:1900,altura:1500,cant:1},{base:744,altura:450,cant:14},
    ],_syntheticFrozen:true,
  };
}
function solve(pool,lines,area,incumbent){
  const h=resolverCobertura(
    pool,lines.map(l=>l.cant),area,incumbent,MASTER_MS,
    {maxNodos:1600000,watchdogMs:12000,provenance:true}
  );
  return h?h.resolver(lines.map(l=>l.base*l.altura)):null;
}
function materialize(sol,lines,prePlan,expected){
  if(!sol?.plan)return {valid:false,boards:sol?.placas??null,quality:null,plan:null};
  try{
    const plan=materializar(sol.plan,lines,prePlan.opts);
    const v=plan?validarPlanIndustrial(plan,expected):null;
    return {
      valid:v?.ok??false,
      boards:plan?.resumen?.placas??sol?.placas??null,
      quality:plan?calidadPlanPlacas(plan.placas||[],plan.opts||prePlan.opts):null,
      plan
    };
  }catch(_){return {valid:false,boards:null,quality:null,plan:null};}
}
function roundOfPattern(p){return Number.isInteger(p?.placa?._researchRound)?p.placa._researchRound:null;}

function run(row,historical){
  const lines=toLines(row),config=toConfig(row),expected=lines.reduce((s,l)=>s+num(l.cant),0);
  const pre=optimizarV10(lines,{...config,usarMaster:false},nuevasMetricas());
  const prePlan=pre?.plan;
  const preValid=prePlan?validarPlanIndustrial(prePlan,expected):null;
  if(!prePlan||!preValid?.ok)return {error:"invalid-pre"};

  const gen=createIncrementalRustMasterGenerator(lines,config,40,7);
  const tGen=performance.now();
  gen.execute([...Array(40).keys()]);
  const patterns=gen.patterns();
  const generationWallMs=performance.now()-tGen;
  const mono=patronesMonotipo(lines,config);
  for(const p of mono){
    if(p?.placa && typeof p.placa==="object"){
      Object.defineProperty(p.placa,"_researchOrigin",{value:"monotype",enumerable:false,configurable:true});
    }
  }
  const area=(config.placaBase-config.refiladoX)*(config.placaAltura-config.refiladoY);

  const tSolve=performance.now();
  const fullSol=solve(patterns.concat(mono),lines,area,prePlan.resumen.placas);
  const solveMs=performance.now()-tSolve;
  const full=materialize(fullSol,lines,prePlan,expected);
  const finalBoards=full.valid&&Number.isFinite(full.boards)&&full.boards<prePlan.resumen.placas?full.boards:prePlan.resumen.placas;
  const finalQuality=full.valid&&full.boards===finalBoards?full.quality:calidadPlanPlacas(prePlan.placas||[],prePlan.opts||config);

  const usedRounds=[...new Set((fullSol?.plan||[]).map(roundOfPattern).filter(Number.isInteger))].sort((a,b)=>a-b);
  const ablations=[];
  for(const round of usedRounds){
    const reduced=patterns.filter(p=>roundOfPattern(p)!==round).concat(mono);
    const t=performance.now();
    const sol=solve(reduced,lines,area,prePlan.resumen.placas);
    const solveWallMs=performance.now()-t;
    const mat=materialize(sol,lines,prePlan,expected);
    const altBoards=mat.valid&&Number.isFinite(mat.boards)&&mat.boards<prePlan.resumen.placas?mat.boards:prePlan.resumen.placas;
    const altQuality=mat.valid&&mat.boards===altBoards?mat.quality:calidadPlanPlacas(prePlan.placas||[],prePlan.opts||config);
    const cmp=altBoards===finalBoards?compararCalidad(altQuality,finalQuality):null;
    ablations.push({
      round,altBoards,fullBoards:finalBoards,boardEssential:altBoards>finalBoards,
      qualityCmpVsFull:cmp,remnantSensitive:altBoards===finalBoards&&cmp<0,
      noWorseWithoutRound:altBoards===finalBoards&&cmp>=0,
      solveWallMs,nodes:sol?.nodos??null,exhausted:sol?.agotado??null,
    });
  }

  const stats=gen.roundStats();
  const byRound=new Map(stats.map(s=>[s.round,{...s}]));
  for(const [round,count] of Object.entries(fullSol?.provenance?.expandedByRound||{})){
    const r=Number(round);
    if(Number.isInteger(r)&&byRound.has(r))byRound.get(r).solverExpansions=num(count);
  }
  for(const [round,count] of Object.entries(fullSol?.provenance?.candidateVisitsByRound||{})){
    const r=Number(round);
    if(Number.isInteger(r)&&byRound.has(r))byRound.get(r).solverCandidateVisits=num(count);
  }
  const usedCounts={};
  for(const p of fullSol?.plan||[]){
    const r=roundOfPattern(p);
    if(Number.isInteger(r))usedCounts[r]=(usedCounts[r]||0)+1;
  }
  for(const [r,c] of Object.entries(usedCounts)){
    if(byRound.has(Number(r)))byRound.get(Number(r)).usedInWinningPlan=c;
  }

  return {
    order:historical.order,file:features(row).file,
    historical:{masterWin:Boolean(historical.masterWin),generationMs:num(historical.generationMs),solveMs:num(historical.solveMs),preMasterBoards:num(historical.preMasterBoards),lowerBound:num(historical.lowerBound),finalBoards:num(historical.finalBoards)},
    preBoards:prePlan.resumen.placas,cota:pre.cota,
    generationWallMs,generationCpuMs:gen.generationCpuMs,solveMs,
    patternCount:patterns.length,monotypes:mono.length,nodes:fullSol?.nodos??null,exhausted:fullSol?.agotado??null,
    fullBoards:finalBoards,historicalParity:finalBoards===num(historical.finalBoards),
    usedRounds,rounds:stats.map(s=>byRound.get(s.round)),ablations,
  };
}

function main(){
  const manifest=JSON.parse(fs.readFileSync(MANIFEST,"utf8"));
  const raw=JSON.parse(fs.readFileSync(CANONICAL,"utf8"));
  const all=Array.isArray(raw)?raw:raw.cases||[];
  const byFile=new Map(all.map(r=>[features(r).file,r]));
  const mandatory=new Set([4050594,4056900,4057401]);
  const candidates=(manifest.cases||[]).filter(gate)
    .filter(m=>num(m.pieces)<=MAX_PIECES)
    .sort((a,b)=>num(b.generationMs)-num(a.generationMs));

  const selected=[];
  for(const m of candidates){
    if(selected.length>=MAX_CASES&&!mandatory.has(num(m.order)))continue;
    let row=
      num(m.order)===4056900?synthetic4056900():
      num(m.order)===4057401?synthetic4057401():
      byFile.get(basename(m.file));
    if(!row)row=all.find(r=>String(r.case_id||r.source_path||"").includes(String(m.order)));
    if(!row)continue;
    const f=features(row);
    if(f.pieceCount!==num(m.pieces)||f.typeCount!==num(m.typeCount))continue;
    selected.push({m,row});
  }
  for(const order of mandatory){
    if(selected.some(x=>num(x.m.order)===order))continue;
    const m=(manifest.cases||[]).find(x=>num(x.order)===order); if(!m)continue;
    const row=order===4056900?synthetic4056900():order===4057401?synthetic4057401():byFile.get(basename(m.file));
    if(row)selected.push({m,row});
  }

  const records=[];
  for(const {m,row} of selected){
    const rec=run(row,m);records.push(rec);
    console.log("PROV_CASE",JSON.stringify({
      order:rec.order,win:rec.historical?.masterWin,parity:rec.historicalParity,
      fullBoards:rec.fullBoards,usedRounds:rec.usedRounds,
      essential:rec.ablations?.filter(x=>x.boardEssential).map(x=>x.round),
      remnantSensitive:rec.ablations?.filter(x=>x.remnantSensitive).map(x=>x.round),
      generationCpuMs:rec.generationCpuMs,patterns:rec.patternCount,nodes:rec.nodes
    }));
  }

  const scored=records.filter(r=>r&&r.historicalParity);
  const roundAgg=new Map();
  for(const rec of scored){
    for(const s of rec.rounds||[]){
      let a=roundAgg.get(s.round);
      if(!a){a={round:s.round,cases:0,cpuMs:0,rawBoards:0,dedupPatterns:0,solverExpansions:0,solverCandidateVisits:0,usedInWinningPlan:0,boardEssentialCases:0,remnantSensitiveCases:0};roundAgg.set(s.round,a);}
      a.cases++;a.cpuMs+=num(s.cpuMs);a.rawBoards+=num(s.rawBoards);a.dedupPatterns+=num(s.dedupPatterns);
      a.solverExpansions+=num(s.solverExpansions);a.solverCandidateVisits+=num(s.solverCandidateVisits);a.usedInWinningPlan+=num(s.usedInWinningPlan);
    }
    for(const a of rec.ablations||[]){
      const x=roundAgg.get(a.round); if(!x)continue;
      if(a.boardEssential)x.boardEssentialCases++;
      if(a.remnantSensitive)x.remnantSensitiveCases++;
    }
  }
  const rounds=[...roundAgg.values()].map(x=>({
    ...x,
    usefulScore:x.boardEssentialCases*1000+x.remnantSensitiveCases*200+x.usedInWinningPlan*20+x.solverExpansions,
    costEffectiveness:x.cpuMs>0?(x.boardEssentialCases*1000+x.remnantSensitiveCases*200+x.usedInWinningPlan*20+x.solverExpansions)/x.cpuMs:null,
  })).sort((a,b)=>b.usefulScore-a.usefulScore||a.cpuMs-b.cpuMs);

  const summary={
    schema:"master-round-provenance-v1",generatedAt:new Date().toISOString(),
    selected:records.length,scored:scored.length,
    winners:scored.filter(r=>r.historical.masterWin).map(r=>r.order),
    allHistoricalParity:records.length>0&&records.every(r=>r.historicalParity),
    roundsByUsefulness:rounds,
    zeroContributionRounds:rounds.filter(r=>r.usedInWinningPlan===0&&r.boardEssentialCases===0&&r.remnantSensitiveCases===0&&r.solverExpansions===0).map(r=>r.round),
    neverUsedInWinningPlan:rounds.filter(r=>r.usedInWinningPlan===0).map(r=>r.round),
    records,
  };
  fs.mkdirSync(OUT_DIR,{recursive:true});
  fs.writeFileSync(OUT,JSON.stringify(summary,null,2)+"\n","utf8");
  console.log("PROV_SUMMARY",JSON.stringify({
    selected:summary.selected,scored:summary.scored,winners:summary.winners,allHistoricalParity:summary.allHistoricalParity,
    zeroContributionRounds:summary.zeroContributionRounds,
    neverUsedInWinningPlan:summary.neverUsedInWinningPlan,
    topRounds:summary.roundsByUsefulness.slice(0,12).map(r=>({round:r.round,cpuMs:r.cpuMs,used:r.usedInWinningPlan,essential:r.boardEssentialCases,remnant:r.remnantSensitiveCases,exp:r.solverExpansions}))
  }));
}
main();

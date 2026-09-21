"use strict";

const fs=require("node:fs");
const path=require("node:path");
const {performance}=require("node:perf_hooks");

const ROOT=path.resolve(__dirname,"../../..");
const CANONICAL=path.join(ROOT,"experiencia/canonical_cases.json");
const MANIFEST=path.join(ROOT,"research/optimizer/master-portfolio/MASTER_ACTIVE_323_MANIFEST_2026-09-18.json");
const FIX4056900=path.join(ROOT,"research/optimizer/pattern-generators/guide-slice/INDUSTRIAL_PORTFOLIO_4056900_CHECKPOINT_2026-09-14.json");
const OUT_DIR=path.join(ROOT,"research/optimizer/master-portfolio/out");
const OUT=path.join(OUT_DIR,"MASTER_P16_CHECKPOINTS_2026-09-21.json");

const LEGACY=path.join(ROOT,"src/lib/optimizer/legacy");
const {optimizarV10,nuevasMetricas,validarPlanIndustrial}=require(path.join(LEGACY,"v10.cjs"));
const {patronesMonotipo}=require(path.join(LEGACY,"patrones.cjs"));
const {resolverCobertura}=require(path.join(LEGACY,"cobertura.cjs"));
const {materializar}=require(path.join(LEGACY,"materializar.cjs"));
const {calidadPlanPlacas,compararCalidad}=require(path.join(LEGACY,"motor.cjs"));
const {createIncrementalRustMasterGenerator}=require("./incremental-rust-master.cjs");

const ORDER=Object.freeze([0,2,6,20,36,22,17,10,12,13,16,18,19,21,25,34]);
const CHECKPOINTS=Object.freeze([3,5,6,8,12,16]);
const MAX_CASES=Number(process.env.CHECK_MAX_CASES||4);
const MAX_PIECES=Number(process.env.CHECK_MAX_PIECES||180);
const EARLY_NODES=Number(process.env.CHECK_EARLY_NODES||200000);
const EARLY_WATCHDOG_MS=Number(process.env.CHECK_EARLY_WATCHDOG_MS||1500);
const FULL_NODES=Number(process.env.CHECK_FULL_NODES||1600000);
const FULL_WATCHDOG_MS=Number(process.env.CHECK_FULL_WATCHDOG_MS||12000);

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
  return (row.pieces||[]).map((p,i)=>({ref:String(i+1),detalle:String(i+1),cant:qty(p),base:dims(p).w,altura:dims(p).h,veta:fmt==="order"&&(boolTrue(p?.xmlPartGrain)||boolTrue(p?.rawGrain)||boolTrue(p?.grain)),cantos:null}));
}
function toConfig(row){
  const fmt=String(row.source_format||"").toLowerCase();
  return {placaBase:num(row.stock_width,2600),placaAltura:num(row.stock_height,1830),refiladoX:0,refiladoY:0,sierra:num(row.saw,4.5),etapas:4,materialConVeta:fmt==="order"?boolTrue(row.directional):false,descontarCanto:false,cantoEspesor:0,restoMin:250,restoMax:400,usarCache:true,maxPiezasCache:3000,usarCompactacion:true,usarMultiSlice:true,usarOneBoard:true,usarMaster:false,rondasPatrones:40,msMaster:8000};
}
function synthetic4056900(){
  const cp=JSON.parse(fs.readFileSync(FIX4056900,"utf8")).source;
  return {case_id:"4056900__Alfredo_Arrua4056900",source_path:cp.file,source_format:cp.format,stock_width:cp.board.width,stock_height:cp.board.height,saw:cp.board.kerf,directional:false,piece_count:cp.pieceQuantity,piece_types:cp.pieceTypes,pieces:cp.lines.map(x=>({base:x.width,altura:x.height,cant:x.quantity}))};
}
function synthetic4057401(){
  return {case_id:"4057401__GABRIEL_TUMBACO CRUZ4057401",source_path:"4057401__GABRIEL_TUMBACO CRUZ4057401.xml",source_format:"project",stock_width:2742,stock_height:1822,saw:4.5,directional:false,piece_count:19,piece_types:4,pieces:[{base:1800,altura:1050,cant:2},{base:2000,altura:1100,cant:2},{base:1900,altura:1500,cant:1},{base:744,altura:450,cant:14}]};
}
function solve(pool,lines,area,incumbent,maxNodos,watchdogMs){
  const t=performance.now();
  const h=resolverCobertura(pool,lines.map(l=>l.cant),area,incumbent,8000,{maxNodos,watchdogMs});
  const sol=h?h.resolver(lines.map(l=>l.base*l.altura)):null;
  return {sol,ms:performance.now()-t};
}
function materialize(sol,lines,prePlan,expected){
  if(!sol?.plan)return {valid:false,boards:sol?.placas??null,quality:null};
  try{
    const plan=materializar(sol.plan,lines,prePlan.opts);
    const v=plan?validarPlanIndustrial(plan,expected):null;
    return {valid:v?.ok??false,boards:plan?.resumen?.placas??sol?.placas??null,quality:plan?calidadPlanPlacas(plan.placas||[],plan.opts||prePlan.opts):null};
  }catch(_){return {valid:false,boards:null,quality:null};}
}
function full40Reference(lines,config,prePlan,expected){
  const gen=createIncrementalRustMasterGenerator(lines,config,40,7);
  const t=performance.now(); gen.execute([...Array(40).keys()]); const patterns=gen.patterns(); const generationMs=performance.now()-t;
  const mono=patronesMonotipo(lines,config);
  const area=(config.placaBase-config.refiladoX)*(config.placaAltura-config.refiladoY);
  const s=solve(patterns.concat(mono),lines,area,prePlan.resumen.placas,FULL_NODES,FULL_WATCHDOG_MS);
  const m=materialize(s.sol,lines,prePlan,expected);
  const improved=m.valid&&Number.isFinite(m.boards)&&m.boards<prePlan.resumen.placas;
  return {boards:improved?m.boards:prePlan.resumen.placas,quality:improved?m.quality:calidadPlanPlacas(prePlan.placas||[],prePlan.opts||config),generationMs,solveMs:s.ms,patterns:patterns.length,nodes:s.sol?.nodos??null,exhausted:s.sol?.agotado??null};
}
function run(row,historical){
  const lines=toLines(row),config=toConfig(row),expected=lines.reduce((s,l)=>s+num(l.cant),0);
  const pre=optimizarV10(lines,{...config,usarMaster:false},nuevasMetricas());
  const prePlan=pre?.plan; const v=prePlan?validarPlanIndustrial(prePlan,expected):null;
  if(!prePlan||!v?.ok)return {error:"invalid-pre"};
  const ref=full40Reference(lines,config,prePlan,expected);
  const gen=createIncrementalRustMasterGenerator(lines,config,40,7);
  const mono=patronesMonotipo(lines,config);
  const area=(config.placaBase-config.refiladoX)*(config.placaAltura-config.refiladoY);
  const checkpoints=[];
  let prev=0;
  for(const size of CHECKPOINTS){
    const added=ORDER.slice(prev,size);
    const tg=performance.now(); gen.execute(added); const patterns=gen.patterns(ORDER.slice(0,size)); const generationDeltaMs=performance.now()-tg;
    const s=solve(patterns.concat(mono),lines,area,prePlan.resumen.placas,EARLY_NODES,EARLY_WATCHDOG_MS);
    const m=materialize(s.sol,lines,prePlan,expected);
    const boards=m.valid&&Number.isFinite(m.boards)&&m.boards<prePlan.resumen.placas?m.boards:prePlan.resumen.placas;
    const quality=m.valid&&boards===m.boards?m.quality:calidadPlanPlacas(prePlan.placas||[],prePlan.opts||config);
    const boardParity=boards===ref.boards;
    const qualityCmp=boardParity?compararCalidad(quality,ref.quality):null;
    checkpoints.push({
      size,rounds:ORDER.slice(0,size),added,generationDeltaMs,generationCpuMs:gen.generationCpuMs,
      patterns:patterns.length,solveMs:s.ms,nodes:s.sol?.nodos??null,exhausted:s.sol?.agotado??null,
      boards,boardParity,qualityCmpVsFull:qualityCmp,qualityNotWorse:qualityCmp!==null&&qualityCmp>=0,
      reachesLowerBound:boards===pre.cota,
      empiricallySafeStop:boards===ref.boards&&qualityCmp!==null&&qualityCmp>=0&&boards===pre.cota
    });
    prev=size;
  }
  return {
    order:historical.order,typeCount:features(row).typeCount,pieces:features(row).pieceCount,
    historicalWin:Boolean(historical.masterWin),preBoards:prePlan.resumen.placas,cota:pre.cota,
    reference:ref,historicalParity:ref.boards===num(historical.finalBoards),checkpoints
  };
}
function main(){
  const manifest=JSON.parse(fs.readFileSync(MANIFEST,"utf8"));
  const raw=JSON.parse(fs.readFileSync(CANONICAL,"utf8")); const all=Array.isArray(raw)?raw:raw.cases||[];
  const byFile=new Map(all.map(r=>[features(r).file,r]));
  const mandatory=new Set([4050594,4056900,4057401]);
  const hist=(manifest.cases||[]).filter(gate).filter(m=>num(m.preMasterBoards)-num(m.lowerBound)===1).filter(m=>num(m.pieces)<=MAX_PIECES).sort((a,b)=>num(b.generationMs)-num(a.generationMs));
  const chosen=[];
  for(const m of hist){
    if(chosen.length>=MAX_CASES&&!mandatory.has(num(m.order)))continue;
    let row=num(m.order)===4056900?synthetic4056900():num(m.order)===4057401?synthetic4057401():byFile.get(basename(m.file));
    if(!row)row=all.find(r=>String(r.case_id||r.source_path||"").includes(String(m.order)));
    if(!row)continue; const f=features(row);
    if(f.pieceCount!==num(m.pieces)||f.typeCount!==num(m.typeCount))continue;
    chosen.push({m,row});
  }
  for(const order of mandatory){
    if(chosen.some(x=>num(x.m.order)===order))continue;
    const m=(manifest.cases||[]).find(x=>num(x.order)===order);if(!m)continue;
    const row=order===4056900?synthetic4056900():order===4057401?synthetic4057401():byFile.get(basename(m.file));
    if(row)chosen.push({m,row});
  }
  const records=chosen.map(({m,row})=>{
    const rec=run(row,m);
    console.log("CHECK_CASE",JSON.stringify({order:rec.order,typeCount:rec.typeCount,win:rec.historicalWin,parity:rec.historicalParity,refBoards:rec.reference?.boards,checkpoints:rec.checkpoints?.map(c=>({size:c.size,boards:c.boards,lb:c.reachesLowerBound,q:c.qualityCmpVsFull,safe:c.empiricallySafeStop,genCpu:c.generationCpuMs,solveMs:c.solveMs}))}));
    return rec;
  });
  const scored=records.filter(r=>r.historicalParity);
  const gt4=scored.filter(r=>r.typeCount>4);
  const winners=scored.filter(r=>r.historicalWin);
  function firstSafe(rec){return rec.checkpoints.find(c=>c.empiricallySafeStop)||null;}
  const summary={
    schema:"master-p16-checkpoints-v1",generatedAt:new Date().toISOString(),
    order:ORDER,checkpoints:CHECKPOINTS,
    counts:{selected:records.length,scored:scored.length,gt4:gt4.length,winners:winners.map(r=>r.order)},
    firstSafeByWinner:winners.map(r=>({order:r.order,typeCount:r.typeCount,firstSafe:firstSafe(r)?.size??null,rounds:firstSafe(r)?.rounds??null})),
    firstSafeGt4:gt4.filter(r=>r.historicalWin).map(r=>({order:r.order,firstSafe:firstSafe(r)?.size??null,rounds:firstSafe(r)?.rounds??null})),
    records
  };
  fs.mkdirSync(OUT_DIR,{recursive:true});fs.writeFileSync(OUT,JSON.stringify(summary,null,2)+"\n");
  console.log("CHECK_SUMMARY",JSON.stringify({counts:summary.counts,firstSafeByWinner:summary.firstSafeByWinner,firstSafeGt4:summary.firstSafeGt4}));
}
main();

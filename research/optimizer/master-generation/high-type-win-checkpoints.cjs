"use strict";

const fs=require("node:fs");
const path=require("node:path");
const ROOT=path.resolve(__dirname,"../../..");
const CORPUS=path.join(ROOT,"experiencia/canonical_cases.json");
const MANIFEST=path.join(__dirname,"master-win-frozen-manifest.json");
const TARGETS=new Set([4109997,4086863,4007744,4006643]);
const CHECKPOINTS=[3,4,8,12,16,20,24,28,32,36,40];
const ORDER=Array.from({length:40},(_,i)=>i);
const FULL_MS=8000,FULL_NODES=1600000,FULL_WATCHDOG_MS=12000;

process.env.OPTIMIZER_RUST_BEAM_RANK_CACHE_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_LEAN_BEAM_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_GREEDY_PLAN_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_LARGE_ROUND_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_SIMPLE_CHOOSE_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_MASTER_ROUND_REUSE_EXPERIMENTAL="0";
process.env.OPTIMIZER_MASTER_UNIQUE_MASKS_LE4_EXPERIMENTAL="1";

const {createIncrementalRustMasterGenerator}=require("./incremental-rust-master-frozen.cjs");
const {patronesMonotipo}=require(path.join(ROOT,"src/lib/optimizer/legacy/patrones.cjs"));
const {resolverCobertura}=require(path.join(ROOT,"src/lib/optimizer/legacy/cobertura.cjs"));
const {materializar}=require(path.join(ROOT,"src/lib/optimizer/legacy/materializar.cjs"));
const {validarPlanIndustrial}=require(path.join(ROOT,"src/lib/optimizer/legacy/v10.cjs"));

function loadCorpus(){const raw=JSON.parse(fs.readFileSync(CORPUS,"utf8"));return Array.isArray(raw)?raw:(raw.cases||raw.records||raw.canonical_cases||raw.canonicalCases||raw.data||[]);}
function root(e){return e?.case??e?.canonical??e?.optimization_case??e?.optimizationCase??e;}
function num(...xs){for(const x of xs){const n=Number(x);if(Number.isFinite(n))return n;}return null;}
function problem(e){
 const r=root(e);
 const width=num(r.panel?.width,r.stock_width,r.stockWidth,r.board_width,r.boardWidth);
 const height=num(r.panel?.height,r.stock_height,r.stockHeight,r.board_height,r.boardHeight);
 const saw=num(r.kerf,r.saw,r.sierra,4.5),trimX=num(r.trim?.x,r.trim_x,r.trimX,r.refiladoX,0),trimY=num(r.trim?.y,r.trim_y,r.trimY,r.refiladoY,0);
 const directional=r.material?.hasGrain===true||Boolean(r.directional??r.directional_input??r.materialConVeta??r.has_grain)||r.pieces.some(p=>p.grain===true||p.veta===true||p.rotationAllowed===false);
 const lines=r.pieces.map((p,i)=>({base:num(p.base,p.width),altura:num(p.altura,p.height),cant:num(p.cant,p.quantity,1),veta:Boolean(p.veta??p.grain??(p.rotationAllowed===false)),ref:p.ref??p.reference??i,detalle:p.detalle??p.description??""}));
 return {width,height,saw,trimX,trimY,directional,lines,pieces:lines.reduce((s,l)=>s+l.cant,0)};
}
function config(p){return {placaBase:p.width,placaAltura:p.height,refiladoX:p.trimX,refiladoY:p.trimY,sierra:p.saw,etapas:4,materialConVeta:Boolean(p.directional),descontarCanto:false,cantoEspesor:0,restoMin:250,restoMax:400,usarRustPatternGenerator:true,usarCache:false,maxPiezasCache:0,rondasPatrones:40,msMaster:FULL_MS,usarMascarasUnicasMasterLe4:true};}
function cpuMs(start){const d=process.cpuUsage(start);return (d.user+d.system)/1000;}
function solve(pool,p,cfg,pre){
 const area=(cfg.placaBase-cfg.refiladoX)*(cfg.placaAltura-cfg.refiladoY),cpu0=process.cpuUsage(),t0=process.hrtime.bigint();
 const h=resolverCobertura(pool,p.lines.map(l=>l.cant),area,pre,FULL_MS,{maxNodos:FULL_NODES,watchdogMs:FULL_WATCHDOG_MS});
 const sol=h?h.resolver(p.lines.map(l=>l.base*l.altura)):null;
 const cpu=cpuMs(cpu0),wall=Number(process.hrtime.bigint()-t0)/1e6;
 if(!sol?.plan)return {boards:pre,cpuMs:cpu,wallMs:wall,nodes:sol?.nodos??null,usedRounds:[]};
 const opts={...cfg,anchoUtil:cfg.placaBase-cfg.refiladoX,altoUtil:cfg.placaAltura-cfg.refiladoY};
 const plan=materializar(sol.plan,p.lines,opts),v=plan?validarPlanIndustrial(plan,p.pieces):null;
 if(!v?.ok)return {boards:pre,cpuMs:cpu,wallMs:wall,nodes:sol?.nodos??null,usedRounds:[]};
 const usedRounds=[...new Set((sol.plan||[]).map(x=>x._round).filter(Number.isInteger))].sort((a,b)=>a-b);
 return {boards:plan.resumen?.placas??sol.placas,cpuMs:cpu,wallMs:wall,nodes:sol?.nodos??null,usedRounds};
}

const manifest=JSON.parse(fs.readFileSync(MANIFEST,"utf8")),corpus=loadCorpus();
const wins=(manifest.frozenAllWins||[]).filter(w=>TARGETS.has(Number(w.order))).sort((a,b)=>a.order-b.order);
if(wins.length!==4)throw new Error("expected 4 targets, got "+wins.length);

const rows=[];
for(const w of wins){
 const p=problem(corpus[Number(w.canonicalIndex)]),cfg=config(p),mono=patronesMonotipo(p.lines,cfg),gen=createIncrementalRustMasterGenerator(p.lines,cfg,40,7);
 let prev=0,solveCpuAccum=0,solveWallAccum=0,best=Number(w.preMasterBoards);
 const checkpoints=[];
 for(const cp of CHECKPOINTS){
   gen.execute(ORDER.slice(prev,cp));
   const pats=gen.patterns(ORDER.slice(0,cp));
   const before=best;
   const s=solve(pats.concat(mono),p,cfg,best);
   solveCpuAccum+=s.cpuMs; solveWallAccum+=s.wallMs;
   if(s.boards<best)best=s.boards;
   checkpoints.push({cp,before,boards:best,improved:best<before,full40Match:best===Number(w.benchmarkReference.boards),generationCpuMs:gen.generationCpuMs,solveCpuAccumMs:solveCpuAccum,totalCpuAccumMs:gen.generationCpuMs+solveCpuAccum,solveWallAccumMs:solveWallAccum,patterns:pats.length,newExecutedRounds:gen.executedRounds().filter(r=>r>=prev&&r<cp),usedRounds:s.usedRounds});
   prev=cp;
 }
 rows.push({order:w.order,typeCount:w.typeCount,pieces:w.pieces,preMasterBoards:w.preMasterBoards,referenceBoards:w.benchmarkReference.boards,checkpoints});
 console.log("HIGH_TYPE_WIN "+JSON.stringify({order:w.order,typeCount:w.typeCount,pre:w.preMasterBoards,ref:w.benchmarkReference.boards,earliest:checkpoints.find(x=>x.full40Match)?.cp??null,curve:checkpoints.map(x=>[x.cp,x.boards])}));
}
const out={schema:"high-type-win-production-order-checkpoints-v1",order:"production-0-to-39",checkpoints:CHECKPOINTS,rows};
fs.writeFileSync(path.join(__dirname,"high-type-win-checkpoints-results.json"),JSON.stringify(out,null,2)+"\n");

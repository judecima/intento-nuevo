"use strict";

const fs=require("node:fs");
const path=require("node:path");
const ROOT=path.resolve(__dirname,"../../..");
const CORPUS=path.join(ROOT,"experiencia/canonical_cases.json");
const MANIFEST=path.join(__dirname,"high-type-active-manifest.json");
const SHARD_INDEX=Number(process.env.SHARD_INDEX||0);
const SHARD_TOTAL=Number(process.env.SHARD_TOTAL||1);
const MODE=process.argv[2]||"shard";
const FULL_MS=8000,FULL_NODES=1600000,FULL_WATCHDOG_MS=12000;

process.env.OPTIMIZER_RUST_BEAM_RANK_CACHE_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_LEAN_BEAM_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_GREEDY_PLAN_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_LARGE_ROUND_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_SIMPLE_CHOOSE_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_MASTER_ROUND_REUSE_EXPERIMENTAL="0";
process.env.OPTIMIZER_MASTER_UNIQUE_MASKS_LE4_EXPERIMENTAL="1";

const {createIncrementalRustMasterGenerator}=require("./incremental-rust-master-frozen.cjs");
const {generarPatronesLegacyRustHybrid}=require(path.join(ROOT,"src/lib/optimizer/legacy/rust/rust-patrones.cjs"));
const {patronesMonotipo}=require(path.join(ROOT,"src/lib/optimizer/legacy/patrones.cjs"));
const {resolverCobertura}=require(path.join(ROOT,"src/lib/optimizer/legacy/cobertura.cjs"));
const {materializar}=require(path.join(ROOT,"src/lib/optimizer/legacy/materializar.cjs"));
const {validarPlanIndustrial}=require(path.join(ROOT,"src/lib/optimizer/legacy/v10.cjs"));

if(MODE==="shard") shard();
else if(MODE==="report") report();
else throw new Error("mode shard|report");

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
function timed(fn){const cpu0=process.cpuUsage(),t0=process.hrtime.bigint();const value=fn();return {value,cpuMs:cpuMs(cpu0),wallMs:Number(process.hrtime.bigint()-t0)/1e6};}
function solve(pool,p,cfg,incumbent){
 const area=(cfg.placaBase-cfg.refiladoX)*(cfg.placaAltura-cfg.refiladoY);
 const t=timed(()=>{
   const h=resolverCobertura(pool,p.lines.map(l=>l.cant),area,incumbent,FULL_MS,{maxNodos:FULL_NODES,watchdogMs:FULL_WATCHDOG_MS});
   return h?h.resolver(p.lines.map(l=>l.base*l.altura)):null;
 });
 const sol=t.value;
 let boards=incumbent,valid=true,improved=false;
 if(sol?.plan){
   const opts={...cfg,anchoUtil:cfg.placaBase-cfg.refiladoX,altoUtil:cfg.placaAltura-cfg.refiladoY};
   const plan=materializar(sol.plan,p.lines,opts);
   const v=plan?validarPlanIndustrial(plan,p.pieces):null;
   valid=Boolean(plan&&v?.ok);
   if(valid){
     boards=plan.resumen?.placas??sol.placas??incumbent;
     improved=boards<incumbent;
   }
 }
 return {boards,valid,improved,cpuMs:t.cpuMs,wallMs:t.wallMs,nodes:sol?.nodos??null};
}
function p3Arm(p,cfg,mono,pre){
 const gen=createIncrementalRustMasterGenerator(p.lines,cfg,40,7);
 const gt=timed(()=>gen.execute([0,1,2]));
 const pt=timed(()=>gen.patterns([0,1,2]));
 const s=solve(pt.value.concat(mono),p,cfg,pre);
 return {boards:s.boards,valid:s.valid,improved:s.improved,genCpuMs:gen.generationCpuMs,genWallMs:gt.wallMs,dedupCpuMs:pt.cpuMs,dedupWallMs:pt.wallMs,solveCpuMs:s.cpuMs,solveWallMs:s.wallMs,nodes:s.nodes,patterns:pt.value.length,totalCpuMs:gen.generationCpuMs+pt.cpuMs+s.cpuMs,totalWallMs:gt.wallMs+pt.wallMs+s.wallMs};
}
function fullArm(p,cfg,mono,pre){
 const gt=timed(()=>generarPatronesLegacyRustHybrid(p.lines,cfg,40,7));
 const s=solve(gt.value.concat(mono),p,cfg,pre);
 return {boards:s.boards,valid:s.valid,improved:s.improved,genCpuMs:gt.cpuMs,genWallMs:gt.wallMs,solveCpuMs:s.cpuMs,solveWallMs:s.wallMs,nodes:s.nodes,patterns:gt.value.length,totalCpuMs:gt.cpuMs+s.cpuMs,totalWallMs:gt.wallMs+s.wallMs};
}
function shard(){
 const manifest=JSON.parse(fs.readFileSync(MANIFEST,"utf8")),corpus=loadCorpus(),rows=[];
 for(let i=SHARD_INDEX;i<manifest.rows.length;i+=SHARD_TOTAL){
   const m=manifest.rows[i],entry=corpus[Number(m.canonicalIndex)],p=problem(entry),cfg=config(p);
   const mt=timed(()=>patronesMonotipo(p.lines,cfg)),mono=mt.value,pre=Number(m.preMasterBoards);
   const firstFull=i%2===0;
   let p3,full;
   if(firstFull){full=fullArm(p,cfg,mono,pre);p3=p3Arm(p,cfg,mono,pre);}
   else{p3=p3Arm(p,cfg,mono,pre);full=fullArm(p,cfg,mono,pre);}
   const parity=p3.boards===full.boards;
   rows.push({order:m.order,canonicalIndex:m.canonicalIndex,typeCount:m.typeCount,pieces:m.pieces,preMasterBoards:pre,lowerBound:m.lowerBound,historicalWin:Number(m.masterWins||0)>0,monoCpuMs:mt.cpuMs,monoWallMs:mt.wallMs,runOrder:firstFull?["full40","p3"]:["p3","full40"],p3,full,parity,cpuSavingPct:full.totalCpuMs>0?100*(full.totalCpuMs-p3.totalCpuMs)/full.totalCpuMs:null});
   console.log("HIGH_TYPE_ACTIVE "+JSON.stringify({order:m.order,win:Number(m.masterWins||0)>0,pre,p3:p3.boards,full:full.boards,parity,p3Cpu:p3.totalCpuMs,fullCpu:full.totalCpuMs}));
 }
 fs.writeFileSync(path.join(__dirname,"high-type-active-benchmark-shard-"+SHARD_INDEX+".json"),JSON.stringify({schema:"high-type-active-benchmark-shard-v1",shard:SHARD_INDEX,shardTotal:SHARD_TOTAL,rows},null,2)+"\n");
}
function q(xs,p){const a=xs.filter(Number.isFinite).slice().sort((x,y)=>x-y);if(!a.length)return null;const pos=(a.length-1)*p,l=Math.floor(pos),h=Math.ceil(pos);return l===h?a[l]:a[l]+(a[h]-a[l])*(pos-l);}
function report(){
 const expected=Number(process.env.SHARD_TOTAL||16),files=fs.readdirSync(__dirname).filter(x=>/^high-type-active-benchmark-shard-\d+\.json$/.test(x));
 if(files.length!==expected)throw new Error("expected "+expected+" shards got "+files.length);
 const rows=files.flatMap(f=>JSON.parse(fs.readFileSync(path.join(__dirname,f),"utf8")).rows||[]).sort((a,b)=>a.order-b.order);
 const parityFailures=rows.filter(r=>!r.parity).map(r=>({order:r.order,p3:r.p3.boards,full:r.full.boards,win:r.historicalWin}));
 const sum=(xs)=>xs.reduce((s,x)=>s+(Number.isFinite(x)?x:0),0);
 const p3Cpu=rows.map(r=>r.p3.totalCpuMs+r.monoCpuMs),fullCpu=rows.map(r=>r.full.totalCpuMs+r.monoCpuMs);
 const wins=rows.filter(r=>r.historicalWin),nonwins=rows.filter(r=>!r.historicalWin);
 const result={schema:"high-type-active-p3-vs-full40-v1",cases:rows.length,wins:wins.length,nonWins:nonwins.length,parityFailures,
   boards:{p3MatchesFull40:rows.length-parityFailures.length,winsMatched:wins.filter(r=>r.parity).length,nonWinsMatched:nonwins.filter(r=>r.parity).length},
   cpu:{p3TotalMs:sum(p3Cpu),full40TotalMs:sum(fullCpu),savingPct:sum(fullCpu)>0?100*(sum(fullCpu)-sum(p3Cpu))/sum(fullCpu):null,p3P50:q(p3Cpu,.5),fullP50:q(fullCpu,.5),p3P95:q(p3Cpu,.95),fullP95:q(fullCpu,.95),p3P99:q(p3Cpu,.99),fullP99:q(fullCpu,.99)},
   rows};
 fs.writeFileSync(path.join(__dirname,"high-type-active-benchmark-results.json"),JSON.stringify(result,null,2)+"\n");
 console.log("HIGH_TYPE_ACTIVE_SUMMARY "+JSON.stringify({cases:result.cases,wins:result.wins,nonWins:result.nonWins,boards:result.boards,cpu:result.cpu,parityFailures}));
 if(parityFailures.length)process.exitCode=2;
}
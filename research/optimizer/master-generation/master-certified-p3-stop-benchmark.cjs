"use strict";
const crypto=require("node:crypto");
const fs=require("node:fs");
const path=require("node:path");
const ROOT=path.resolve(__dirname,"../../..");
const DIR=__dirname;
const CORPUS=path.join(ROOT,"experiencia/canonical_cases.json");
const MANIFEST=path.join(DIR,"master-active-all-manifest.json");
const SHARD_INDEX=Number(process.env.SHARD_INDEX||0);
const SHARD_TOTAL=Number(process.env.SHARD_TOTAL||1);
const MODE=process.argv[2]||"shard";
const FULL_MS=8000,FULL_NODES=1600000,FULL_WATCHDOG_MS=12000;
const EARLY_ROUNDS=[0,1,2];

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
const {calidadPlanPlacas,compararCalidad}=require(path.join(ROOT,"src/lib/optimizer/legacy/motor.cjs"));

if(MODE==="shard") shard();
else if(MODE==="report") report();
else throw new Error("mode shard|report");

function loadCorpus(){const raw=JSON.parse(fs.readFileSync(CORPUS,"utf8"));return Array.isArray(raw)?raw:(raw.cases||raw.records||raw.canonical_cases||raw.canonicalCases||raw.data||[]);}
function root(e){return e?.case??e?.canonical??e?.optimization_case??e?.optimizationCase??e;}
function num(...xs){for(const x of xs){const n=Number(x);if(Number.isFinite(n))return n;}return null;}
function problem(e){
 const r=root(e);
 if(!Array.isArray(r?.pieces)||!r.pieces.length)throw new Error("missing pieces");
 const width=num(r.panel?.width,r.stock_width,r.stockWidth,r.board_width,r.boardWidth);
 const height=num(r.panel?.height,r.stock_height,r.stockHeight,r.board_height,r.boardHeight);
 if(!(width>0&&height>0))throw new Error("invalid stock");
 const saw=num(r.kerf,r.saw,r.sierra,4.5),trimX=num(r.trim?.x,r.trim_x,r.trimX,r.refiladoX,0),trimY=num(r.trim?.y,r.trim_y,r.trimY,r.refiladoY,0);
 const directional=r.material?.hasGrain===true||Boolean(r.directional??r.directional_input??r.materialConVeta??r.has_grain)||r.pieces.some(p=>p.grain===true||p.veta===true||p.rotationAllowed===false);
 const lines=r.pieces.map((p,i)=>({base:num(p.base,p.width),altura:num(p.altura,p.height),cant:num(p.cant,p.quantity,1),veta:Boolean(p.veta??p.grain??(p.rotationAllowed===false)),ref:p.ref??p.reference??i,detalle:p.detalle??p.description??""}));
 if(lines.some(l=>!(l.base>0&&l.altura>0&&l.cant>0)))throw new Error("invalid piece");
 return {width,height,saw,trimX,trimY,directional,lines,pieces:lines.reduce((s,l)=>s+l.cant,0)};
}
function config(p){return {placaBase:p.width,placaAltura:p.height,refiladoX:p.trimX,refiladoY:p.trimY,sierra:p.saw,etapas:4,materialConVeta:Boolean(p.directional),descontarCanto:false,cantoEspesor:0,restoMin:250,restoMax:400,usarRustPatternGenerator:true,usarCache:false,maxPiezasCache:0,rondasPatrones:40,msMaster:FULL_MS,usarMascarasUnicasMasterLe4:true};}
function cpuMs(start){const d=process.cpuUsage(start);return (d.user+d.system)/1000;}
function timed(fn){const cpu0=process.cpuUsage(),t0=process.hrtime.bigint();const value=fn();return {value,cpuMs:cpuMs(cpu0),wallMs:Number(process.hrtime.bigint()-t0)/1e6};}
function digest(v){return crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");}
function boardDigest(board){return {placements:(board?.colocadas||[]).map(p=>[p?.pieza?.ref,p.base,p.altura,p.x,p.y,Boolean(p.rotada),p.nivel??0]),cuts:(board?.cortes||[]).map(c=>[c.x1,c.y1,c.x2,c.y2,c.nivel??0,Boolean(c.terminal)]),remnants:(board?.restos||[]).map(r=>[r.x,r.y,r.w,r.h])};}
function planDigest(plan){return plan?digest((plan.placas||[]).map(boardDigest)):null;}
function solve(pool,p,cfg,incumbent){
 const area=(cfg.placaBase-cfg.refiladoX)*(cfg.placaAltura-cfg.refiladoY);
 const t=timed(()=>{
   const h=resolverCobertura(pool,p.lines.map(l=>l.cant),area,incumbent,FULL_MS,{maxNodos:FULL_NODES,watchdogMs:FULL_WATCHDOG_MS});
   return h?h.resolver(p.lines.map(l=>l.base*l.altura)):null;
 });
 const sol=t.value;
 let boards=incumbent,valid=true,plan=null;
 if(sol?.plan){
   const opts={...cfg,anchoUtil:cfg.placaBase-cfg.refiladoX,altoUtil:cfg.placaAltura-cfg.refiladoY};
   plan=materializar(sol.plan,p.lines,opts);
   const v=plan?validarPlanIndustrial(plan,p.pieces):null;
   valid=Boolean(plan&&v?.ok);
   if(valid)boards=plan.resumen?.placas??sol.placas??incumbent;
   else plan=null;
 }
 return {
   boards,valid,plan,
   quality:plan?calidadPlanPlacas(plan.placas,plan.opts||cfg):null,
   planDigest:planDigest(plan),
   cpuMs:t.cpuMs,wallMs:t.wallMs,nodes:sol?.nodos??null
 };
}
function fullArm(p,cfg,mono,pre){
 const gt=timed(()=>generarPatronesLegacyRustHybrid(p.lines,cfg,40,7));
 const s=solve(gt.value.concat(mono),p,cfg,pre);
 return {...s,patterns:gt.value.length,genCpuMs:gt.cpuMs,genWallMs:gt.wallMs,totalCpuMs:gt.cpuMs+s.cpuMs,totalWallMs:gt.wallMs+s.wallMs};
}
function candidateArm(p,cfg,mono,pre,lowerBound){
 const gen=createIncrementalRustMasterGenerator(p.lines,cfg,40,7);
 const e1=timed(()=>gen.execute(EARLY_ROUNDS));
 const d1=timed(()=>gen.patterns(EARLY_ROUNDS));
 const s1=solve(d1.value.concat(mono),p,cfg,pre);
 const certified=Number.isFinite(lowerBound)&&lowerBound>0&&s1.boards<=lowerBound;
 if(certified){
   return {
     ...s1,certified:true,p3Boards:s1.boards,p3Patterns:d1.value.length,
     finalPatterns:d1.value.length,
     genCpuMs:gen.generationCpuMs,
     dedupCpuMs:d1.cpuMs,
     solveCpuMs:s1.cpuMs,
     totalCpuMs:gen.generationCpuMs+d1.cpuMs+s1.cpuMs,
     totalWallMs:e1.wallMs+d1.wallMs+s1.wallMs,
     p3CpuMs:gen.generationCpuMs+d1.cpuMs+s1.cpuMs,
     fullContinuation:false
   };
 }
 const rest=[];for(let r=3;r<40;r++)rest.push(r);
 const e2=timed(()=>gen.execute(rest));
 const d2=timed(()=>gen.patterns());
 const s2=solve(d2.value.concat(mono),p,cfg,pre);
 return {
   ...s2,certified:false,p3Boards:s1.boards,p3Patterns:d1.value.length,
   finalPatterns:d2.value.length,
   genCpuMs:gen.generationCpuMs,
   dedupCpuMs:d1.cpuMs+d2.cpuMs,
   solveCpuMs:s1.cpuMs+s2.cpuMs,
   totalCpuMs:gen.generationCpuMs+d1.cpuMs+d2.cpuMs+s1.cpuMs+s2.cpuMs,
   totalWallMs:e1.wallMs+d1.wallMs+s1.wallMs+e2.wallMs+d2.wallMs+s2.wallMs,
   p3CpuMs:(gen.generationCpuMs)+d1.cpuMs+s1.cpuMs,
   fullContinuation:true,
   p3Nodes:s1.nodes
 };
}
function qualityRelation(cand,full){
 if(cand.boards!==full.boards)return cand.boards<full.boards?1:-1;
 if(cand.quality==null&&full.quality==null)return 0;
 if(cand.quality==null)return -1;
 if(full.quality==null)return 1;
 return compararCalidad(cand.quality,full.quality);
}
function shard(){
 const manifest=JSON.parse(fs.readFileSync(MANIFEST,"utf8")),corpus=loadCorpus(),rows=[];
 for(let i=SHARD_INDEX;i<manifest.rows.length;i+=SHARD_TOTAL){
   const m=manifest.rows[i],entry=corpus[Number(m.canonicalIndex)],p=problem(entry),cfg=config(p);
   const mt=timed(()=>patronesMonotipo(p.lines,cfg)),mono=mt.value,pre=Number(m.preMasterBoards),lb=Number(m.lowerBound);
   const firstFull=i%2===0;
   let cand,full;
   if(firstFull){full=fullArm(p,cfg,mono,pre);cand=candidateArm(p,cfg,mono,pre,lb);}
   else{cand=candidateArm(p,cfg,mono,pre,lb);full=fullArm(p,cfg,mono,pre);}
   const relation=qualityRelation(cand,full);
   const row={
     order:m.order,canonicalIndex:m.canonicalIndex,typeCount:m.typeCount,pieces:m.pieces,
     preMasterBoards:pre,lowerBound:lb,historicalWin:Number(m.masterWins||0)>0,
     monoCpuMs:mt.cpuMs,monoWallMs:mt.wallMs,runOrder:firstFull?["full40","candidate"]:["candidate","full40"],
     cand:{...cand,plan:undefined},full:{...full,plan:undefined},
     boardDelta:cand.boards-full.boards,
     sameBoards:cand.boards===full.boards,
     samePlan:cand.planDigest===full.planDigest,
     qualityRelation:relation,
     cpuSavingPct:(full.totalCpuMs+mt.cpuMs)>0?100*((full.totalCpuMs+mt.cpuMs)-(cand.totalCpuMs+mt.cpuMs))/(full.totalCpuMs+mt.cpuMs):null
   };
   rows.push(row);
   console.log("CERTIFIED_P3 "+JSON.stringify({order:m.order,lb,pre,p3:cand.p3Boards,cand:cand.boards,full:full.boards,certified:cand.certified,qualityRelation:relation,candCpu:cand.totalCpuMs+mt.cpuMs,fullCpu:full.totalCpuMs+mt.cpuMs}));
 }
 fs.writeFileSync(path.join(DIR,"master-certified-p3-stop-shard-"+SHARD_INDEX+".json"),JSON.stringify({schema:"master-certified-p3-stop-shard-v1",shard:SHARD_INDEX,shardTotal:SHARD_TOTAL,rows},null,2)+"\n");
}
function q(xs,p){const a=xs.filter(Number.isFinite).slice().sort((x,y)=>x-y);if(!a.length)return null;const pos=(a.length-1)*p,l=Math.floor(pos),h=Math.ceil(pos);return l===h?a[l]:a[l]+(a[h]-a[l])*(pos-l);}
function report(){
 const expected=Number(process.env.SHARD_TOTAL||16),files=fs.readdirSync(DIR).filter(x=>/^master-certified-p3-stop-shard-\d+\.json$/.test(x));
 if(files.length!==expected)throw new Error("expected "+expected+" shards got "+files.length);
 const rows=files.flatMap(f=>JSON.parse(fs.readFileSync(path.join(DIR,f),"utf8")).rows||[]).sort((a,b)=>Number(a.canonicalIndex)-Number(b.canonicalIndex));
 const sum=xs=>xs.reduce((s,x)=>s+(Number.isFinite(x)?x:0),0);
 const baseCpu=rows.map(r=>r.full.totalCpuMs+r.monoCpuMs),candCpu=rows.map(r=>r.cand.totalCpuMs+r.monoCpuMs);
 const boardLosses=rows.filter(r=>r.boardDelta>0);
 const boardGains=rows.filter(r=>r.boardDelta<0);
 const equal=rows.filter(r=>r.boardDelta===0);
 const qualityWorse=equal.filter(r=>r.qualityRelation<0);
 const qualityBetter=equal.filter(r=>r.qualityRelation>0);
 const certified=rows.filter(r=>r.cand.certified);
 const out={
  schema:"master-certified-p3-stop-results-v1",
  cases:rows.length,
  certified:certified.length,
  certifiedPct:rows.length?100*certified.length/rows.length:0,
  wins:rows.filter(r=>r.historicalWin).length,
  boards:{losses:boardLosses.map(r=>r.order),gains:boardGains.map(r=>r.order),same:equal.length},
  quality:{worse:qualityWorse.map(r=>r.order),better:qualityBetter.map(r=>r.order),same:equal.length-qualityWorse.length-qualityBetter.length},
  cpu:{
    baseTotalMs:sum(baseCpu),candidateTotalMs:sum(candCpu),
    savingPct:sum(baseCpu)>0?100*(sum(baseCpu)-sum(candCpu))/sum(baseCpu):null,
    baseP50:q(baseCpu,.5),candP50:q(candCpu,.5),
    baseP95:q(baseCpu,.95),candP95:q(candCpu,.95),
    baseP99:q(baseCpu,.99),candP99:q(candCpu,.99)
  },
  rows
 };
 fs.writeFileSync(path.join(DIR,"master-certified-p3-stop-results.json"),JSON.stringify(out,null,2)+"\n");
 console.log("CERTIFIED_P3_SUMMARY "+JSON.stringify({cases:out.cases,certified:out.certified,certifiedPct:out.certifiedPct,wins:out.wins,boards:out.boards,quality:out.quality,cpu:out.cpu}));
 if(boardLosses.length||qualityWorse.length)process.exitCode=2;
}

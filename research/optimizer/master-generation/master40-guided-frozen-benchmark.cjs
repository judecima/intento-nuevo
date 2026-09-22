"use strict";

const crypto=require("node:crypto");
const fs=require("node:fs");
const path=require("node:path");
const ROOT=path.resolve(__dirname,"../../..");
const CORPUS=path.join(ROOT,"experiencia/canonical_cases.json");
const MANIFEST=path.join(__dirname,"master-win-frozen-manifest.json");
const SHARD_INDEX=Number(process.env.SHARD_INDEX||0);
const SHARD_TOTAL=Number(process.env.SHARD_TOTAL||1);
const MODE=process.argv[2]||"shard";

const FULL_MS=8000,FULL_NODES=1600000,FULL_WATCHDOG_MS=12000;
const P16=Object.freeze([0,2,6,10,12,13,16,17,18,19,20,21,22,25,34,36]);
const GUIDED_FIRST=Object.freeze([9,23,32,1]);
const NORMAL=Object.freeze([...P16,...Array.from({length:40},(_,i)=>i).filter(r=>!P16.includes(r))]);
const GUIDED=Object.freeze([...P16,...GUIDED_FIRST,...Array.from({length:40},(_,i)=>i).filter(r=>!P16.includes(r)&&!GUIDED_FIRST.includes(r))]);
const CHECKPOINTS=Object.freeze([3,16,20,24,28,32,36,40]);

process.env.OPTIMIZER_RUST_BEAM_RANK_CACHE_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_LEAN_BEAM_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_GREEDY_PLAN_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_LARGE_ROUND_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_SIMPLE_CHOOSE_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_MASTER_ROUND_REUSE_EXPERIMENTAL="0";
process.env.OPTIMIZER_MASTER_UNIQUE_MASKS_LE4_EXPERIMENTAL="1";
delete process.env.OPTIMIZER_RUST_BEAM_DERIVED_METRICS_EXPERIMENTAL;

const {createIncrementalRustMasterGenerator}=require("./incremental-rust-master-frozen.cjs");
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
 const r=root(e),width=num(r.panel?.width,r.stock_width,r.stockWidth,r.board_width,r.boardWidth),height=num(r.panel?.height,r.stock_height,r.stockHeight,r.board_height,r.boardHeight);
 const saw=num(r.kerf,r.saw,r.sierra,4.5),trimX=num(r.trim?.x,r.trim_x,r.trimX,r.refiladoX,0),trimY=num(r.trim?.y,r.trim_y,r.trimY,r.refiladoY,0);
 const directional=r.material?.hasGrain===true||Boolean(r.directional??r.directional_input??r.materialConVeta??r.has_grain)||r.pieces.some(p=>p.grain===true||p.veta===true||p.rotationAllowed===false);
 const lines=r.pieces.map((p,i)=>({base:num(p.base,p.width),altura:num(p.altura,p.height),cant:num(p.cant,p.quantity,1),veta:Boolean(p.veta??p.grain??(p.rotationAllowed===false)),ref:p.ref??p.reference??i,detalle:p.detalle??p.description??""}));
 return {width,height,saw,trimX,trimY,directional,lines,pieces:lines.reduce((s,l)=>s+l.cant,0)};
}
function config(p){return {placaBase:p.width,placaAltura:p.height,refiladoX:p.trimX,refiladoY:p.trimY,sierra:p.saw,etapas:4,materialConVeta:Boolean(p.directional),descontarCanto:false,cantoEspesor:0,restoMin:250,restoMax:400,usarRustPatternGenerator:true,usarCache:false,maxPiezasCache:0,rondasPatrones:40,msMaster:FULL_MS,usarMascarasUnicasMasterLe4:true};}
function sha(v){return crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");}
function boardDigest(b){return {placements:(b?.colocadas||[]).map(p=>[p?.pieza?.ref,p.base,p.altura,p.x,p.y,Boolean(p.rotada),p.nivel??0]),cuts:(b?.cortes||[]).map(c=>[c.x1,c.y1,c.x2,c.y2,c.nivel??0,Boolean(c.terminal)]),remnants:(b?.restos||[]).map(r=>[r.x,r.y,r.w,r.h])};}
function poolDigest(pool){return sha(pool.map(p=>({usage:[...p.uso.entries()].sort((a,b)=>a[0]-b[0]),area:p.area,board:boardDigest(p.placa)})));}
function planDigest(plan){return plan?sha((plan.placas||[]).map(boardDigest)):null;}
function solve(pool,p,cfg,pre){
 const area=(cfg.placaBase-cfg.refiladoX)*(cfg.placaAltura-cfg.refiladoY),t0=process.hrtime.bigint();
 const h=resolverCobertura(pool,p.lines.map(l=>l.cant),area,pre,FULL_MS,{maxNodos:FULL_NODES,watchdogMs:FULL_WATCHDOG_MS});
 const sol=h?h.resolver(p.lines.map(l=>l.base*l.altura)):null;
 const solveMs=Number(process.hrtime.bigint()-t0)/1e6;
 if(!sol?.plan)return {boards:pre,plan:null,digest:null,quality:null,solveMs,nodes:sol?.nodos??null};
 const opts={...cfg,anchoUtil:cfg.placaBase-cfg.refiladoX,altoUtil:cfg.placaAltura-cfg.refiladoY};
 const plan=materializar(sol.plan,p.lines,opts),v=plan?validarPlanIndustrial(plan,p.pieces):null;
 if(!v?.ok)return {boards:pre,plan:null,digest:null,quality:null,solveMs,nodes:sol?.nodos??null};
 return {boards:plan.resumen?.placas??sol.placas,plan,digest:planDigest(plan),quality:calidadPlanPlacas(plan.placas||[],plan.opts||opts),solveMs,nodes:sol?.nodos??null};
}
function runSchedule(order,p,cfg,pre,mono,ref){
 const gen=createIncrementalRustMasterGenerator(p.lines,cfg,40,7),cps=[];let prev=0;
 for(const size of CHECKPOINTS){
   const added=order.slice(prev,size),g0=process.hrtime.bigint();gen.execute(added);const genStepMs=Number(process.hrtime.bigint()-g0)/1e6;
   const patterns=gen.patterns(order.slice(0,size)),pd=poolDigest(patterns),sd=poolDigest(patterns.concat(mono));
   const s=solve(patterns.concat(mono),p,cfg,pre);
   cps.push({size,boards:s.boards,planDigest:s.digest,poolDigest:pd,solverPoolDigest:sd,generationCpuMs:gen.generationCpuMs,generationStepWallMs:genStepMs,solveMs:s.solveMs,nodes:s.nodes,
     boardMatch:s.boards===ref.boards,physicalMatch:s.digest!==null&&s.digest===ref.planDigest});
   prev=size;
 }
 const p40=cps.at(-1);
 return {checkpoints:cps,earliestBoardMatch:cps.find(x=>x.boardMatch)?.size??null,earliestPhysicalMatch:cps.find(x=>x.physicalMatch)?.size??null,
   cpuToBoardMatch:cps.find(x=>x.boardMatch)?.generationCpuMs??null,cpuToPhysicalMatch:cps.find(x=>x.physicalMatch)?.generationCpuMs??null,
   p40Parity:{pool:p40.poolDigest===ref.poolDigest,solverPool:p40.solverPoolDigest===ref.solverPoolDigest,boards:p40.boards===ref.boards,plan:p40.planDigest===ref.planDigest}};
}
function shard(){
 const manifest=JSON.parse(fs.readFileSync(MANIFEST,"utf8")),corpus=loadCorpus(),wins=manifest.frozenHoldoutWins||[],rows=[];
 for(let i=SHARD_INDEX;i<wins.length;i+=SHARD_TOTAL){
   const w=wins[i],entry=corpus[Number(w.canonicalIndex)],p=problem(entry),cfg=config(p),mono=patronesMonotipo(p.lines,cfg),ref=w.benchmarkReference,pre=Number(w.preMasterBoards);
   const normal=runSchedule(NORMAL,p,cfg,pre,mono,ref),guided=runSchedule(GUIDED,p,cfg,pre,mono,ref);
   const parity=Object.values(normal.p40Parity).every(Boolean)&&Object.values(guided.p40Parity).every(Boolean);
   rows.push({order:w.order,canonicalIndex:w.canonicalIndex,pieces:w.pieces,typeCount:w.typeCount,preMasterBoards:pre,referenceBoards:ref.boards,parity,normal,guided});
   console.log("GUIDED_CASE "+JSON.stringify({order:w.order,parity,normal:{b:normal.earliestBoardMatch,p:normal.earliestPhysicalMatch,cpu:normal.cpuToBoardMatch},guided:{b:guided.earliestBoardMatch,p:guided.earliestPhysicalMatch,cpu:guided.cpuToBoardMatch}}));
 }
 fs.writeFileSync(path.join(__dirname,"master40-guided-frozen-shard-"+SHARD_INDEX+".json"),JSON.stringify({schema:"master40-guided-frozen-shard-v1",shard:SHARD_INDEX,shardTotal:SHARD_TOTAL,rows},null,2)+"\n");
}
function pct(a,b){return a>0?100*(a-b)/a:0;}
function percentile(v,p){const a=v.filter(Number.isFinite).slice().sort((x,y)=>x-y);if(!a.length)return null;return a[Math.min(a.length-1,Math.max(0,Math.ceil(p*a.length)-1))];}
function report(){
 const expected=Number(process.env.SHARD_TOTAL||8),files=fs.readdirSync(__dirname).filter(x=>/^master40-guided-frozen-shard-\d+\.json$/.test(x));
 if(files.length!==expected)throw new Error("expected "+expected+" shards got "+files.length);
 const rows=files.flatMap(f=>JSON.parse(fs.readFileSync(path.join(__dirname,f),"utf8")).rows||[]).sort((a,b)=>a.order-b.order);
 const good=rows.filter(r=>r.parity),bad=rows.filter(r=>!r.parity);
 const curve=(key,match)=>Object.fromEntries(CHECKPOINTS.map(cp=>[cp,good.filter(r=>r[key][match]!==null&&r[key][match]<=cp).length]));
 const n=good.map(r=>r.normal.cpuToBoardMatch),g=good.map(r=>r.guided.cpuToBoardMatch);
 const improved=good.filter(r=>Number.isFinite(r.normal.cpuToBoardMatch)&&Number.isFinite(r.guided.cpuToBoardMatch)&&r.guided.cpuToBoardMatch<r.normal.cpuToBoardMatch);
 const worsened=good.filter(r=>Number.isFinite(r.normal.cpuToBoardMatch)&&Number.isFinite(r.guided.cpuToBoardMatch)&&r.guided.cpuToBoardMatch>r.normal.cpuToBoardMatch);
 const result={schema:"master40-guided-frozen-benchmark-v1",cases:rows.length,parityCases:good.length,parityFailures:bad.map(r=>r.order),
   boardCurve:{normal:curve("normal","earliestBoardMatch"),guided:curve("guided","earliestBoardMatch")},
   physicalCurve:{normal:curve("normal","earliestPhysicalMatch"),guided:curve("guided","earliestPhysicalMatch")},
   cpuToBoardMatch:{normal:{p50:percentile(n,.5),p95:percentile(n,.95),p99:percentile(n,.99),max:percentile(n,1)},guided:{p50:percentile(g,.5),p95:percentile(g,.95),p99:percentile(g,.99),max:percentile(g,1)}},
   scheduling:{improved:improved.length,worsened:worsened.length,equal:good.length-improved.length-worsened.length,improvedOrders:improved.map(r=>r.order),worsenedOrders:worsened.map(r=>r.order),
     aggregateCpuNormal:n.reduce((s,x)=>s+(Number.isFinite(x)?x:0),0),aggregateCpuGuided:g.reduce((s,x)=>s+(Number.isFinite(x)?x:0),0)},
   rows};
 result.scheduling.aggregateSavingPct=pct(result.scheduling.aggregateCpuNormal,result.scheduling.aggregateCpuGuided);
 fs.writeFileSync(path.join(__dirname,"master40-guided-frozen-results.json"),JSON.stringify(result,null,2)+"\n");
 console.log("MASTER40_GUIDED_FROZEN "+JSON.stringify({cases:result.cases,parityFailures:result.parityFailures,boardCurve:result.boardCurve,physicalCurve:result.physicalCurve,cpu:result.cpuToBoardMatch,scheduling:result.scheduling}));
 if(bad.length)process.exitCode=2;
}
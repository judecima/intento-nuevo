"use strict";

const fs=require("node:fs");
const path=require("node:path");
const ROOT=path.resolve(__dirname,"../../..");
const CORPUS=path.join(ROOT,"experiencia/canonical_cases.json");
const SHARD_INDEX=Number(process.env.SHARD_INDEX||0);
const SHARD_TOTAL=Number(process.env.SHARD_TOTAL||1);
const MODE=process.argv[2]||"blind";
const FULL_MS=8000,FULL_NODES=1600000,FULL_WATCHDOG_MS=12000;

process.env.OPTIMIZER_RUST_BEAM_RANK_CACHE_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_LEAN_BEAM_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_GREEDY_PLAN_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_LARGE_ROUND_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_SIMPLE_CHOOSE_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_MASTER_ROUND_REUSE_EXPERIMENTAL="0";
process.env.OPTIMIZER_MASTER_UNIQUE_MASKS_LE4_EXPERIMENTAL="1";

const {optimizarV10,nuevasMetricas,validarPlanIndustrial}=require(path.join(ROOT,"src/lib/optimizer/legacy/v10.cjs"));
const {createIncrementalRustMasterGenerator}=require("./incremental-rust-master-frozen.cjs");
const {generarPatronesLegacyRustHybrid}=require(path.join(ROOT,"src/lib/optimizer/legacy/rust/rust-patrones.cjs"));
const {patronesMonotipo}=require(path.join(ROOT,"src/lib/optimizer/legacy/patrones.cjs"));
const {resolverCobertura}=require(path.join(ROOT,"src/lib/optimizer/legacy/cobertura.cjs"));
const {materializar}=require(path.join(ROOT,"src/lib/optimizer/legacy/materializar.cjs"));

if(MODE==="blind") blind();
else if(MODE==="report") report();
else if(MODE==="audit4039132") audit4039132();
else throw new Error("mode blind|report|audit4039132");

function loadCorpus(){const raw=JSON.parse(fs.readFileSync(CORPUS,"utf8"));return Array.isArray(raw)?raw:(raw.cases||raw.records||raw.canonical_cases||raw.canonicalCases||raw.data||[]);}
function root(e){return e?.case??e?.canonical??e?.optimization_case??e?.optimizationCase??e;}
function num(...xs){for(const x of xs){const n=Number(x);if(Number.isFinite(n))return n;}return null;}
function orderNumber(v){const runs=String(v||"").replace(/\.xml$/i,"").match(/\d+/g);if(!runs)return null;const last=runs.at(-1);return Number(last.length>7?last.slice(-7):last);}
function caseIdentity(e,index){const r=root(e),vals=[e?.file,e?.file_name,e?.source_file,e?.case_id,e?.caseId,e?.name,e?.id,r?.file,r?.file_name,r?.source_file,r?.case_id,r?.caseId,r?.name,r?.id].filter(v=>typeof v==="string"||Number.isFinite(Number(v)));for(const s of vals){const n=orderNumber(s);if(Number.isFinite(n))return {order:n,file:String(s)};}return {order:null,file:"canonical-index-"+index};}
function problem(e){
 const r=root(e);if(!Array.isArray(r?.pieces)||!r.pieces.length)throw new Error("missing pieces");
 const width=num(r.panel?.width,r.stock_width,r.stockWidth,r.board_width,r.boardWidth),height=num(r.panel?.height,r.stock_height,r.stockHeight,r.board_height,r.boardHeight);
 const saw=num(r.kerf,r.saw,r.sierra,4.5),trimX=num(r.trim?.x,r.trim_x,r.trimX,r.refiladoX,0),trimY=num(r.trim?.y,r.trim_y,r.trimY,r.refiladoY,0);
 const directional=r.material?.hasGrain===true||Boolean(r.directional??r.directional_input??r.materialConVeta??r.has_grain)||r.pieces.some(p=>p.grain===true||p.veta===true||p.rotationAllowed===false);
 const lines=r.pieces.map((p,i)=>({base:num(p.base,p.width),altura:num(p.altura,p.height),cant:num(p.cant,p.quantity,1),veta:Boolean(p.veta??p.grain??(p.rotationAllowed===false)),ref:p.ref??p.reference??i,detalle:p.detalle??p.description??""}));
 if(lines.some(l=>!(l.base>0&&l.altura>0&&l.cant>0)))throw new Error("invalid piece dimensions");
 return {width,height,saw,trimX,trimY,directional,lines,pieces:lines.reduce((s,l)=>s+l.cant,0),types:lines.length};
}
function config(p,useMaster=false){return {placaBase:p.width,placaAltura:p.height,refiladoX:p.trimX,refiladoY:p.trimY,sierra:p.saw,etapas:4,materialConVeta:Boolean(p.directional),descontarCanto:false,cantoEspesor:0,restoMin:250,restoMax:400,usarOneBoard:true,usarMaster:useMaster,usarMultiSlice:true,usarCompactacion:true,usarRustPatternGenerator:true,usarCache:false,maxPiezasCache:0,rondasPatrones:40,msMaster:FULL_MS,usarCotaBarataPostCompactacion:true,usarDffFs0PostCompactacion:true,usarMascarasUnicasMasterLe4:true,minPiezasMultiSliceExperimental:200,maxPiezasMultiSliceExperimental:500};}
function screen(p){const cfg=config(p,false),t0=process.hrtime.bigint();const r=optimizarV10(p.lines,cfg,nuevasMetricas());const plan=r?.plan,v=plan?validarPlanIndustrial(plan,p.pieces):null;return {ok:Boolean(plan&&v?.ok),boards:plan?.resumen?.placas??null,cota:r?.cota??null,elapsedMs:Number(process.hrtime.bigint()-t0)/1e6};}
function cpuMs(start){const d=process.cpuUsage(start);return (d.user+d.system)/1000;}
function timed(fn){const c=process.cpuUsage(),t=process.hrtime.bigint();const value=fn();return {value,cpuMs:cpuMs(c),wallMs:Number(process.hrtime.bigint()-t)/1e6};}
function solve(pool,p,cfg,incumbent){
 const area=(cfg.placaBase-cfg.refiladoX)*(cfg.placaAltura-cfg.refiladoY);
 const t=timed(()=>{const h=resolverCobertura(pool,p.lines.map(l=>l.cant),area,incumbent,FULL_MS,{maxNodos:FULL_NODES,watchdogMs:FULL_WATCHDOG_MS});return h?h.resolver(p.lines.map(l=>l.base*l.altura)):null;});
 const sol=t.value;if(!sol?.plan)return {boards:incumbent,valid:true,cpuMs:t.cpuMs,wallMs:t.wallMs,nodes:sol?.nodos??null};
 const opts={...cfg,anchoUtil:cfg.placaBase-cfg.refiladoX,altoUtil:cfg.placaAltura-cfg.refiladoY};
 const plan=materializar(sol.plan,p.lines,opts),v=plan?validarPlanIndustrial(plan,p.pieces):null;
 return {boards:v?.ok?(plan.resumen?.placas??sol.placas??incumbent):incumbent,valid:Boolean(v?.ok),cpuMs:t.cpuMs,wallMs:t.wallMs,nodes:sol?.nodos??null};
}
function p3Arm(p,pre){const cfg=config(p,true),mono=patronesMonotipo(p.lines,cfg),gen=createIncrementalRustMasterGenerator(p.lines,cfg,40,7),gt=timed(()=>gen.execute([0,1,2])),pt=timed(()=>gen.patterns([0,1,2])),s=solve(pt.value.concat(mono),p,cfg,pre);return {boards:s.boards,valid:s.valid,nodes:s.nodes,genCpuMs:gen.generationCpuMs,dedupCpuMs:pt.cpuMs,solveCpuMs:s.cpuMs,totalCpuMs:gen.generationCpuMs+pt.cpuMs+s.cpuMs};}
function fullArm(p,pre){const cfg=config(p,true),mono=patronesMonotipo(p.lines,cfg),gt=timed(()=>generarPatronesLegacyRustHybrid(p.lines,cfg,40,7)),s=solve(gt.value.concat(mono),p,cfg,pre);return {boards:s.boards,valid:s.valid,nodes:s.nodes,genCpuMs:gt.cpuMs,solveCpuMs:s.cpuMs,totalCpuMs:gt.cpuMs+s.cpuMs};}

function blind(){
 const corpus=loadCorpus(),rows=[],stats={assigned:0,over500:0,over500Over40:0,active:0,errors:0};
 for(let i=SHARD_INDEX;i<corpus.length;i+=SHARD_TOTAL){
  stats.assigned++;let p;try{p=problem(corpus[i]);}catch(_){continue;}
  if(p.pieces<=500)continue;stats.over500++;
  if(p.types<=40)continue;stats.over500Over40++;
  const id=caseIdentity(corpus[i],i);
  try{
   const sc=screen(p);if(!sc.ok||!(sc.boards>sc.cota))continue;stats.active++;
   const p3=p3Arm(p,sc.boards),full=fullArm(p,sc.boards);
   rows.push({...id,canonicalIndex:i,pieces:p.pieces,typeCount:p.types,pre:sc.boards,lb:sc.cota,p3,full,loss:p3.boards>full.boards,gain:p3.boards<full.boards,parity:p3.boards===full.boards});
   console.log("BLIND_OVER500 "+JSON.stringify({order:id.order,pieces:p.pieces,types:p.types,pre:sc.boards,lb:sc.cota,p3:p3.boards,full:full.boards,loss:p3.boards>full.boards,gain:p3.boards<full.boards}));
  }catch(error){stats.errors++;rows.push({...id,canonicalIndex:i,error:String(error?.stack||error)});}
 }
 fs.writeFileSync(path.join(__dirname,"high-type-blind-over500-shard-"+SHARD_INDEX+".json"),JSON.stringify({schema:"high-type-blind-over500-shard-v1",shard:SHARD_INDEX,shardTotal:SHARD_TOTAL,stats,rows},null,2)+"\n");
}
function audit4039132(){
 const corpus=loadCorpus();let idx=-1,entry=null;
 for(let i=0;i<corpus.length;i++){const id=caseIdentity(corpus[i],i);if(id.order===4039132){idx=i;entry=corpus[i];break;}}
 if(!entry)throw new Error("4039132 not found");
 const p=problem(entry),sc=screen(p),runs=[];
 for(let i=0;i<5;i++){const p3=p3Arm(p,sc.boards),full=fullArm(p,sc.boards);runs.push({i,p3,full});console.log("AUDIT_4039132 "+JSON.stringify({i,p3:p3.boards,full:full.boards,p3Nodes:p3.nodes,fullNodes:full.nodes}));}
 fs.writeFileSync(path.join(__dirname,"audit-4039132-p3-vs-full40.json"),JSON.stringify({schema:"audit-4039132-p3-vs-full40-v1",canonicalIndex:idx,pieces:p.pieces,typeCount:p.types,pre:sc.boards,lb:sc.cota,runs},null,2)+"\n");
}
function report(){
 const expected=Number(process.env.SHARD_TOTAL||8),files=fs.readdirSync(__dirname).filter(x=>/^high-type-blind-over500-shard-\d+\.json$/.test(x));
 if(files.length!==expected)throw new Error("expected "+expected+" shards got "+files.length);
 const shards=files.map(f=>JSON.parse(fs.readFileSync(path.join(__dirname,f),"utf8"))),rows=shards.flatMap(s=>s.rows||[]),good=rows.filter(r=>!r.error),sum=(xs)=>xs.reduce((s,x)=>s+(Number.isFinite(x)?x:0),0);
 const out={schema:"high-type-blind-over500-results-v1",stats:{over500:sum(shards.map(s=>s.stats.over500)),over500Over40:sum(shards.map(s=>s.stats.over500Over40)),active:sum(shards.map(s=>s.stats.active)),errors:sum(shards.map(s=>s.stats.errors))},cases:good.length,losses:good.filter(r=>r.loss).map(r=>r.order),gains:good.filter(r=>r.gain).map(r=>r.order),parity:good.filter(r=>r.parity).length,p3CpuMs:sum(good.map(r=>r.p3.totalCpuMs)),fullCpuMs:sum(good.map(r=>r.full.totalCpuMs)),rows};
 out.savingPct=out.fullCpuMs>0?100*(out.fullCpuMs-out.p3CpuMs)/out.fullCpuMs:null;
 fs.writeFileSync(path.join(__dirname,"high-type-blind-over500-results.json"),JSON.stringify(out,null,2)+"\n");
 console.log("BLIND_OVER500_SUMMARY "+JSON.stringify({stats:out.stats,cases:out.cases,losses:out.losses,gains:out.gains,parity:out.parity,savingPct:out.savingPct}));
 if(out.losses.length)process.exitCode=2;
}
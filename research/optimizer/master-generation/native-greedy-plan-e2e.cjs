"use strict";

const crypto=require("node:crypto");
const fs=require("node:fs");
const path=require("node:path");
const {spawnSync}=require("node:child_process");

const REPO=path.resolve(__dirname,"../../..");
const OUT=__dirname;
const CORPUS=path.join(REPO,"experiencia/canonical_cases.json");
const HOTSPOTS=path.join(REPO,"experiencia/v6/hotspot-all.jsonl");
const SHARD_INDEX=Number(process.env.SHARD_INDEX||0);
const SHARD_TOTAL=Number(process.env.SHARD_TOTAL||1);
const MODE=process.argv[2]||"shard";

if(MODE==="shard") shard();
else if(MODE==="case") child(process.argv[3],Number(process.argv[4]),process.argv[5]==="candidate");
else if(MODE==="report") report();
else throw new Error("mode shard|case|report");

function loadCorpus(){const raw=JSON.parse(fs.readFileSync(CORPUS,"utf8"));return Array.isArray(raw)?raw:(raw.cases||raw.records||raw.canonical_cases||raw.canonicalCases||raw.data||[]);}
function root(e){return e?.case??e?.canonical??e?.optimization_case??e?.optimizationCase??e;}
function orderNumber(v){const runs=String(v||"").replace(/\.xml$/i,"").match(/\d+/g);if(!runs)return Infinity;const last=runs.at(-1);return Number(last.length>7?last.slice(-7):last);}
function strings(e){const r=root(e);return [e?.file,e?.file_name,e?.fileName,e?.source_file,e?.sourceFile,e?.case_id,e?.caseId,e?.name,e?.id,r?.file,r?.file_name,r?.fileName,r?.source_file,r?.sourceFile,r?.case_id,r?.caseId,r?.name,r?.id].filter(v=>typeof v==="string");}
function countPieces(e){const r=root(e);if(!Array.isArray(r?.pieces))return null;return r.pieces.reduce((s,p)=>s+Number(p.quantity??p.cant??1),0);}
function buildIndex(entries){const m=new Map();for(const e of entries){const os=new Set(strings(e).map(orderNumber).filter(Number.isFinite));for(const o of os){if(!m.has(o))m.set(o,[]);m.get(o).push(e);}}return m;}
function resolveExact(idx,file,pieces){const cs=idx.get(orderNumber(file))||[];const ex=cs.filter(e=>countPieces(e)===pieces);return ex.length===1?ex[0]:null;}
function selectTargets(){
 const hs=fs.readFileSync(HOTSPOTS,"utf8").trim().split(/\r?\n/).map(x=>JSON.parse(x));
 const idx=buildIndex(loadCorpus());
 const master=hs.filter(x=>(x.metricas?.master?.activaciones||0)>0)
   .sort((a,b)=>Number(b.stageMs?.masterGenerarPatrones||0)-Number(a.stageMs?.masterGenerarPatrones||0));
 const matched=[];
 for(const h of master) if(resolveExact(idx,h.file,h.pieces)) matched.push({file:h.file,pieces:h.pieces,historicalGenerateMs:Number(h.stageMs?.masterGenerarPatrones||0)});
 const selected=matched.filter(t=>t.pieces>120).slice(0,30);
 return {selected,matchedCount:matched.length,masterCount:master.length,unmatchedCount:master.length-matched.length};
}
function num(...xs){for(const x of xs){const n=Number(x);if(Number.isFinite(n))return n;}return null;}
function problem(file,pieces){
 const idx=buildIndex(loadCorpus()),e=resolveExact(idx,file,pieces);if(!e)throw new Error("exact match failed "+file);
 const r=root(e);
 const width=num(r.panel?.width,r.stock_width,r.stockWidth,r.board_width,r.boardWidth);
 const height=num(r.panel?.height,r.stock_height,r.stockHeight,r.board_height,r.boardHeight);
 const saw=num(r.kerf,r.saw,r.sierra,4.5),trimX=num(r.trim?.x,r.trim_x,r.trimX,r.refiladoX,0),trimY=num(r.trim?.y,r.trim_y,r.trimY,r.refiladoY,0);
 const directional=r.material?.hasGrain===true||Boolean(r.directional??r.directional_input??r.materialConVeta??r.has_grain)||r.pieces.some(p=>p.grain===true||p.veta===true||p.rotationAllowed===false);
 const lines=r.pieces.map((p,i)=>({base:num(p.base,p.width),altura:num(p.altura,p.height),cant:num(p.cant,p.quantity,1),veta:Boolean(p.veta??p.grain??(p.rotationAllowed===false)),ref:p.ref??p.reference??i,detalle:p.detalle??p.description??""}));
 return {width,height,saw,trimX,trimY,directional,lines};
}
function planDigest(plan){
 const boards=(plan?.placas||[]).map(b=>({
   p:(b.colocadas||[]).map(p=>[p?.pieza?.ref,p.base,p.altura,p.x,p.y,Boolean(p.rotada),p.nivel??0]),
   c:(b.cortes||[]).map(c=>[c.x1,c.y1,c.x2,c.y2,c.nivel??0,Boolean(c.terminal)]),
   r:(b.restos||[]).map(r=>[r.x,r.y,r.w,r.h]),
 }));
 return crypto.createHash("sha256").update(JSON.stringify(boards)).digest("hex");
}
function config(p){
 return {
   placaBase:p.width,placaAltura:p.height,refiladoX:p.trimX,refiladoY:p.trimY,sierra:p.saw,etapas:4,
   materialConVeta:Boolean(p.directional),descontarCanto:false,cantoEspesor:0,restoMin:250,restoMax:400,
   usarOneBoard:true,usarMaster:true,usarMultiSlice:true,usarCompactacion:true,usarRustPatternGenerator:true,
   usarCache:false,maxPiezasCache:0,rondasPatrones:40,msMaster:8000,
   usarCotaBarataPostCompactacion:true,usarDffFs0PostCompactacion:true,usarMascarasUnicasMasterLe4:true,
   minPiezasMultiSliceExperimental:200,maxPiezasMultiSliceExperimental:500,
 };
}
function child(file,pieces,candidate){
 process.env.OPTIMIZER_RUST_BEAM_RANK_CACHE_EXPERIMENTAL="1";
 process.env.OPTIMIZER_RUST_LEAN_BEAM_EXPERIMENTAL="1";
 delete process.env.OPTIMIZER_RUST_BEAM_DERIVED_METRICS_EXPERIMENTAL;
 if(candidate) process.env.OPTIMIZER_RUST_GREEDY_PLAN_EXPERIMENTAL="1";
 else delete process.env.OPTIMIZER_RUST_GREEDY_PLAN_EXPERIMENTAL;
 const {optimizarV10,nuevasMetricas,validarPlanIndustrial}=require(path.join(REPO,"src/lib/optimizer/legacy/v10.cjs"));
 const {calidadPlanPlacas}=require(path.join(REPO,"src/lib/optimizer/legacy/motor.cjs"));
 const p=problem(file,pieces),cfg=config(p),t0=process.hrtime.bigint();
 let result=null,error=null;
 try{result=optimizarV10(p.lines,cfg,nuevasMetricas());}catch(e){error=String(e?.stack||e?.message||e).slice(0,1200);}
 const elapsedMs=Number(process.hrtime.bigint()-t0)/1e6,plan=result?.plan??null,validation=plan?validarPlanIndustrial(plan,pieces):{ok:false};
 const row={file,pieces,mode:candidate?"candidate":"control",ok:!error&&Boolean(validation?.ok),error,elapsedMs,
   boards:plan?.resumen?.placas??null,digest:plan?planDigest(plan):null,
   quality:plan?calidadPlanPlacas(plan.placas,plan.opts||cfg):null,
   master:result?.metricas?.master??null,multislice:result?.metricas?.multislice??null,compactacion:result?.metricas?.compactacion??null,
   lowerBound:result?.metricas?.lowerBound??null};
 process.stdout.write("RESULT "+JSON.stringify(row)+"\n");
}
function run(file,pieces,candidate){
 const env={...process.env,RUST_LEGACY_DEBUG_ERRORS:"1",OPTIMIZER_RUST_MASTER_ROUND_REUSE_EXPERIMENTAL:"0"};
 const r=spawnSync(process.execPath,[__filename,"case",file,String(pieces),candidate?"candidate":"control"],{cwd:REPO,env,encoding:"utf8",maxBuffer:20*1024*1024});
 if(r.status!==0)throw new Error(file+" process failed\n"+r.stdout+"\n"+r.stderr);
 const line=r.stdout.split(/\r?\n/).find(x=>x.startsWith("RESULT "));if(!line)throw new Error("missing RESULT "+file);return JSON.parse(line.slice(7));
}
function pct(a,b){return a?+(100*(a-b)/a).toFixed(2):0;}
function shard(){
 const meta=selectTargets(),rows=[];
 for(let i=0;i<meta.selected.length;i++){
   if(i%SHARD_TOTAL!==SHARD_INDEX)continue;
   const t=meta.selected[i],order=i%2===0?[false,true]:[true,false],pair={...t,index:i,order:order.map(x=>x?"candidate":"control")};
   for(const candidate of order)pair[candidate?"candidate":"control"]=run(t.file,t.pieces,candidate);
   rows.push(pair);console.log(t.file+" control="+pair.control.elapsedMs.toFixed(1)+" candidate="+pair.candidate.elapsedMs.toFixed(1));
 }
 fs.writeFileSync(path.join(OUT,"native-greedy-plan-e2e-shard-"+SHARD_INDEX+".json"),JSON.stringify({shard:SHARD_INDEX,total:SHARD_TOTAL,meta:{selected:meta.selected.length,matchedCount:meta.matchedCount,masterCount:meta.masterCount,unmatchedCount:meta.unmatchedCount},rows},null,2)+"\n");
}
function q(xs,p){const a=xs.slice().sort((x,y)=>x-y);const pos=(a.length-1)*p,l=Math.floor(pos),h=Math.ceil(pos);return l===h?a[l]:a[l]+(a[h]-a[l])*(pos-l);}
function report(){
 const {compararCalidad}=require(path.join(REPO,"src/lib/optimizer/legacy/motor.cjs"));
 const files=fs.readdirSync(OUT).filter(x=>/^native-greedy-plan-e2e-shard-\d+\.json$/.test(x)),payloads=files.map(f=>JSON.parse(fs.readFileSync(path.join(OUT,f),"utf8"))),rows=payloads.flatMap(x=>x.rows).sort((a,b)=>a.index-b.index);
 const expected=payloads[0]?.meta?.selected||0;if(rows.length!==expected)throw new Error("expected "+expected+" got "+rows.length);
 const invalid=[],digestDiff=[],boardReg=[],remnantReg=[];
 for(const r of rows){
   const a=r.control,b=r.candidate;if(!a?.ok||!b?.ok){invalid.push(r.file);continue;}
   if(a.digest!==b.digest)digestDiff.push(r.file);
   if(b.boards>a.boards)boardReg.push(r.file);
   if(b.boards===a.boards&&compararCalidad(b.quality,a.quality)<0)remnantReg.push(r.file);
 }
 const cm=rows.map(r=>r.control.elapsedMs),bm=rows.map(r=>r.candidate.elapsedMs),sum=a=>a.reduce((s,x)=>s+x,0);
 const result={schema:"master-40-native-greedy-plan-e2e-v1",rounds:40,cohort:payloads[0].meta,
   quality:{invalid:invalid.length,digestDiffs:digestDiff.length,boardRegressions:boardReg.length,remnantRegressions:remnantReg.length,invalidFiles:invalid,digestDiffFiles:digestDiff,boardRegressionFiles:boardReg,remnantRegressionFiles:remnantReg},
   latency:{controlTotalMs:+sum(cm).toFixed(2),candidateTotalMs:+sum(bm).toFixed(2),totalSpeedupPct:pct(sum(cm),sum(bm)),controlP50:+q(cm,.5).toFixed(2),candidateP50:+q(bm,.5).toFixed(2),p50SpeedupPct:pct(q(cm,.5),q(bm,.5)),controlP95:+q(cm,.95).toFixed(2),candidateP95:+q(bm,.95).toFixed(2),p95SpeedupPct:pct(q(cm,.95),q(bm,.95)),controlP99:+q(cm,.99).toFixed(2),candidateP99:+q(bm,.99).toFixed(2),p99SpeedupPct:pct(q(cm,.99),q(bm,.99))},
   master:{controlMs:+rows.reduce((s,r)=>s+Number(r.control.master?.ms||0),0).toFixed(2),candidateMs:+rows.reduce((s,r)=>s+Number(r.candidate.master?.ms||0),0).toFixed(2),controlActivations:rows.reduce((s,r)=>s+Number(r.control.master?.activaciones||0),0),candidateActivations:rows.reduce((s,r)=>s+Number(r.candidate.master?.activaciones||0),0)},
   rows:rows.map(r=>({file:r.file,pieces:r.pieces,order:r.order,controlMs:+r.control.elapsedMs.toFixed(2),candidateMs:+r.candidate.elapsedMs.toFixed(2),speedupPct:pct(r.control.elapsedMs,r.candidate.elapsedMs),controlBoards:r.control.boards,candidateBoards:r.candidate.boards,digestSame:r.control.digest===r.candidate.digest,controlMasterMs:r.control.master?.ms||0,candidateMasterMs:r.candidate.master?.ms||0}))
 };
 fs.writeFileSync(path.join(OUT,"native-greedy-plan-e2e-results.json"),JSON.stringify(result,null,2)+"\n");console.log("MASTER40_NATIVE_GREEDY_PLAN_E2E "+JSON.stringify(result));
 if(invalid.length||digestDiff.length||boardReg.length||remnantReg.length)throw new Error("quality gate failed");
}

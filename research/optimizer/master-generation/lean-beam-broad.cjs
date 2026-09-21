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
 const matched=[],unmatched=[];
 for(const h of master){
   const e=resolveExact(idx,h.file,h.pieces);
   if(e)matched.push({file:h.file,pieces:h.pieces,historicalGenerateMs:Number(h.stageMs?.masterGenerarPatrones||0)});
   else unmatched.push({file:h.file,pieces:h.pieces});
 }
 const selected=matched.slice(0,24);
 for(const id of ["4050594","4059776"]){
   const x=matched.find(t=>t.file.includes(id));
   if(x&&!selected.some(t=>t.file===x.file))selected.push(x);
 }
 return {selected,matchedCount:matched.length,masterCount:master.length,unmatchedCount:unmatched.length};
}
function num(...xs){for(const x of xs){const n=Number(x);if(Number.isFinite(n))return n;}return null;}
function resolveProblem(file,pieces){
 const idx=buildIndex(loadCorpus()),e=resolveExact(idx,file,pieces);if(!e)throw new Error("exact match failed "+file);
 const r=root(e);
 return {
  width:num(r.panel?.width,r.stock_width,r.stockWidth,r.board_width,r.boardWidth),
  height:num(r.panel?.height,r.stock_height,r.stockHeight,r.board_height,r.boardHeight),
  saw:num(r.kerf,r.saw,r.sierra,4.5),trimX:num(r.trim?.x,r.trim_x,r.trimX,r.refiladoX,0),trimY:num(r.trim?.y,r.trim_y,r.trimY,r.refiladoY,0),
  directional:r.material?.hasGrain===true||Boolean(r.directional??r.directional_input??r.materialConVeta??r.has_grain)||r.pieces.some(p=>p.grain===true||p.veta===true||p.rotationAllowed===false),
  pieces:r.pieces.map((p,i)=>({base:num(p.base,p.width),altura:num(p.altura,p.height),cant:num(p.cant,p.quantity,1),veta:Boolean(p.veta??p.grain??(p.rotationAllowed===false)),ref:p.ref??p.reference??i,detalle:p.detalle??p.description??""}))
 };
}
function boardDigest(b){return {p:(b?.colocadas||[]).map(p=>[p?.pieza?.ref,p.base,p.altura,p.x,p.y,Boolean(p.rotada),p.nivel??0]),c:(b?.cortes||[]).map(c=>[c.x1,c.y1,c.x2,c.y2,c.nivel??0,Boolean(c.terminal)]),r:(b?.restos||[]).map(r=>[r.x,r.y,r.w,r.h])};}
function poolDigest(pool){const norm=pool.map(p=>({uso:[...p.uso.entries()].sort((a,b)=>a[0]-b[0]),area:p.area,placa:boardDigest(p.placa)}));return crypto.createHash("sha256").update(JSON.stringify(norm)).digest("hex");}
function cfg(p){return {placaBase:p.width,placaAltura:p.height,refiladoX:p.trimX,refiladoY:p.trimY,sierra:p.saw,etapas:4,materialConVeta:Boolean(p.directional),descontarCanto:false,cantoEspesor:0,restoMin:250,restoMax:400,usarRustPatternGenerator:true,rondasPatrones:40,usarMascarasUnicasMasterLe4:true};}
function child(file,pieces,candidate){
 delete process.env.OPTIMIZER_RUST_BEAM_DERIVED_METRICS_EXPERIMENTAL;
 process.env.OPTIMIZER_RUST_BEAM_RANK_CACHE_EXPERIMENTAL="1";
 if(candidate) process.env.OPTIMIZER_RUST_LEAN_BEAM_EXPERIMENTAL="1";
 else delete process.env.OPTIMIZER_RUST_LEAN_BEAM_EXPERIMENTAL;
 const {generarPatrones}=require(path.join(REPO,"src/lib/optimizer/legacy/patrones.cjs"));
 const p=resolveProblem(file,pieces),config=cfg(p),t0=process.hrtime.bigint(),pool=generarPatrones(p.pieces,config,40,7),ms=Number(process.hrtime.bigint()-t0)/1e6;
 process.stdout.write("RESULT "+JSON.stringify({file,pieces,mode:candidate?"candidate":"control",ms,poolSize:pool.length,digest:poolDigest(pool),fallback:Boolean(config._rustPatternGeneratorFallback)})+"\n");
}
function run(file,pieces,candidate){
 const env={...process.env,RUST_LEGACY_DEBUG_ERRORS:"1",OPTIMIZER_RUST_MASTER_ROUND_REUSE_EXPERIMENTAL:"0"};
 const r=spawnSync(process.execPath,[__filename,"case",file,String(pieces),candidate?"candidate":"control"],{cwd:REPO,env,encoding:"utf8",maxBuffer:20*1024*1024});
 if(r.status!==0)throw new Error(file+" failed\n"+r.stdout+"\n"+r.stderr);
 const line=r.stdout.split(/\r?\n/).find(x=>x.startsWith("RESULT "));if(!line)throw new Error("missing result "+file);return JSON.parse(line.slice(7));
}
function pct(a,b){return a?+(100*(a-b)/a).toFixed(2):0;}
function shard(){
 const meta=selectTargets(),rows=[];
 for(let i=0;i<meta.selected.length;i++){
   if(i%SHARD_TOTAL!==SHARD_INDEX)continue;
   const t=meta.selected[i],order=i%2===0?[false,true]:[true,false],pair={...t,index:i,order:order.map(x=>x?"candidate":"control")};
   for(const candidate of order)pair[candidate?"candidate":"control"]=run(t.file,t.pieces,candidate);
   pair.poolParity=pair.control.poolSize===pair.candidate.poolSize&&pair.control.digest===pair.candidate.digest;
   pair.speedupPct=pct(pair.control.ms,pair.candidate.ms);
   rows.push(pair);
   console.log(t.file+" speedup="+pair.speedupPct+" parity="+pair.poolParity);
 }
 fs.writeFileSync(path.join(OUT,"lean-beam-broad-shard-"+SHARD_INDEX+".json"),JSON.stringify({shard:SHARD_INDEX,total:SHARD_TOTAL,meta:{selected:meta.selected.length,matchedCount:meta.matchedCount,masterCount:meta.masterCount,unmatchedCount:meta.unmatchedCount},rows},null,2)+"\n");
}
function q(xs,p){const a=xs.slice().sort((x,y)=>x-y);const pos=(a.length-1)*p,l=Math.floor(pos),h=Math.ceil(pos);return l===h?a[l]:a[l]+(a[h]-a[l])*(pos-l);}
function report(){
 const files=fs.readdirSync(OUT).filter(x=>/^lean-beam-broad-shard-\d+\.json$/.test(x)),payloads=files.map(f=>JSON.parse(fs.readFileSync(path.join(OUT,f),"utf8"))),rows=payloads.flatMap(x=>x.rows).sort((a,b)=>a.index-b.index);
 const expected=payloads[0]?.meta?.selected||0;if(rows.length!==expected)throw new Error("expected "+expected+" got "+rows.length);
 const bad=rows.filter(r=>!r.poolParity),control=rows.map(r=>r.control.ms),candidate=rows.map(r=>r.candidate.ms),sum=a=>a.reduce((s,x)=>s+x,0);
 const result={schema:"master-40-lean-beam-broad-v1",rounds:40,cohort:payloads[0].meta,quality:{poolParityFailures:bad.length,files:bad.map(x=>x.file)},latency:{controlTotalMs:+sum(control).toFixed(2),candidateTotalMs:+sum(candidate).toFixed(2),totalSpeedupPct:pct(sum(control),sum(candidate)),controlP50:+q(control,.5).toFixed(2),candidateP50:+q(candidate,.5).toFixed(2),p50SpeedupPct:pct(q(control,.5),q(candidate,.5)),controlP95:+q(control,.95).toFixed(2),candidateP95:+q(candidate,.95).toFixed(2),p95SpeedupPct:pct(q(control,.95),q(candidate,.95)),controlP99:+q(control,.99).toFixed(2),candidateP99:+q(candidate,.99).toFixed(2),p99SpeedupPct:pct(q(control,.99),q(candidate,.99))},rows};
 fs.writeFileSync(path.join(OUT,"lean-beam-broad-results.json"),JSON.stringify(result,null,2)+"\n");console.log("MASTER40_LEAN_BEAM_BROAD "+JSON.stringify(result));if(bad.length)throw new Error("pool parity failed");
}

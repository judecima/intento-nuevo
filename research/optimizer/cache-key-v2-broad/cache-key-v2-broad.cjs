"use strict";

const crypto=require("node:crypto");
const fs=require("node:fs");
const path=require("node:path");

const REPO=path.resolve(__dirname,"../../..");
const OUT=__dirname;
const CANONICAL=path.join(REPO,"experiencia/canonical_cases.json");
const HIST=path.join(REPO,"experiencia/v5/baseline-v10-5000-2000-r1.json");
const SHARD_INDEX=Number(process.env.SHARD_INDEX||0);
const SHARD_TOTAL=Number(process.env.SHARD_TOTAL||1);
const MODE=process.argv[2]||"shard";
const MAX_CASES=96;

process.env.OPTIMIZER_RUST_MASTER_ROUND_REUSE_EXPERIMENTAL="0";
process.env.OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL="0";
process.env.OPTIMIZER_POST_COMPACT_CHEAP_LB_EXPERIMENTAL="0";
process.env.OPTIMIZER_DFF_FS0_LB_EXPERIMENTAL="0";
process.env.OPTIMIZER_MASTER_UNIQUE_MASKS_LE4_EXPERIMENTAL="0";
process.env.OPTIMIZER_BASELINE_MULTISLICE_PACKING_REUSE_EXPERIMENTAL="0";

if(MODE==="shard")runShard();
else if(MODE==="report")report();
else throw new Error("mode shard|report");

function j(f){return JSON.parse(fs.readFileSync(f,"utf8"));}
function unwrap(raw){
 if(Array.isArray(raw))return raw;
 for(const k of ["cases","records","canonical_cases","canonicalCases","data"])if(Array.isArray(raw?.[k]))return raw[k];
 throw new Error("unsupported corpus");
}
function root(e){return e?.case??e?.canonical??e?.optimization_case??e?.optimizationCase??e;}
function orderNumber(v){
 const runs=String(v||"").replace(/\.xml$/i,"").match(/\d+/g);
 if(!runs)return Infinity;
 const last=runs[runs.length-1];
 return Number(last.length>7?last.slice(-7):last);
}
function names(e){const r=root(e);return[e?.file,e?.file_name,e?.fileName,e?.source_file,e?.sourceFile,e?.case_id,e?.caseId,e?.name,e?.id,r?.file,r?.file_name,r?.fileName,r?.source_file,r?.sourceFile,r?.case_id,r?.caseId,r?.name,r?.id].filter(v=>typeof v==="string"&&v.length);}
function countPieces(e){const r=root(e);if(!Array.isArray(r?.pieces))return null;let s=0;for(const p of r.pieces){const q=Number(p.quantity??p.cant??1);if(!(q>0))return null;s+=q;}return s;}
function indexCorpus(entries){
 const m=new Map();
 for(const e of entries){
  const os=new Set(names(e).map(orderNumber).filter(Number.isFinite));
  const ex=Number(e?.order??root(e)?.order);if(Number.isFinite(ex))os.add(ex);
  for(const o of os){if(!m.has(o))m.set(o,[]);m.get(o).push(e);}
 }
 return m;
}
function resolveExact(idx,file,pieces){
 const cs=idx.get(orderNumber(file))||[];
 const ex=cs.filter(e=>countPieces(e)===pieces);
 return ex.length===1?ex[0]:null;
}
function num(...xs){for(const x of xs){const n=Number(x);if(Number.isFinite(n))return n;}return null;}
function problem(e,file){
 const r=root(e),width=num(r.panel?.width,r.stock_width,r.stockWidth,r.board_width,r.boardWidth),height=num(r.panel?.height,r.stock_height,r.stockHeight,r.board_height,r.boardHeight);
 const saw=num(r.kerf,r.saw,r.sierra,4.5),trimX=num(r.trim?.x,r.trim_x,r.trimX,r.refiladoX,0),trimY=num(r.trim?.y,r.trim_y,r.trimY,r.refiladoY,0);
 const directional=r.material?.hasGrain===true||Boolean(r.directional??r.directional_input??r.materialConVeta??r.has_grain)||r.pieces.some(p=>p.grain===true||p.veta===true||p.rotationAllowed===false);
 const pieces=r.pieces.map((p,i)=>({base:num(p.base,p.width),altura:num(p.altura,p.height),cant:num(p.cant,p.quantity,1),veta:Boolean(p.veta??p.grain??(p.rotationAllowed===false)),ref:p.ref??p.reference??i,detalle:p.detalle??p.description??""}));
 if(!(width>0)||!(height>0)||pieces.some(p=>!(p.base>0)||!(p.altura>0)||!(p.cant>0)))throw new Error(file+":bad geometry");
 return{file,width,height,saw,trimX,trimY,directional,pieces};
}
function selectedCases(){
 const hist=j(HIST).records.filter(r=>r.ok).slice().sort((a,b)=>a.order-b.order);
 const test=hist.slice(1600,2000);
 const entries=unwrap(j(CANONICAL)),idx=indexCorpus(entries),matched=[];
 for(const h of test){
  if(!(h.pieces<=160))continue;
  const e=resolveExact(idx,h.file,h.pieces);
  if(!e)continue;
  matched.push({hist:h,entry:e});
 }
 const expensive=matched.slice().sort((a,b)=>b.hist.totalMs-a.hist.totalMs);
 const top=expensive.slice(0,48);
 const topFiles=new Set(top.map(x=>x.hist.file));
 const rest=matched.filter(x=>!topFiles.has(x.hist.file)).sort((a,b)=>a.hist.order-b.hist.order);
 const broad=[];
 const need=Math.min(48,rest.length);
 for(let i=0;i<need;i++){
  const pos=need===1?0:Math.round(i*(rest.length-1)/(need-1));
  broad.push(rest[pos]);
 }
 const byFile=new Map();
 for(const x of [...top,...broad])byFile.set(x.hist.file,x);
 const selected=[...byFile.values()].slice(0,MAX_CASES);
 return{selected,matchedCount:matched.length,testCount:test.length};
}
function digest(plan){
 const boards=(plan?.placas??[]).map(b=>({p:(b.colocadas??[]).map(p=>[p?.pieza?.ref,p.base,p.altura,p.x,p.y,Boolean(p.rotada),p.nivel??0]),c:(b.cortes??[]).map(c=>[c.x1,c.y1,c.x2,c.y2,c.nivel??0,Boolean(c.terminal)]),r:(b.restos??[]).map(r=>[r.x,r.y,r.w,r.h])}));
 return crypto.createHash("sha256").update(JSON.stringify(boards)).digest("hex");
}
function config(p,mode){
 return{
  placaBase:p.width,placaAltura:p.height,refiladoX:p.trimX,refiladoY:p.trimY,sierra:p.saw,etapas:4,materialConVeta:Boolean(p.directional),
  descontarCanto:false,cantoEspesor:0,restoMin:250,restoMax:400,usarOneBoard:true,usarMaster:true,usarMultiSlice:true,usarCompactacion:true,
  usarRustPatternGenerator:true,usarCache:mode!=="nocache",maxPiezasCache:mode!=="nocache"?160:0,rondasPatrones:40,msMaster:8000,
  usarCotaBarataPostCompactacion:true,usarDffFs0PostCompactacion:true,usarMascarasUnicasMasterLe4:true,
 };
}
function runOne(p,expected,mode){
 const {optimizarV10,nuevasMetricas,validarPlanIndustrial}=require(path.join(REPO,"src/lib/optimizer/legacy/v10.cjs"));
 const {calidadPlanPlacas}=require(path.join(REPO,"src/lib/optimizer/legacy/motor.cjs"));
 process.env.OPTIMIZER_PACKING_CACHE_KEY_V2_EXPERIMENTAL=mode==="v2"?"1":"0";
 const lines=p.pieces.map((x,i)=>({base:x.base,altura:x.altura,cant:x.cant,veta:Boolean(p.directional)&&Boolean(x.veta),ref:x.ref??i,detalle:x.detalle}));
 const cfg=config(p,mode);
 const t0=process.hrtime.bigint();let result=null,error=null;
 try{result=optimizarV10(lines,cfg,nuevasMetricas());}catch(e){error=String(e?.stack||e?.message||e).slice(0,1000);}
 const ms=Number(process.hrtime.bigint()-t0)/1e6,plan=result?.plan??null,val=plan?validarPlanIndustrial(plan,expected):{ok:false};
 return{mode,ok:!error&&Boolean(val?.ok),error,boards:plan?.resumen?.placas??null,elapsedMs:ms,digest:plan?digest(plan):null,quality:plan?calidadPlanPlacas(plan.placas,plan.opts||cfg):null,cacheHits:plan?.resumen?.cacheHits??0,cacheMisses:plan?.resumen?.cacheFallos??0};
}
function runShard(){
 const {selected,matchedCount,testCount}=selectedCases(),rows=[];
 for(let i=0;i<selected.length;i++){
  if(i%SHARD_TOTAL!==SHARD_INDEX)continue;
  const x=selected[i],p=problem(x.entry,x.hist.file);
  const perms=[["legacy","v2","nocache"],["v2","nocache","legacy"],["nocache","legacy","v2"]];
  const order=perms[i%perms.length],row={file:x.hist.file,orderNumber:x.hist.order,pieces:x.hist.pieces,historicalMs:x.hist.totalMs,globalIndex:i,modeOrder:order};
  for(const mode of order){
   row[mode]=runOne(p,x.hist.pieces,mode);
   console.log("shard="+SHARD_INDEX+" "+row.file+" "+mode+" boards="+row[mode].boards+" ms="+row[mode].elapsedMs.toFixed(1));
  }
  rows.push(row);
 }
 fs.writeFileSync(path.join(OUT,"cache-v2-broad-shard-"+SHARD_INDEX+".json"),JSON.stringify({shard:SHARD_INDEX,total:SHARD_TOTAL,selectedCount:selected.length,matchedCount,testCount,rows},null,2)+"\n");
}
function q(xs,p){const a=xs.slice().sort((x,y)=>x-y);if(!a.length)return 0;const pos=(a.length-1)*p,l=Math.floor(pos),h=Math.ceil(pos);return l===h?a[l]:a[l]+(a[h]-a[l])*(pos-l);}
function lat(rows,m){const xs=rows.map(r=>r[m]).filter(r=>r?.ok).map(r=>r.elapsedMs),total=xs.reduce((a,b)=>a+b,0);return{n:xs.length,totalMs:+total.toFixed(2),avgMs:+(total/Math.max(1,xs.length)).toFixed(2),p50Ms:+q(xs,.5).toFixed(2),p90Ms:+q(xs,.9).toFixed(2),p95Ms:+q(xs,.95).toFixed(2),p99Ms:+q(xs,.99).toFixed(2),maxMs:+Math.max(0,...xs).toFixed(2)};}
function red(a,b){return a>0?+(100*(a-b)/a).toFixed(2):0;}
function report(){
 const {compararCalidad}=require(path.join(REPO,"src/lib/optimizer/legacy/motor.cjs"));
 const fsx=fs.readdirSync(OUT).filter(x=>/^cache-v2-broad-shard-\d+\.json$/.test(x)),rows=fsx.flatMap(f=>j(path.join(OUT,f)).rows).sort((a,b)=>a.globalIndex-b.globalIndex);
 if(!rows.length)throw new Error("no rows");
 const comp=(m)=>{
  const invalid=[],digestDiff=[],boardDiff=[],remnantWorse=[];
  for(const r of rows){const a=r.nocache,b=r[m];if(!a?.ok||!b?.ok){invalid.push(r.file);continue;}if(a.digest!==b.digest)digestDiff.push(r.file);if(a.boards!==b.boards)boardDiff.push(r.file);if(b.boards===a.boards&&compararCalidad(b.quality,a.quality)<0)remnantWorse.push(r.file);}
  return{invalid,digestDiff,boardDiff,remnantWorse};
 };
 const L=lat(rows,"legacy"),V=lat(rows,"v2"),N=lat(rows,"nocache"),legacy=comp("legacy"),v2=comp("v2");
 const result={schema:"optimizer-cache-key-v2-broad-v1",cases:rows.length,selection:{topExpensive:48,broad:48,cacheActive:true,holdout:"historical rows 1600..1999, exact canonical matching"},latency:{legacy:L,v2:V,nocache:N,v2VsLegacy:{total:red(L.totalMs,V.totalMs),p50:red(L.p50Ms,V.p50Ms),p90:red(L.p90Ms,V.p90Ms),p95:red(L.p95Ms,V.p95Ms),p99:red(L.p99Ms,V.p99Ms),max:red(L.maxMs,V.maxMs)},v2VsNoCache:{total:red(N.totalMs,V.totalMs),p95:red(N.p95Ms,V.p95Ms),p99:red(N.p99Ms,V.p99Ms)}},quality:{legacyVsNoCache:{invalid:legacy.invalid.length,digestDiffs:legacy.digestDiff.length,boardDiffs:legacy.boardDiff.length,remnantWorse:legacy.remnantWorse.length,files:legacy.digestDiff},v2VsNoCache:{invalid:v2.invalid.length,digestDiffs:v2.digestDiff.length,boardDiffs:v2.boardDiff.length,remnantWorse:v2.remnantWorse.length,files:v2.digestDiff}},perCase:rows.map(r=>({file:r.file,pieces:r.pieces,historicalMs:r.historicalMs,legacyMs:+r.legacy.elapsedMs.toFixed(2),v2Ms:+r.v2.elapsedMs.toFixed(2),nocacheMs:+r.nocache.elapsedMs.toFixed(2),legacyDigestEqNoCache:r.legacy.digest===r.nocache.digest,v2DigestEqNoCache:r.v2.digest===r.nocache.digest,boards:r.v2.boards}))};
 fs.writeFileSync(path.join(OUT,"cache-v2-broad-results.json"),JSON.stringify(result,null,2)+"\n");
 console.log("CACHE_V2_BROAD "+JSON.stringify(result));
 if(v2.invalid.length||v2.digestDiff.length||v2.boardDiff.length||v2.remnantWorse.length)throw new Error("V2 correctness gate failed");
}

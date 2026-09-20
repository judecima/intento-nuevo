"use strict";

const crypto=require("node:crypto");
const fs=require("node:fs");
const path=require("node:path");

const REPO=path.resolve(__dirname,"../../..");
const OUT=__dirname;
const CANONICAL=path.join(REPO,"experiencia/canonical_cases.json");

const TARGETS=[
["4059795__diego_primo4059795.xml",950,false],
["4060603__JACOB_LIMON4060603.xml",85,false],
["4061546__Fer_LIg4061546.xml",109,false],
["4059352__victor_moneta4059352.xml",430,false],
["4061518__Fer_LIg4061518.xml",105,false],
["4061468__BEATRIZ ADRIANA_SILVA VARGAS4061468.xml",98,false],
["4059224__Mega_Maderas4059224.xml",134,false],
["4061358__BEATRIZ ADRIANA_SILVA VARGAS4061358.xml",73,false],
["4060810__Dinorah_Contreras4060810.xml",96,false],
["4059776__diego_primo4059776.xml",142,false],
["4060221__JUAN_FEMATT4060221.xml",88,false],
["4061048__LUIS ALFREDO_MARTINEZ SANCHEZ4061048.xml",58,false],
["4060002__Adrian_SEIF4060002.xml",88,false],
["4060963__alexandra_de la fuente hernandez4060963.xml",73,false],
["4061112__Ana Medina_Ana Medina4061112.xml",219,false],
["4060025__Fer_LIg4060025.xml",143,false],
["4061529__Silvio_Barraza4061529.xml",182,false],
["4061281__ALFREDO_CELESTINO4061281.xml",48,false],
["4059306__ALEJANDRA_RUIZ4059306.xml",56,false],
["4059222__Mega_Maderas4059222.xml",79,false],
["4055118__federico_mercado4055118.xml",238,true],
["4052458__Hernan_Giufrida4052458.xml",293,true],
];

const SHARD_INDEX=Number(process.env.SHARD_INDEX||0);
const SHARD_TOTAL=Number(process.env.SHARD_TOTAL||1);
const MODE=process.argv[2]||"shard";

process.env.OPTIMIZER_PACKING_CACHE_KEY_V2_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_MASTER_ROUND_REUSE_EXPERIMENTAL="0";
process.env.OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL="0";
process.env.OPTIMIZER_POST_COMPACT_CHEAP_LB_EXPERIMENTAL="0";
process.env.OPTIMIZER_DFF_FS0_LB_EXPERIMENTAL="0";
process.env.OPTIMIZER_MASTER_UNIQUE_MASKS_LE4_EXPERIMENTAL="0";

if(MODE==="shard") runShard();
else if(MODE==="report") report();
else throw new Error("mode shard|report");

function loadJson(f){return JSON.parse(fs.readFileSync(f,"utf8"));}
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
function names(e){
 const r=root(e);
 return [e?.file,e?.file_name,e?.fileName,e?.source_file,e?.sourceFile,e?.case_id,e?.caseId,e?.name,e?.id,
 r?.file,r?.file_name,r?.fileName,r?.source_file,r?.sourceFile,r?.case_id,r?.caseId,r?.name,r?.id]
 .filter(v=>typeof v==="string"&&v.length);
}
function countPieces(e){
 const r=root(e); if(!Array.isArray(r?.pieces))return null;
 let s=0; for(const p of r.pieces){const q=Number(p.quantity??p.cant??1);if(!(q>0))return null;s+=q;} return s;
}
function indexCorpus(entries){
 const m=new Map();
 for(const e of entries){
  const os=new Set(names(e).map(orderNumber).filter(Number.isFinite));
  const ex=Number(e?.order??root(e)?.order); if(Number.isFinite(ex))os.add(ex);
  for(const o of os){if(!m.has(o))m.set(o,[]);m.get(o).push(e);}
 }
 return m;
}
function resolveExact(idx,file,pieces){
 const cs=idx.get(orderNumber(file))||[];
 const ex=cs.filter(e=>countPieces(e)===pieces);
 if(ex.length!==1)throw new Error(file+": exact match failed candidates="+cs.length+" exact="+ex.length);
 return ex[0];
}
function num(...xs){for(const x of xs){const n=Number(x);if(Number.isFinite(n))return n;}return null;}
function problem(e,file){
 const r=root(e);
 const width=num(r.panel?.width,r.stock_width,r.stockWidth,r.board_width,r.boardWidth);
 const height=num(r.panel?.height,r.stock_height,r.stockHeight,r.board_height,r.boardHeight);
 const saw=num(r.kerf,r.saw,r.sierra,4.5),trimX=num(r.trim?.x,r.trim_x,r.trimX,r.refiladoX,0),trimY=num(r.trim?.y,r.trim_y,r.trimY,r.refiladoY,0);
 const directional=r.material?.hasGrain===true||Boolean(r.directional??r.directional_input??r.materialConVeta??r.has_grain)||r.pieces.some(p=>p.grain===true||p.veta===true||p.rotationAllowed===false);
 const pieces=r.pieces.map((p,i)=>({base:num(p.base,p.width),altura:num(p.altura,p.height),cant:num(p.cant,p.quantity,1),veta:Boolean(p.veta??p.grain??(p.rotationAllowed===false)),ref:p.ref??p.reference??i,detalle:p.detalle??p.description??""}));
 if(!(width>0)||!(height>0)||pieces.some(p=>!(p.base>0)||!(p.altura>0)||!(p.cant>0)))throw new Error(file+": bad geometry");
 return {file,width,height,saw,trimX,trimY,directional,pieces};
}
function digest(plan){
 const boards=(plan?.placas??[]).map(b=>({
  p:(b.colocadas??[]).map(p=>[p?.pieza?.ref,p.base,p.altura,p.x,p.y,Boolean(p.rotada),p.nivel??0]),
  c:(b.cortes??[]).map(c=>[c.x1,c.y1,c.x2,c.y2,c.nivel??0,Boolean(c.terminal)]),
  r:(b.restos??[]).map(r=>[r.x,r.y,r.w,r.h]),
 }));
 return crypto.createHash("sha256").update(JSON.stringify(boards)).digest("hex");
}
function cfg(p,reuse,sentinel){
 const total=p.pieces.reduce((s,x)=>s+x.cant,0),cacheLimit=total<=160?160:0;
 return {
  placaBase:p.width,placaAltura:p.height,refiladoX:p.trimX,refiladoY:p.trimY,sierra:p.saw,etapas:4,
  materialConVeta:Boolean(p.directional),descontarCanto:false,cantoEspesor:0,restoMin:250,restoMax:400,
  usarOneBoard:true,usarMaster:true,usarMultiSlice:true,usarCompactacion:true,usarRustPatternGenerator:true,
  usarCache:cacheLimit>0,maxPiezasCache:cacheLimit,rondasPatrones:40,msMaster:8000,
  usarCotaBarataPostCompactacion:!sentinel,usarDffFs0PostCompactacion:!sentinel,usarMascarasUnicasMasterLe4:true,
  reusarPackingBaselineMultiSlice:reuse,
  _packingSharedMinPool:40,
  _packingSharedMaxEntries:512,
 };
}
function runOne(p,expected,sentinel,reuse){
 const {optimizarV10,nuevasMetricas,validarPlanIndustrial}=require(path.join(REPO,"src/lib/optimizer/legacy/v10.cjs"));
 const {calidadPlanPlacas}=require(path.join(REPO,"src/lib/optimizer/legacy/motor.cjs"));
 const lines=p.pieces.map((x,i)=>({base:x.base,altura:x.altura,cant:x.cant,veta:Boolean(p.directional)&&Boolean(x.veta),ref:x.ref??i,detalle:x.detalle}));
 const config=cfg(p,reuse,sentinel);
 const t0=process.hrtime.bigint(); let result=null,error=null;
 try{result=optimizarV10(lines,config,nuevasMetricas());}catch(e){error=String(e?.stack||e?.message||e).slice(0,1000);}
 const elapsedMs=Number(process.hrtime.bigint()-t0)/1e6,plan=result?.plan??null,val=plan?validarPlanIndustrial(plan,expected):{ok:false};
 return {
  mode:reuse?"reuse":"control",ok:!error&&Boolean(val?.ok),error,boards:plan?.resumen?.placas??null,elapsedMs,
  digest:plan?digest(plan):null,quality:plan?calidadPlanPlacas(plan.placas,plan.opts||config):null,
  multiMs:Number(result?.metricas?.multislice?.ms||0),masterMs:Number(result?.metricas?.master?.ms||0),compactMs:Number(result?.metricas?.compactacion?.ms||0),
  sharedHits:Number(result?.metricas?.multislice?.sharedPackingHits||0),sharedEntries:Number(result?.metricas?.multislice?.sharedPackingEntries||0),
 };
}
function runShard(){
 const entries=unwrap(loadJson(CANONICAL)),idx=indexCorpus(entries),rows=[];
 for(let i=0;i<TARGETS.length;i++){
  if(i%SHARD_TOTAL!==SHARD_INDEX)continue;
  const [file,expected,sentinel]=TARGETS[i],p=problem(resolveExact(idx,file,expected),file);
  const order=(i%2===0)?[false,true]:[true,false];
  const pair={file,expected,sentinel,globalIndex:i,order:order.map(x=>x?"reuse":"control")};
  for(const reuse of order){
   const r=runOne(p,expected,sentinel,reuse);
   pair[reuse?"reuse":"control"]=r;
   console.log("shard="+SHARD_INDEX+" "+file+" "+r.mode+" boards="+r.boards+" ms="+r.elapsedMs.toFixed(1)+" hits="+r.sharedHits+" entries="+r.sharedEntries);
  }
  rows.push(pair);
 }
 fs.writeFileSync(path.join(OUT,"bounded-reuse-shard-"+SHARD_INDEX+".json"),JSON.stringify({shard:SHARD_INDEX,total:SHARD_TOTAL,rows},null,2)+"\n");
}
function q(xs,p){const a=xs.slice().sort((x,y)=>x-y);if(!a.length)return 0;const pos=(a.length-1)*p,l=Math.floor(pos),h=Math.ceil(pos);return l===h?a[l]:a[l]+(a[h]-a[l])*(pos-l);}
function latency(rows,mode){const xs=rows.map(r=>r[mode]).filter(Boolean).filter(r=>r.ok).map(r=>r.elapsedMs);const total=xs.reduce((a,b)=>a+b,0);return{n:xs.length,totalMs:+total.toFixed(2),avgMs:+(total/Math.max(1,xs.length)).toFixed(2),p50Ms:+q(xs,.5).toFixed(2),p90Ms:+q(xs,.9).toFixed(2),p95Ms:+q(xs,.95).toFixed(2),p99Ms:+q(xs,.99).toFixed(2),maxMs:+Math.max(0,...xs).toFixed(2)};}
function red(a,b){return a>0?+(100*(a-b)/a).toFixed(2):0;}
function report(){
 const {compararCalidad}=require(path.join(REPO,"src/lib/optimizer/legacy/motor.cjs"));
 const files=fs.readdirSync(OUT).filter(x=>/^bounded-reuse-shard-\d+\.json$/.test(x));
 const rows=files.flatMap(f=>loadJson(path.join(OUT,f)).rows).sort((a,b)=>a.globalIndex-b.globalIndex);
 if(rows.length!==TARGETS.length)throw new Error("expected "+TARGETS.length+" rows got "+rows.length);
 const bad=[],digestDiff=[],boardReg=[],remnantReg=[];
 for(const p of rows){
  const a=p.control,b=p.reuse;
  if(!a?.ok||!b?.ok){bad.push(p.file);continue;}
  if(a.digest!==b.digest)digestDiff.push(p.file);
  if(b.boards>a.boards)boardReg.push(p.file);
  if(b.boards===a.boards&&compararCalidad(b.quality,a.quality)<0)remnantReg.push(p.file);
 }
 const A=latency(rows,"control"),B=latency(rows,"reuse");
 const result={
  schema:"optimizer-bounded-baseline-multislice-reuse-v1",
  candidate:{minPool:40,maxEntries:512},
  latency:{control:A,reuse:B,improvementPct:{total:red(A.totalMs,B.totalMs),avg:red(A.avgMs,B.avgMs),p50:red(A.p50Ms,B.p50Ms),p90:red(A.p90Ms,B.p90Ms),p95:red(A.p95Ms,B.p95Ms),p99:red(A.p99Ms,B.p99Ms),max:red(A.maxMs,B.maxMs)}},
  quality:{invalid:bad.length,digestDiffs:digestDiff.length,boardRegressions:boardReg.length,remnantRegressions:remnantReg.length,bad,digestDiff,boardReg,remnantReg},
  reuse:{hits:rows.reduce((s,r)=>s+(r.reuse?.sharedHits||0),0),entries:rows.reduce((s,r)=>s+(r.reuse?.sharedEntries||0),0),
         multiControlMs:+rows.reduce((s,r)=>s+(r.control?.multiMs||0),0).toFixed(2),multiReuseMs:+rows.reduce((s,r)=>s+(r.reuse?.multiMs||0),0).toFixed(2)},
  perCase:rows.map(r=>({file:r.file,order:r.order,controlMs:+r.control.elapsedMs.toFixed(2),reuseMs:+r.reuse.elapsedMs.toFixed(2),speedupPct:red(r.control.elapsedMs,r.reuse.elapsedMs),boards:r.control.boards,hits:r.reuse.sharedHits,entries:r.reuse.sharedEntries,sentinel:r.sentinel})),
 };
 fs.writeFileSync(path.join(OUT,"bounded-reuse-results.json"),JSON.stringify(result,null,2)+"\n");
 console.log("BOUNDED_REUSE "+JSON.stringify(result));
 if(bad.length||digestDiff.length||boardReg.length||remnantReg.length)throw new Error("quality gate failed");
}

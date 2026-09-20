"use strict";

const crypto=require("node:crypto");
const fs=require("node:fs");
const path=require("node:path");

const REPO=path.resolve(__dirname,"../../..");
const OUT=__dirname;
const CANONICAL=path.join(REPO,"experiencia/canonical_cases.json");
const HOTSPOTS=path.join(REPO,"experiencia/v6/hotspot-all.jsonl");
const MIN_PIECES=200;
const MAX_PIECES=500;
const SHARD_INDEX=Number(process.env.SHARD_INDEX||0);
const SHARD_TOTAL=Number(process.env.SHARD_TOTAL||1);
const MODE=process.argv[2]||"shard";

if(MODE==="shard") runShard();
else if(MODE==="report") report();
else throw new Error("mode must be shard|report");

function loadJson(f){return JSON.parse(fs.readFileSync(f,"utf8"));}
function unwrap(raw){
 if(Array.isArray(raw)) return raw;
 for(const k of ["cases","records","canonical_cases","canonicalCases","data"])
  if(Array.isArray(raw?.[k])) return raw[k];
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
 let s=0;
 for(const p of r.pieces){const q=Number(p.quantity??p.cant??1);if(!(q>0))return null;s+=q;}
 return s;
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
 return {entry:ex.length===1?ex[0]:null,candidates:cs.length,exactCount:ex.length,counts:cs.map(countPieces)};
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
function cfg(p,candidate){
 const total=p.pieces.reduce((s,x)=>s+x.cant,0),cacheLimit=total<=160?160:0;
 return {
  placaBase:p.width,placaAltura:p.height,refiladoX:p.trimX,refiladoY:p.trimY,sierra:p.saw,etapas:4,
  materialConVeta:Boolean(p.directional),descontarCanto:false,cantoEspesor:0,restoMin:250,restoMax:400,
  usarOneBoard:true,usarMaster:true,usarMultiSlice:true,usarCompactacion:true,usarRustPatternGenerator:true,
  usarCache:cacheLimit>0,maxPiezasCache:cacheLimit,rondasPatrones:40,msMaster:8000,
  usarCotaBarataPostCompactacion:true,usarDffFs0PostCompactacion:true,usarMascarasUnicasMasterLe4:true,
  minPiezasMultiSliceExperimental:candidate?MIN_PIECES:0,
  maxPiezasMultiSliceExperimental:candidate?MAX_PIECES:0,
 };
}
function runOne(p,expected,candidate){
 const {optimizarV10,nuevasMetricas,validarPlanIndustrial}=require(path.join(REPO,"src/lib/optimizer/legacy/v10.cjs"));
 const {calidadPlanPlacas}=require(path.join(REPO,"src/lib/optimizer/legacy/motor.cjs"));
 const lines=p.pieces.map((x,i)=>({base:x.base,altura:x.altura,cant:x.cant,veta:Boolean(p.directional)&&Boolean(x.veta),ref:x.ref??i,detalle:x.detalle}));
 const config=cfg(p,candidate);
 const t0=process.hrtime.bigint();let result=null,error=null;
 try{result=optimizarV10(lines,config,nuevasMetricas());}catch(e){error=String(e?.stack||e?.message||e).slice(0,1000);}
 const elapsedMs=Number(process.hrtime.bigint()-t0)/1e6,plan=result?.plan??null,val=plan?validarPlanIndustrial(plan,expected):{ok:false};
 return {
  mode:candidate?"candidate":"control",ok:!error&&Boolean(val?.ok),error,boards:plan?.resumen?.placas??null,elapsedMs,
  digest:plan?digest(plan):null,quality:plan?calidadPlanPlacas(plan.placas,plan.opts||config):null,
  multiMs:Number(result?.metricas?.multislice?.ms||0),multiActivations:Number(result?.metricas?.multislice?.activaciones||0),
  multiWins:Number(result?.metricas?.multislice?.ganancias||0),masterMs:Number(result?.metricas?.master?.ms||0),compactMs:Number(result?.metricas?.compactacion?.ms||0),
 };
}
function historicalActive(){
 const rows=fs.readFileSync(HOTSPOTS,"utf8").trim().split(/\r?\n/).map(x=>JSON.parse(x));
 const active=rows.filter(r=>(r.metricas?.multislice?.activaciones||0)>0);
 const wins=active.filter(r=>(r.metricas?.multislice?.ganancias||0)>0);
 if(wins.length!==4)throw new Error("expected 4 historical MultiSlice wins, got "+wins.length);
 const lost=wins.filter(r=>r.pieces<MIN_PIECES||r.pieces>MAX_PIECES);
 if(lost.length)throw new Error("envelope suppresses known wins: "+lost.map(r=>r.file).join(","));
 return {active,wins};
}
function prepare(){
 const {active,wins}=historicalActive();
 const idx=indexCorpus(unwrap(loadJson(CANONICAL)));
 const matched=[],unmatched=[];
 for(const h of active){
  const r=resolveExact(idx,h.file,h.pieces);
  if(!r.entry){
   unmatched.push({file:h.file,pieces:h.pieces,candidates:r.candidates,exactCount:r.exactCount,counts:r.counts});
   continue;
  }
  matched.push({historical:h,entry:r.entry});
 }
 return {active,wins,matched,unmatched};
}
function runShard(){
 const prep=prepare(),rows=[];
 for(let i=0;i<prep.matched.length;i++){
  if(i%SHARD_TOTAL!==SHARD_INDEX)continue;
  const item=prep.matched[i],h=item.historical,p=problem(item.entry,h.file);
  const order=(i%2===0)?[false,true]:[true,false];
  const pair={file:h.file,pieces:h.pieces,historicalBoards:h.boards,historicalCota:h.cota,historicalMultiWin:(h.metricas?.multislice?.ganancias||0)>0,globalIndex:i,order:order.map(x=>x?"candidate":"control")};
  for(const candidate of order){
   const r=runOne(p,h.pieces,candidate);
   pair[candidate?"candidate":"control"]=r;
   console.log("shard="+SHARD_INDEX+" "+h.file+" "+r.mode+" pieces="+h.pieces+" boards="+r.boards+" ms="+r.elapsedMs.toFixed(1)+" multi="+r.multiMs.toFixed(1));
  }
  rows.push(pair);
 }
 fs.writeFileSync(path.join(OUT,"broad-shard-"+SHARD_INDEX+".json"),JSON.stringify({
  shard:SHARD_INDEX,total:SHARD_TOTAL,activeHistorical:prep.active.length,matched:prep.matched.length,unmatched:prep.unmatched.length,
  knownWins:prep.wins.map(x=>({file:x.file,pieces:x.pieces,boards:x.boards,cota:x.cota})),unmatchedCases:prep.unmatched,rows
 },null,2)+"\n");
}
function q(xs,p){const a=xs.slice().sort((x,y)=>x-y);if(!a.length)return 0;const pos=(a.length-1)*p,l=Math.floor(pos),h=Math.ceil(pos);return l===h?a[l]:a[l]+(a[h]-a[l])*(pos-l);}
function latency(rows,mode){const xs=rows.map(r=>r[mode]).filter(Boolean).filter(r=>r.ok).map(r=>r.elapsedMs);const total=xs.reduce((a,b)=>a+b,0);return{n:xs.length,totalMs:+total.toFixed(2),avgMs:+(total/Math.max(1,xs.length)).toFixed(2),p50Ms:+q(xs,.5).toFixed(2),p90Ms:+q(xs,.9).toFixed(2),p95Ms:+q(xs,.95).toFixed(2),p99Ms:+q(xs,.99).toFixed(2),maxMs:+Math.max(0,...xs).toFixed(2)};}
function red(a,b){return a>0?+(100*(a-b)/a).toFixed(2):0;}
function report(){
 const {compararCalidad}=require(path.join(REPO,"src/lib/optimizer/legacy/motor.cjs"));
 const files=fs.readdirSync(OUT).filter(x=>/^broad-shard-\d+\.json$/.test(x));
 const payloads=files.map(f=>loadJson(path.join(OUT,f)));
 if(!payloads.length)throw new Error("no shard payloads");
 const expectedMatched=payloads[0].matched,expectedActive=payloads[0].activeHistorical,expectedUnmatched=payloads[0].unmatched;
 const rows=payloads.flatMap(x=>x.rows).sort((a,b)=>a.globalIndex-b.globalIndex);
 if(rows.length!==expectedMatched)throw new Error("expected "+expectedMatched+" matched rows got "+rows.length);
 const invalid=[],digestDiff=[],boardReg=[],remnantReg=[];
 for(const p of rows){
  const a=p.control,b=p.candidate;
  if(!a?.ok||!b?.ok){invalid.push(p.file);continue;}
  if(a.digest!==b.digest)digestDiff.push(p.file);
  if(b.boards>a.boards)boardReg.push(p.file);
  if(b.boards===a.boards&&compararCalidad(b.quality,a.quality)<0)remnantReg.push(p.file);
 }
 const A=latency(rows,"control"),B=latency(rows,"candidate");
 const result={
  schema:"optimizer-multislice-envelope-broad-v1",minPieces:MIN_PIECES,maxPieces:MAX_PIECES,
  cohort:{historicalActive:expectedActive,exactMatched:expectedMatched,unmatched:expectedUnmatched,coveragePct:+(100*expectedMatched/Math.max(1,expectedActive)).toFixed(2),
          skippedByEnvelope:rows.filter(r=>r.pieces<MIN_PIECES||r.pieces>MAX_PIECES).length,keptByEnvelope:rows.filter(r=>r.pieces>=MIN_PIECES&&r.pieces<=MAX_PIECES).length},
  latency:{control:A,candidate:B,improvementPct:{total:red(A.totalMs,B.totalMs),avg:red(A.avgMs,B.avgMs),p50:red(A.p50Ms,B.p50Ms),p90:red(A.p90Ms,B.p90Ms),p95:red(A.p95Ms,B.p95Ms),p99:red(A.p99Ms,B.p99Ms),max:red(A.maxMs,B.maxMs)}},
  quality:{invalid:invalid.length,digestDiffs:digestDiff.length,boardRegressions:boardReg.length,remnantRegressions:remnantReg.length,invalidFiles:invalid,digestDiffFiles:digestDiff,boardRegressionFiles:boardReg,remnantRegressionFiles:remnantReg},
  multislice:{controlMs:+rows.reduce((s,r)=>s+(r.control?.multiMs||0),0).toFixed(2),candidateMs:+rows.reduce((s,r)=>s+(r.candidate?.multiMs||0),0).toFixed(2),
              controlActivations:rows.reduce((s,r)=>s+(r.control?.multiActivations||0),0),candidateActivations:rows.reduce((s,r)=>s+(r.candidate?.multiActivations||0),0),
              controlWins:rows.reduce((s,r)=>s+(r.control?.multiWins||0),0),candidateWins:rows.reduce((s,r)=>s+(r.candidate?.multiWins||0),0)},
  knownWins:payloads[0].knownWins,
  unmatchedCases:payloads[0].unmatchedCases,
  perCase:rows.map(r=>({file:r.file,pieces:r.pieces,historicalMultiWin:r.historicalMultiWin,order:r.order,controlMs:+r.control.elapsedMs.toFixed(2),candidateMs:+r.candidate.elapsedMs.toFixed(2),speedupPct:red(r.control.elapsedMs,r.candidate.elapsedMs),controlBoards:r.control.boards,candidateBoards:r.candidate.boards,controlMultiMs:+r.control.multiMs.toFixed(2),candidateMultiMs:+r.candidate.multiMs.toFixed(2)}))
 };
 fs.writeFileSync(path.join(OUT,"broad-results.json"),JSON.stringify(result,null,2)+"\n");
 console.log("MULTISLICE_ENVELOPE_BROAD "+JSON.stringify(result));
 if(invalid.length||digestDiff.length||boardReg.length||remnantReg.length)throw new Error("quality gate failed");
}

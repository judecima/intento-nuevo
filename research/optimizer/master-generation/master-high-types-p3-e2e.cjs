"use strict";

const crypto=require("node:crypto");
const fs=require("node:fs");
const path=require("node:path");
const ROOT=path.resolve(__dirname,"../../..");
const CORPUS=path.join(ROOT,"experiencia/canonical_cases.json");
const SHARD_INDEX=Number(process.env.SHARD_INDEX||0);
const SHARD_TOTAL=Number(process.env.SHARD_TOTAL||1);
const MODE=process.argv[2]||"shard";

process.env.OPTIMIZER_RUST_BEAM_RANK_CACHE_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_LEAN_BEAM_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_GREEDY_PLAN_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_LARGE_ROUND_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_SIMPLE_CHOOSE_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_MASTER_ROUND_REUSE_EXPERIMENTAL="0";
process.env.OPTIMIZER_MASTER_UNIQUE_MASKS_LE4_EXPERIMENTAL="1";

const {optimizarV10,nuevasMetricas,validarPlanIndustrial}=require(path.join(ROOT,"src/lib/optimizer/legacy/v10.cjs"));
const {calidadPlanPlacas}=require(path.join(ROOT,"src/lib/optimizer/legacy/motor.cjs"));

if(MODE==="shard") shard();
else if(MODE==="report") report();
else throw new Error("mode shard|report");

function loadCorpus(){const raw=JSON.parse(fs.readFileSync(CORPUS,"utf8"));return Array.isArray(raw)?raw:(raw.cases||raw.records||raw.canonical_cases||raw.canonicalCases||raw.data||[]);}
function root(e){return e?.case??e?.canonical??e?.optimization_case??e?.optimizationCase??e;}
function num(...xs){for(const x of xs){const n=Number(x);if(Number.isFinite(n))return n;}return null;}
function orderNumber(v){const runs=String(v||"").replace(/\.xml$/i,"").match(/\d+/g);if(!runs)return null;const last=runs.at(-1);return Number(last.length>7?last.slice(-7):last);}
function caseIdentity(e,index){const r=root(e),vals=[e?.file,e?.file_name,e?.source_file,e?.case_id,e?.caseId,e?.name,e?.id,r?.file,r?.file_name,r?.source_file,r?.case_id,r?.caseId,r?.name,r?.id].filter(v=>typeof v==="string"||Number.isFinite(Number(v)));for(const s of vals){const n=orderNumber(s);if(Number.isFinite(n))return {order:n,file:String(s)};}return {order:null,file:"canonical-index-"+index};}
function problem(e){
 const r=root(e);if(!Array.isArray(r?.pieces)||!r.pieces.length)throw new Error("missing pieces");
 const width=num(r.panel?.width,r.stock_width,r.stockWidth,r.board_width,r.boardWidth),height=num(r.panel?.height,r.stock_height,r.stockHeight,r.board_height,r.boardHeight);
 if(!(width>0&&height>0))throw new Error("invalid stock");
 const saw=num(r.kerf,r.saw,r.sierra,4.5),trimX=num(r.trim?.x,r.trim_x,r.trimX,r.refiladoX,0),trimY=num(r.trim?.y,r.trim_y,r.trimY,r.refiladoY,0);
 const directional=r.material?.hasGrain===true||Boolean(r.directional??r.directional_input??r.materialConVeta??r.has_grain)||r.pieces.some(p=>p.grain===true||p.veta===true||p.rotationAllowed===false);
 const lines=r.pieces.map((p,i)=>({base:num(p.base,p.width),altura:num(p.altura,p.height),cant:num(p.cant,p.quantity,1),veta:Boolean(p.veta??p.grain??(p.rotationAllowed===false)),ref:p.ref??p.reference??i,detalle:p.detalle??p.description??""}));
 if(lines.some(l=>!(l.base>0&&l.altura>0&&l.cant>0)))throw new Error("invalid piece");
 return {width,height,saw,trimX,trimY,directional,lines,pieces:lines.reduce((s,l)=>s+l.cant,0),types:lines.length};
}
function config(p,flag){return {placaBase:p.width,placaAltura:p.height,refiladoX:p.trimX,refiladoY:p.trimY,sierra:p.saw,etapas:4,materialConVeta:Boolean(p.directional),descontarCanto:false,cantoEspesor:0,restoMin:250,restoMax:400,usarOneBoard:true,usarMaster:true,usarMultiSlice:true,usarCompactacion:true,usarRustPatternGenerator:true,usarCache:false,maxPiezasCache:0,rondasPatrones:40,msMaster:8000,maxNodosMaster:1600000,watchdogMasterMs:12000,usarCotaBarataPostCompactacion:true,usarDffFs0PostCompactacion:true,usarMascarasUnicasMasterLe4:true,minPiezasMultiSliceExperimental:200,maxPiezasMultiSliceExperimental:500,masterHighTypesP3Experimental:flag};}
function digest(v){return crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");}
function boardDigest(board){return {placements:(board?.colocadas||[]).map(p=>[p?.pieza?.ref,p.base,p.altura,p.x,p.y,Boolean(p.rotada),p.nivel??0]),cuts:(board?.cortes||[]).map(c=>[c.x1,c.y1,c.x2,c.y2,c.nivel??0,Boolean(c.terminal)]),remnants:(board?.restos||[]).map(r=>[r.x,r.y,r.w,r.h])};}
function planDigest(plan){return plan?digest((plan.placas||[]).map(boardDigest)):null;}
function run(p,flag){
 const cfg=config(p,flag),cpu0=process.cpuUsage(),t0=process.hrtime.bigint();
 try{
  const result=optimizarV10(p.lines,cfg,nuevasMetricas()),wallMs=Number(process.hrtime.bigint()-t0)/1e6,d=process.cpuUsage(cpu0),cpuMs=(d.user+d.system)/1000;
  const plan=result?.plan||null,v=plan?validarPlanIndustrial(plan,p.pieces):{ok:false};
  return {ok:Boolean(plan&&v?.ok),boards:plan?.resumen?.placas??null,cota:result?.cota??null,cpuMs,wallMs,masterMs:result?.metricas?.master?.ms??0,totalMetricMs:result?.metricas?.total?.ms??0,masterWins:result?.metricas?.master?.ganancias??0,masterActivations:result?.metricas?.master?.activaciones??0,planDigest:planDigest(plan),quality:plan?calidadPlanPlacas(plan.placas,plan.opts||cfg):null,error:null};
 }catch(e){const wallMs=Number(process.hrtime.bigint()-t0)/1e6,d=process.cpuUsage(cpu0);return {ok:false,boards:null,cota:null,cpuMs:(d.user+d.system)/1000,wallMs,error:String(e?.stack||e?.message||e)};}
}
function qualityCmp(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function shard(){
 const corpus=loadCorpus(),rows=[],counts={assigned:0,valid:0,invalid:0,paired:0,single:0};
 for(let i=SHARD_INDEX;i<corpus.length;i+=SHARD_TOTAL){
  counts.assigned++;let p;try{p=problem(corpus[i]);}catch(_){counts.invalid++;continue;}
  const id=caseIdentity(corpus[i],i);
  if(p.types>40){
   counts.paired++;
   const firstCandidate=(i%2===1),a=firstCandidate?run(p,true):run(p,false),b=firstCandidate?run(p,false):run(p,true),base=firstCandidate?b:a,cand=firstCandidate?a:b;
   const row={...id,canonicalIndex:i,pieces:p.pieces,typeCount:p.types,base,cand,boardDelta:(cand.boards??Infinity)-(base.boards??Infinity),sameBoards:cand.boards===base.boards,samePlan:cand.planDigest===base.planDigest,sameQuality:qualityCmp(cand.quality,base.quality),cpuSavingMs:base.cpuMs-cand.cpuMs,wallSavingMs:base.wallMs-cand.wallMs};
   rows.push(row);if(base.ok&&cand.ok)counts.valid++;else counts.invalid++;
   console.log("HIGH_TYPE_E2E "+JSON.stringify({order:id.order,types:p.types,base:base.boards,cand:cand.boards,delta:row.boardDelta,sameQuality:row.sameQuality,baseCpu:base.cpuMs,candCpu:cand.cpuMs}));
  }else{
   counts.single++;const base=run(p,false),cand={...base};rows.push({...id,canonicalIndex:i,pieces:p.pieces,typeCount:p.types,base,cand,boardDelta:0,sameBoards:true,samePlan:true,sameQuality:true,cpuSavingMs:0,wallSavingMs:0});if(base.ok)counts.valid++;else counts.invalid++;
  }
 }
 fs.writeFileSync(path.join(__dirname,"master-high-types-p3-e2e-shard-"+SHARD_INDEX+".json"),JSON.stringify({schema:"master-high-types-p3-e2e-shard-v1",shard:SHARD_INDEX,shardTotal:SHARD_TOTAL,counts,rows},null,2)+"\n");
}
function quant(xs,p){const a=xs.filter(Number.isFinite).slice().sort((x,y)=>x-y);if(!a.length)return null;const pos=(a.length-1)*p,l=Math.floor(pos),h=Math.ceil(pos);return l===h?a[l]:a[l]+(a[h]-a[l])*(pos-l);}
function report(){
 const expected=Number(process.env.SHARD_TOTAL||32),files=fs.readdirSync(__dirname).filter(x=>/^master-high-types-p3-e2e-shard-\d+\.json$/.test(x));
 if(files.length!==expected)throw new Error("expected "+expected+" shards got "+files.length);
 const shards=files.map(f=>JSON.parse(fs.readFileSync(path.join(__dirname,f),"utf8"))),rows=shards.flatMap(s=>s.rows||[]),good=rows.filter(r=>r.base?.ok&&r.cand?.ok),paired=good.filter(r=>r.typeCount>40);
 const sum=xs=>xs.reduce((s,x)=>s+(Number.isFinite(x)?x:0),0);
 const baseCpu=sum(good.map(r=>r.base.cpuMs)),candCpu=sum(good.map(r=>r.cand.cpuMs)),baseWall=sum(good.map(r=>r.base.wallMs)),candWall=sum(good.map(r=>r.cand.wallMs);
 const losses=paired.filter(r=>r.boardDelta>0),gains=paired.filter(r=>r.boardDelta<0),same=paired.filter(r=>r.boardDelta===0),qualityDiff=paired.filter(r=>r.boardDelta===0&&!r.sameQuality);
 const out={schema:"master-high-types-p3-e2e-results-v1",cases:good.length,pairedCases:paired.length,invalid:rows.length-good.length,boards:{losses:losses.map(r=>({order:r.order,base:r.base.boards,cand:r.cand.boards})),gains:gains.map(r=>({order:r.order,base:r.base.boards,cand:r.cand.boards})),same:same.length},quality:{equalBoardQualityDiffs:qualityDiff.map(r=>r.order)},cpu:{baseTotalMs:baseCpu,candidateTotalMs:candCpu,savingPct:baseCpu>0?100*(baseCpu-candCpu)/baseCpu:null,baseP50:quant(good.map(r=>r.base.cpuMs),.5),candP50:quant(good.map(r=>r.cand.cpuMs),.5),baseP95:quant(good.map(r=>r.base.cpuMs),.95),candP95:quant(good.map(r=>r.cand.cpuMs),.95),baseP99:quant(good.map(r=>r.base.cpuMs),.99),candP99:quant(good.map(r=>r.cand.cpuMs),.99)},wall:{baseTotalMs:baseWall,candidateTotalMs:candWall,savingPct:baseWall>0?100*(baseWall-candWall)/baseWall:null},master:{baseMs:sum(good.map(r=>r.base.masterMs)),candMs:sum(good.map(r=>r.cand.masterMs))},rows};
 fs.writeFileSync(path.join(__dirname,"master-high-types-p3-e2e-results.json"),JSON.stringify(out,null,2)+"\n");
 console.log("HIGH_TYPE_E2E_SUMMARY "+JSON.stringify({cases:out.cases,pairedCases:out.pairedCases,invalid:out.invalid,boards:out.boards,quality:out.quality,cpu:out.cpu,wall:out.wall,master:out.master}));
 if(losses.length||qualityDiff.length)process.exitCode=2;
}
"use strict";

const crypto=require("node:crypto");
const fs=require("node:fs");
const path=require("node:path");
const ROOT=path.resolve(__dirname,"../../..");
const CORPUS=path.join(ROOT,"experiencia/canonical_cases.json");
const TARGETS=new Set([4006643,4007744,4086863,4109997,4039132,4116943]);

process.env.OPTIMIZER_RUST_BEAM_RANK_CACHE_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_LEAN_BEAM_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_GREEDY_PLAN_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_LARGE_ROUND_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_SIMPLE_CHOOSE_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_MASTER_ROUND_REUSE_EXPERIMENTAL="0";
process.env.OPTIMIZER_MASTER_UNIQUE_MASKS_LE4_EXPERIMENTAL="1";

const {optimizarV10,nuevasMetricas,validarPlanIndustrial}=require(path.join(ROOT,"src/lib/optimizer/legacy/v10.cjs"));
const {calidadPlanPlacas}=require(path.join(ROOT,"src/lib/optimizer/legacy/motor.cjs"));

function loadCorpus(){const raw=JSON.parse(fs.readFileSync(CORPUS,"utf8"));return Array.isArray(raw)?raw:(raw.cases||raw.records||raw.canonical_cases||raw.canonicalCases||raw.data||[]);}
function root(e){return e?.case??e?.canonical??e?.optimization_case??e?.optimizationCase??e;}
function num(...xs){for(const x of xs){const n=Number(x);if(Number.isFinite(n))return n;}return null;}
function orderNumber(v){const runs=String(v||"").replace(/\.xml$/i,"").match(/\d+/g);if(!runs)return null;const last=runs.at(-1);return Number(last.length>7?last.slice(-7):last);}
function caseIdentity(e,index){const r=root(e),vals=[e?.file,e?.file_name,e?.fileName,e?.source_file,e?.sourceFile,e?.case_id,e?.caseId,e?.name,e?.id,r?.file,r?.file_name,r?.fileName,r?.source_file,r?.sourceFile,r?.case_id,r?.caseId,r?.name,r?.id].filter(v=>typeof v==="string"||Number.isFinite(Number(v)));for(const s of vals){const n=orderNumber(s);if(Number.isFinite(n))return n;}return null;}
function problem(e){
 const r=root(e);if(!Array.isArray(r?.pieces)||!r.pieces.length)throw new Error("missing pieces");
 const width=num(r.panel?.width,r.stock_width,r.stockWidth,r.board_width,r.boardWidth),height=num(r.panel?.height,r.stock_height,r.stockHeight,r.board_height,r.boardHeight);
 const saw=num(r.kerf,r.saw,r.sierra,4.5),trimX=num(r.trim?.x,r.trim_x,r.trimX,r.refiladoX,0),trimY=num(r.trim?.y,r.trim_y,r.trimY,r.refiladoY,0);
 const directional=r.material?.hasGrain===true||Boolean(r.directional??r.directional_input??r.materialConVeta??r.has_grain)||r.pieces.some(p=>p.grain===true||p.veta===true||p.rotationAllowed===false);
 const lines=r.pieces.map((p,i)=>({base:num(p.base,p.width),altura:num(p.altura,p.height),cant:num(p.cant,p.quantity,1),veta:Boolean(p.veta??p.grain??(p.rotationAllowed===false)),ref:p.ref??p.reference??i,detalle:p.detalle??p.description??""}));
 return {width,height,saw,trimX,trimY,directional,lines,pieces:lines.reduce((s,l)=>s+l.cant,0)};
}
function cfg(p,shadow){
 return {placaBase:p.width,placaAltura:p.height,refiladoX:p.trimX,refiladoY:p.trimY,sierra:p.saw,etapas:4,materialConVeta:Boolean(p.directional),descontarCanto:false,cantoEspesor:0,restoMin:250,restoMax:400,usarOneBoard:true,usarMaster:true,usarMultiSlice:true,usarCompactacion:true,usarRustPatternGenerator:true,usarCache:false,maxPiezasCache:0,rondasPatrones:40,msMaster:8000,maxNodosMaster:1600000,watchdogMasterMs:12000,usarCotaBarataPostCompactacion:true,usarDffFs0PostCompactacion:true,usarMascarasUnicasMasterLe4:true,minPiezasMultiSliceExperimental:200,maxPiezasMultiSliceExperimental:500,masterHighTypesP3Experimental:true,masterHighTypesP3ShadowSample:shadow};
}
function digest(v){return crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");}
function boardDigest(board){return {placements:(board?.colocadas||[]).map(p=>[p?.pieza?.ref,p.base,p.altura,p.x,p.y,Boolean(p.rotada),p.nivel??0]),cuts:(board?.cortes||[]).map(c=>[c.x1,c.y1,c.x2,c.y2,c.nivel??0,Boolean(c.terminal)]),remnants:(board?.restos||[]).map(r=>[r.x,r.y,r.w,r.h])};}
function planDigest(plan){return plan?digest((plan.placas||[]).map(boardDigest)):null;}
function run(p,shadow){
 const config=cfg(p,shadow),m=nuevasMetricas(),r=optimizarV10(p.lines,config,m),plan=r.plan,v=plan?validarPlanIndustrial(plan,p.pieces):null;
 if(!plan||!v?.ok)throw new Error("invalid plan");
 return {boards:plan.resumen.placas,planDigest:planDigest(plan),quality:calidadPlanPlacas(plan.placas,plan.opts||config),shadow:r.metricas.masterShadow,master:r.metricas.master,total:r.metricas.total};
}

const corpus=loadCorpus(),rows=[];
for(let i=0;i<corpus.length;i++){
 const order=caseIdentity(corpus[i],i);if(!TARGETS.has(order))continue;
 const p=problem(corpus[i]),off=run(p,false),on=run(p,true);
 const primarySame=off.boards===on.boards&&off.planDigest===on.planDigest&&JSON.stringify(off.quality)===JSON.stringify(on.quality);
 rows.push({order,types:p.lines.length,pieces:p.pieces,off,on,primarySame});
 console.log("SHADOW_AUDIT_CASE "+JSON.stringify({order,primarySame,boards:off.boards,shadow:on.shadow}));
 if(!primarySame)throw new Error("shadow changed primary output for "+order);
 if(p.lines.length>40 && on.shadow.sampled!==1)throw new Error("shadow not sampled "+order);
}
if(rows.length!==TARGETS.size)throw new Error("missing targets "+rows.length);
fs.writeFileSync(path.join(__dirname,"master-high-types-p3-shadow-audit-results.json"),JSON.stringify({schema:"master-high-types-p3-shadow-audit-v1",rows},null,2)+"\n");

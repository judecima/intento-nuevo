"use strict";
const crypto=require("node:crypto"),fs=require("node:fs"),path=require("node:path");
const REPO=path.resolve(__dirname,"../../..");
const CANONICAL=path.join(REPO,"experiencia/canonical_cases.json");
const TARGETS=[["4059488__Cristian_Bernaldez4059488.xml",10],["4060962__Cristian Reynoso_Reynoso4060962.xml",74]];
const MODES=["legacy","v2","v3","nocache"];

process.env.OPTIMIZER_RUST_MASTER_ROUND_REUSE_EXPERIMENTAL="0";
process.env.OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL="0";
process.env.OPTIMIZER_POST_COMPACT_CHEAP_LB_EXPERIMENTAL="0";
process.env.OPTIMIZER_DFF_FS0_LB_EXPERIMENTAL="0";
process.env.OPTIMIZER_MASTER_UNIQUE_MASKS_LE4_EXPERIMENTAL="0";
process.env.OPTIMIZER_BASELINE_MULTISLICE_PACKING_REUSE_EXPERIMENTAL="0";

function j(f){return JSON.parse(fs.readFileSync(f,"utf8"));}
function unwrap(r){if(Array.isArray(r))return r;for(const k of ["cases","records","canonical_cases","canonicalCases","data"])if(Array.isArray(r?.[k]))return r[k];throw new Error("corpus");}
function root(e){return e?.case??e?.canonical??e?.optimization_case??e?.optimizationCase??e;}
function ord(v){const m=String(v||"").replace(/\.xml$/i,"").match(/\d+/g);if(!m)return Infinity;const x=m[m.length-1];return Number(x.length>7?x.slice(-7):x);}
function names(e){const r=root(e);return[e?.file,e?.file_name,e?.fileName,e?.source_file,e?.sourceFile,e?.case_id,e?.caseId,e?.name,e?.id,r?.file,r?.file_name,r?.fileName,r?.source_file,r?.sourceFile,r?.case_id,r?.caseId,r?.name,r?.id].filter(v=>typeof v==="string"&&v.length);}
function count(e){const r=root(e);if(!Array.isArray(r?.pieces))return null;return r.pieces.reduce((s,p)=>s+Number(p.quantity??p.cant??1),0);}
function index(entries){const m=new Map();for(const e of entries){for(const o of new Set(names(e).map(ord).filter(Number.isFinite))){if(!m.has(o))m.set(o,[]);m.get(o).push(e);}}return m;}
function num(...xs){for(const x of xs){const n=Number(x);if(Number.isFinite(n))return n;}return null;}
function prob(e,file){const r=root(e);const width=num(r.panel?.width,r.stock_width,r.stockWidth,r.board_width,r.boardWidth),height=num(r.panel?.height,r.stock_height,r.stockHeight,r.board_height,r.boardHeight),saw=num(r.kerf,r.saw,r.sierra,4.5),trimX=num(r.trim?.x,r.trim_x,r.trimX,r.refiladoX,0),trimY=num(r.trim?.y,r.trim_y,r.trimY,r.refiladoY,0),directional=r.material?.hasGrain===true||Boolean(r.directional??r.directional_input??r.materialConVeta??r.has_grain)||r.pieces.some(p=>p.grain===true||p.veta===true||p.rotationAllowed===false);const pieces=r.pieces.map((p,i)=>({base:num(p.base,p.width),altura:num(p.altura,p.height),cant:num(p.cant,p.quantity,1),veta:Boolean(p.veta??p.grain??(p.rotationAllowed===false)),ref:p.ref??p.reference??i,detalle:p.detalle??p.description??""}));return{file,width,height,saw,trimX,trimY,directional,pieces};}
function digest(plan){const b=(plan?.placas??[]).map(x=>({p:(x.colocadas??[]).map(p=>[p?.pieza?.ref,p.base,p.altura,p.x,p.y,Boolean(p.rotada),p.nivel??0]),c:(x.cortes??[]).map(c=>[c.x1,c.y1,c.x2,c.y2,c.nivel??0,Boolean(c.terminal)]),r:(x.restos??[]).map(r=>[r.x,r.y,r.w,r.h])}));return crypto.createHash("sha256").update(JSON.stringify(b)).digest("hex");}
function run(p,expected,mode){
 const {optimizarV10,nuevasMetricas,validarPlanIndustrial}=require(path.join(REPO,"src/lib/optimizer/legacy/v10.cjs"));
 process.env.OPTIMIZER_PACKING_CACHE_KEY_V2_EXPERIMENTAL=mode==="v2"?"1":"0";
 process.env.OPTIMIZER_PACKING_CACHE_KEY_V3_EXPERIMENTAL=mode==="v3"?"1":"0";
 const lines=p.pieces.map((x,i)=>({base:x.base,altura:x.altura,cant:x.cant,veta:Boolean(p.directional)&&Boolean(x.veta),ref:x.ref??i,detalle:x.detalle}));
 const cfg={placaBase:p.width,placaAltura:p.height,refiladoX:p.trimX,refiladoY:p.trimY,sierra:p.saw,etapas:4,materialConVeta:Boolean(p.directional),descontarCanto:false,cantoEspesor:0,restoMin:250,restoMax:400,usarOneBoard:true,usarMaster:true,usarMultiSlice:true,usarCompactacion:true,usarRustPatternGenerator:true,usarCache:mode!=="nocache",maxPiezasCache:mode!=="nocache"?160:0,rondasPatrones:40,msMaster:8000,usarCotaBarataPostCompactacion:true,usarDffFs0PostCompactacion:true,usarMascarasUnicasMasterLe4:true};
 const t0=process.hrtime.bigint();let res=null,err=null;try{res=optimizarV10(lines,cfg,nuevasMetricas());}catch(e){err=String(e?.stack||e?.message||e);}
 const ms=Number(process.hrtime.bigint()-t0)/1e6,plan=res?.plan??null,v=plan?validarPlanIndustrial(plan,expected):{ok:false};
 return{mode,ok:!err&&Boolean(v?.ok),boards:plan?.resumen?.placas??null,ms,digest:plan?digest(plan):null,cacheHits:plan?.resumen?.cacheHits??0,error:err};
}
const entries=unwrap(j(CANONICAL)),idx=index(entries),rows=[];
for(let i=0;i<TARGETS.length;i++){
 const [file,pieces]=TARGETS[i],matches=(idx.get(ord(file))||[]).filter(e=>count(e)===pieces);
 if(matches.length!==1)throw new Error(file+" exact="+matches.length);
 const p=prob(matches[0],file),row={file,pieces};
 const perms=[["legacy","v2","v3","nocache"],["nocache","v3","v2","legacy"]];
 for(const m of perms[i])row[m]=run(p,pieces,m);
 rows.push(row);
}
const out={rows,summary:rows.map(r=>({file:r.file,legacyEq:r.legacy.digest===r.nocache.digest,v2Eq:r.v2.digest===r.nocache.digest,v3Eq:r.v3.digest===r.nocache.digest,boards:[r.legacy.boards,r.v2.boards,r.v3.boards,r.nocache.boards],ms:[r.legacy.ms,r.v2.ms,r.v3.ms,r.nocache.ms],hits:[r.legacy.cacheHits,r.v2.cacheHits,r.v3.cacheHits]}))};
fs.writeFileSync(path.join(__dirname,"cache-key-v3-targeted-results.json"),JSON.stringify(out,null,2)+"\n");
console.log("CACHE_KEY_V3_TARGETED "+JSON.stringify(out));
if(rows.some(r=>!r.v3.ok||r.v3.digest!==r.nocache.digest||r.v3.boards!==r.nocache.boards))throw new Error("V3 targeted correctness failed");

"use strict";

const crypto=require("node:crypto");
const fs=require("node:fs");
const path=require("node:path");
const {spawnSync}=require("node:child_process");

const REPO=path.resolve(__dirname,"../../..");
const OUT=__dirname;
const CANONICAL=path.join(REPO,"experiencia/canonical_cases.json");
const TARGETS=[
 ["4059795__diego_primo4059795.xml",950],
 ["4061546__Fer_LIg4061546.xml",109],
 ["4059352__victor_moneta4059352.xml",430],
 ["4055118__federico_mercado4055118.xml",238],
 ["4052458__Hernan_Giufrida4052458.xml",293],
 ["4059306__ALEJANDRA_RUIZ4059306.xml",56],
];
const mode=process.argv[2]||"all";

if(mode==="all"){
 for(const m of ["explicit","env"]) runChild(m);
 report();
}else if(mode==="explicit"||mode==="env") runMode(mode);
else if(mode==="report") report();
else throw new Error("mode all|explicit|env|report");

function runChild(m){
 const env={...process.env,
  OPTIMIZER_MULTISLICE_ENVELOPE_200_500_EXPERIMENTAL:m==="env"?"1":"0",
  OPTIMIZER_RUST_MASTER_ROUND_REUSE_EXPERIMENTAL:"0",
  RUST_LEGACY_DEBUG_ERRORS:"1",
 };
 const r=spawnSync(process.execPath,[__filename,m],{cwd:REPO,stdio:"inherit",env});
 if(r.status!==0)throw new Error(m+" failed "+r.status);
}
function loadJson(f){return JSON.parse(fs.readFileSync(f,"utf8"));}
function unwrap(raw){if(Array.isArray(raw))return raw;for(const k of ["cases","records","canonical_cases","canonicalCases","data"])if(Array.isArray(raw?.[k]))return raw[k];throw new Error("bad corpus");}
function root(e){return e?.case??e?.canonical??e?.optimization_case??e?.optimizationCase??e;}
function orderNumber(v){const runs=String(v||"").replace(/\.xml$/i,"").match(/\d+/g);if(!runs)return Infinity;const last=runs[runs.length-1];return Number(last.length>7?last.slice(-7):last);}
function names(e){const r=root(e);return[e?.file,e?.file_name,e?.fileName,e?.source_file,e?.sourceFile,e?.case_id,e?.caseId,e?.name,e?.id,r?.file,r?.file_name,r?.fileName,r?.source_file,r?.sourceFile,r?.case_id,r?.caseId,r?.name,r?.id].filter(v=>typeof v==="string"&&v.length);}
function countPieces(e){const r=root(e);let s=0;if(!Array.isArray(r?.pieces))return null;for(const p of r.pieces){const q=Number(p.quantity??p.cant??1);if(!(q>0))return null;s+=q;}return s;}
function indexCorpus(entries){const m=new Map();for(const e of entries){const os=new Set(names(e).map(orderNumber).filter(Number.isFinite));for(const o of os){if(!m.has(o))m.set(o,[]);m.get(o).push(e);}}return m;}
function resolve(idx,file,pieces){const ex=(idx.get(orderNumber(file))||[]).filter(e=>countPieces(e)===pieces);if(ex.length!==1)throw new Error(file+" exact="+ex.length);return ex[0];}
function num(...xs){for(const x of xs){const n=Number(x);if(Number.isFinite(n))return n;}return null;}
function problem(e){const r=root(e);const width=num(r.panel?.width,r.stock_width,r.stockWidth,r.board_width,r.boardWidth),height=num(r.panel?.height,r.stock_height,r.stockHeight,r.board_height,r.boardHeight);const saw=num(r.kerf,r.saw,r.sierra,4.5),trimX=num(r.trim?.x,r.trim_x,r.trimX,r.refiladoX,0),trimY=num(r.trim?.y,r.trim_y,r.trimY,r.refiladoY,0);const directional=r.material?.hasGrain===true||Boolean(r.directional??r.materialConVeta??r.has_grain)||r.pieces.some(p=>p.grain===true||p.veta===true||p.rotationAllowed===false);const pieces=r.pieces.map((p,i)=>({base:num(p.base,p.width),altura:num(p.altura,p.height),cant:num(p.cant,p.quantity,1),veta:Boolean(p.veta??p.grain??(p.rotationAllowed===false)),ref:p.ref??p.reference??i,detalle:p.detalle??p.description??""}));return{width,height,saw,trimX,trimY,directional,pieces};}
function digest(plan){const boards=(plan?.placas??[]).map(b=>({p:(b.colocadas??[]).map(p=>[p?.pieza?.ref,p.base,p.altura,p.x,p.y,Boolean(p.rotada),p.nivel??0]),c:(b.cortes??[]).map(c=>[c.x1,c.y1,c.x2,c.y2,c.nivel??0,Boolean(c.terminal)]),r:(b.restos??[]).map(r=>[r.x,r.y,r.w,r.h])}));return crypto.createHash("sha256").update(JSON.stringify(boards)).digest("hex");}
function configFor(p,m){const total=p.pieces.reduce((s,x)=>s+x.cant,0),cacheLimit=total<=160?160:0;return{placaBase:p.width,placaAltura:p.height,refiladoX:p.trimX,refiladoY:p.trimY,sierra:p.saw,etapas:4,materialConVeta:Boolean(p.directional),descontarCanto:false,cantoEspesor:0,restoMin:250,restoMax:400,usarOneBoard:true,usarMaster:true,usarMultiSlice:true,usarCompactacion:true,usarRustPatternGenerator:true,usarCache:cacheLimit>0,maxPiezasCache:cacheLimit,rondasPatrones:40,msMaster:8000,usarCotaBarataPostCompactacion:true,usarDffFs0PostCompactacion:true,usarMascarasUnicasMasterLe4:true,...(m==="explicit"?{minPiezasMultiSliceExperimental:200,maxPiezasMultiSliceExperimental:500}:{})};}
function runMode(m){
 const {optimizarV10,nuevasMetricas,validarPlanIndustrial}=require(path.join(REPO,"src/lib/optimizer/legacy/v10.cjs"));
 const idx=indexCorpus(unwrap(loadJson(CANONICAL))),rows=[];
 for(const [file,expected] of TARGETS){
  const p=problem(resolve(idx,file,expected)),cfg=configFor(p,m),lines=p.pieces.map((x,i)=>({base:x.base,altura:x.altura,cant:x.cant,veta:Boolean(p.directional)&&Boolean(x.veta),ref:x.ref??i,detalle:x.detalle}));
  const t0=process.hrtime.bigint();const result=optimizarV10(lines,cfg,nuevasMetricas());const ms=Number(process.hrtime.bigint()-t0)/1e6;const plan=result.plan,val=validarPlanIndustrial(plan,expected);
  rows.push({file,pieces:expected,ok:Boolean(val?.ok),boards:plan?.resumen?.placas,digest:digest(plan),elapsedMs:ms,multiActivations:result?.metricas?.multislice?.activaciones||0,multiMs:result?.metricas?.multislice?.ms||0});
 }
 fs.writeFileSync(path.join(OUT,"envelope-integration-"+m+".json"),JSON.stringify({mode:m,rows},null,2)+"\n");
}
function report(){
 const a=loadJson(path.join(OUT,"envelope-integration-explicit.json")).rows,b=loadJson(path.join(OUT,"envelope-integration-env.json")).rows;
 const bm=new Map(b.map(x=>[x.file,x]));const diffs=[];
 for(const x of a){const y=bm.get(x.file);if(!y||!x.ok||!y.ok||x.boards!==y.boards||x.digest!==y.digest||x.multiActivations!==y.multiActivations)diffs.push({file:x.file,explicit:x,env:y});}
 const result={schema:"optimizer-multislice-envelope-env-parity-v1",cases:a.length,diffs:diffs.length,rows:a.map(x=>({file:x.file,pieces:x.pieces,explicitBoards:x.boards,envBoards:bm.get(x.file)?.boards,explicitMulti:x.multiActivations,envMulti:bm.get(x.file)?.multiActivations,digestEqual:x.digest===bm.get(x.file)?.digest}))};
 fs.writeFileSync(path.join(OUT,"envelope-integration-results.json"),JSON.stringify(result,null,2)+"\n");
 console.log("ENVELOPE_ENV_PARITY "+JSON.stringify(result));
 if(diffs.length)throw new Error("env parity diffs="+diffs.length);
}

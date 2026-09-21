"use strict";

const crypto=require("node:crypto");
const fs=require("node:fs");
const path=require("node:path");
const {spawnSync}=require("node:child_process");

const REPO=path.resolve(__dirname,"../../..");
const OUT=__dirname;
const CORPUS=path.join(REPO,"experiencia/canonical_cases.json");

const TARGETS=[
  ["4050594__Mega_Maderas4050594.xml",103],
  ["4059776__diego_primo4059776.xml",142],
  ["4060603__JACOB_LIMON4060603.xml",85],
];

const mode=process.argv[2]||"all";
const fileArg=process.argv[3]||null;
if(mode==="all") parent();
else if(mode==="case") child(fileArg,process.argv[4]==="candidate");
else throw new Error("mode all|case");

function load(){const raw=JSON.parse(fs.readFileSync(CORPUS,"utf8"));return Array.isArray(raw)?raw:(raw.cases||raw.records||raw.canonical_cases||raw.canonicalCases||raw.data||[]);}
function root(e){return e?.case??e?.canonical??e?.optimization_case??e?.optimizationCase??e;}
function orderNumber(v){const runs=String(v||"").replace(/\.xml$/i,"").match(/\d+/g);if(!runs)return Infinity;const last=runs.at(-1);return Number(last.length>7?last.slice(-7):last);}
function strings(e){const r=root(e);return [e?.file,e?.file_name,e?.fileName,e?.source_file,e?.sourceFile,e?.case_id,e?.caseId,e?.name,e?.id,r?.file,r?.file_name,r?.fileName,r?.source_file,r?.sourceFile,r?.case_id,r?.caseId,r?.name,r?.id].filter(v=>typeof v==="string");}
function countPieces(e){const r=root(e);if(!Array.isArray(r?.pieces))return null;return r.pieces.reduce((s,p)=>s+Number(p.quantity??p.cant??1),0);}
function resolve(file,pieces){
 const order=orderNumber(file),cs=load().filter(e=>strings(e).some(s=>orderNumber(s)===order));
 const ex=cs.filter(e=>countPieces(e)===pieces);
 if(ex.length!==1)throw new Error(file+": exact match candidates="+cs.length+" exact="+ex.length+" counts="+cs.map(countPieces).join(","));
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
 return {file,width,height,saw,trimX,trimY,directional,pieces};
}
function boardDigest(b){
 return {
  p:(b?.colocadas||[]).map(p=>[p?.pieza?.ref,p.base,p.altura,p.x,p.y,Boolean(p.rotada),p.nivel??0]),
  c:(b?.cortes||[]).map(c=>[c.x1,c.y1,c.x2,c.y2,c.nivel??0,Boolean(c.terminal)]),
  r:(b?.restos||[]).map(r=>[r.x,r.y,r.w,r.h]),
 };
}
function patternDigest(pool){
 const norm=pool.map(p=>({
  uso:[...p.uso.entries()].sort((a,b)=>a[0]-b[0]),
  area:p.area,
  placa:boardDigest(p.placa),
 }));
 return crypto.createHash("sha256").update(JSON.stringify(norm)).digest("hex");
}
function config(p){
 return {
  placaBase:p.width,placaAltura:p.height,refiladoX:p.trimX,refiladoY:p.trimY,sierra:p.saw,etapas:4,
  materialConVeta:Boolean(p.directional),descontarCanto:false,cantoEspesor:0,restoMin:250,restoMax:400,
  usarRustPatternGenerator:true,rondasPatrones:40,
  usarMascarasUnicasMasterLe4:true,
  // Keep the current 40-round contract; this experiment changes only reuse
  // of values already derived for an identical Beam state.
 };
}
function child(file,candidate){
 const target=TARGETS.find(x=>x[0]===file);if(!target)throw new Error("unknown target "+file);
 delete process.env.OPTIMIZER_RUST_BEAM_DERIVED_METRICS_EXPERIMENTAL;
 process.env.OPTIMIZER_RUST_BEAM_RANK_CACHE_EXPERIMENTAL="1";
 if(candidate) process.env.OPTIMIZER_RUST_LEAN_BEAM_EXPERIMENTAL="1";
 else delete process.env.OPTIMIZER_RUST_LEAN_BEAM_EXPERIMENTAL;
 const {generarPatrones}=require(path.join(REPO,"src/lib/optimizer/legacy/patrones.cjs"));
 const p=problem(resolve(file,target[1]),file),cfg=config(p);
 const t0=process.hrtime.bigint();
 const pool=generarPatrones(p.pieces,cfg,40,7);
 const ms=Number(process.hrtime.bigint()-t0)/1e6;
 const row={file,pieces:target[1],mode:candidate?"candidate":"control",ms,poolSize:pool.length,digest:patternDigest(pool),rust:cfg._rustPatternGeneratorUsed||null,fallback:Boolean(cfg._rustPatternGeneratorFallback),roundPolicy:cfg._patternMaskPolicy||null};
 process.stdout.write("RESULT "+JSON.stringify(row)+"\n");
}
function run(file,candidate){
 const env={...process.env,RUST_LEGACY_DEBUG_ERRORS:"1",OPTIMIZER_RUST_MASTER_ROUND_REUSE_EXPERIMENTAL:"0"};
 const r=spawnSync(process.execPath,[__filename,"case",file,candidate?"candidate":"control"],{cwd:REPO,env,encoding:"utf8",maxBuffer:20*1024*1024});
 if(r.status!==0)throw new Error(file+" "+(candidate?"candidate":"control")+" failed\n"+r.stdout+"\n"+r.stderr);
 const line=r.stdout.split(/\r?\n/).find(x=>x.startsWith("RESULT "));
 if(!line)throw new Error("missing RESULT "+file);
 return JSON.parse(line.slice(7));
}
function pct(a,b){return a?+(100*(a-b)/a).toFixed(2):0;}
function parent(){
 const rows=[];
 for(let i=0;i<TARGETS.length;i++){
  const file=TARGETS[i][0],order=i%2===0?[false,true]:[true,false],pair={file,order:order.map(x=>x?"candidate":"control")};
  for(const candidate of order)pair[candidate?"candidate":"control"]=run(file,candidate);
  pair.speedupPct=pct(pair.control.ms,pair.candidate.ms);
  pair.poolParity=pair.control.digest===pair.candidate.digest&&pair.control.poolSize===pair.candidate.poolSize;
  rows.push(pair);
  console.log(file+" control="+pair.control.ms.toFixed(1)+" candidate="+pair.candidate.ms.toFixed(1)+" speedup="+pair.speedupPct+"% parity="+pair.poolParity);
 }
 const control=rows.reduce((s,r)=>s+r.control.ms,0),candidate=rows.reduce((s,r)=>s+r.candidate.ms,0);
 const result={schema:"master-40-round-lean-beam-v1",rounds:40,rows,summary:{controlMs:+control.toFixed(2),candidateMs:+candidate.toFixed(2),speedupPct:pct(control,candidate),poolParity:rows.every(r=>r.poolParity)}};
 fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(path.join(OUT,"lean-beam-results.json"),JSON.stringify(result,null,2)+"\n");
 console.log("MASTER40_LEAN_BEAM "+JSON.stringify(result));
 if(!result.summary.poolParity)throw new Error("pool parity failed");
}

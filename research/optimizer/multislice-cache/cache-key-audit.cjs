"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const REPO = path.resolve(__dirname, "../../..");
const OUT = __dirname;
const CANONICAL = path.join(REPO, "experiencia/canonical_cases.json");

const TARGETS = [
  ["4059795__diego_primo4059795.xml", 950],
  ["4060603__JACOB_LIMON4060603.xml", 85],
  ["4061546__Fer_LIg4061546.xml", 109],
  ["4059352__victor_moneta4059352.xml", 430],
  ["4061518__Fer_LIg4061518.xml", 105],
  ["4061468__BEATRIZ ADRIANA_SILVA VARGAS4061468.xml", 98],
  ["4059224__Mega_Maderas4059224.xml", 134],
  ["4061358__BEATRIZ ADRIANA_SILVA VARGAS4061358.xml", 73],
  ["4060810__Dinorah_Contreras4060810.xml", 96],
  ["4059776__diego_primo4059776.xml", 142],
  ["4060221__JUAN_FEMATT4060221.xml", 88],
  ["4061048__LUIS ALFREDO_MARTINEZ SANCHEZ4061048.xml", 58],
  ["4060002__Adrian_SEIF4060002.xml", 88],
  ["4060963__alexandra_de la fuente hernandez4060963.xml", 73],
  ["4061112__Ana Medina_Ana Medina4061112.xml", 219],
  ["4060025__Fer_LIg4060025.xml", 143],
  ["4061529__Silvio_Barraza4061529.xml", 182],
  ["4061281__ALFREDO_CELESTINO4061281.xml", 48],
  ["4059306__ALEJANDRA_RUIZ4059306.xml", 56],
  ["4059222__Mega_Maderas4059222.xml", 79],
  // Historical MultiSlice wins: mandatory sentinels for any later reuse work.
  ["4055118__federico_mercado4055118.xml", 238],
  ["4052458__Hernan_Giufrida4052458.xml", 293],
  // 4057583 and 4060345 are known historical MultiSlice wins, but their
  // historical file-level piece counts do not map uniquely to the canonical
  // per-material corpus. They remain external sentinels and are intentionally
  // excluded here rather than guessed.
];

const MODES = new Set(["legacy", "v2", "nocache"]);
const mode = process.argv[2] || "all";

if (mode === "all") {
  for (const m of MODES) runChild(m);
  report();
} else if (MODES.has(mode)) {
  runMode(mode);
} else if (mode === "report") {
  report();
} else {
  throw new Error("mode must be all|legacy|v2|nocache|report");
}

function runChild(m) {
  const env = {
    ...process.env,
    OPTIMIZER_RUST_MASTER_ROUND_REUSE_EXPERIMENTAL: "0",
    OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL: "0",
    OPTIMIZER_POST_COMPACT_CHEAP_LB_EXPERIMENTAL: "0",
    OPTIMIZER_DFF_FS0_LB_EXPERIMENTAL: "0",
    OPTIMIZER_MASTER_UNIQUE_MASKS_LE4_EXPERIMENTAL: "0",
    OPTIMIZER_PACKING_CACHE_KEY_V2_EXPERIMENTAL: m === "v2" ? "1" : "0",
    RUST_LEGACY_DEBUG_ERRORS: "1",
  };
  const r = spawnSync(process.execPath, [__filename, m], { cwd: REPO, stdio: "inherit", env });
  if (r.status !== 0) throw new Error(m + " failed with " + r.status);
}

function loadJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function unwrapCorpus(raw) {
  if (Array.isArray(raw)) return raw;
  for (const key of ["cases","records","canonical_cases","canonicalCases","data"])
    if (Array.isArray(raw?.[key])) return raw[key];
  throw new Error("Unsupported canonical corpus");
}
function rootOf(e) { return e?.case ?? e?.canonical ?? e?.optimization_case ?? e?.optimizationCase ?? e; }
function orderNumber(value) {
  const stem=String(value||"").replace(/\.xml$/i,"");
  const runs=stem.match(/\d+/g);
  if(!runs) return Number.POSITIVE_INFINITY;
  const last=runs[runs.length-1];
  return Number(last.length>7?last.slice(-7):last);
}
function stringsForEntry(e) {
  const r=rootOf(e);
  return [
    e?.file,e?.file_name,e?.fileName,e?.source_file,e?.sourceFile,e?.case_id,e?.caseId,e?.name,e?.id,
    r?.file,r?.file_name,r?.fileName,r?.source_file,r?.sourceFile,r?.case_id,r?.caseId,r?.name,r?.id,
  ].filter(v=>typeof v==="string"&&v.length);
}
function countPieces(e) {
  const r=rootOf(e);
  if(!Array.isArray(r?.pieces)) return null;
  let sum=0;
  for(const p of r.pieces){
    const q=Number(p.quantity??p.cant??1);
    if(!Number.isFinite(q)||q<=0) return null;
    sum+=q;
  }
  return sum;
}
function buildIndex(entries) {
  const byOrder=new Map();
  for(const e of entries){
    const orders=new Set(stringsForEntry(e).map(orderNumber).filter(Number.isFinite));
    const explicit=Number(e?.order??rootOf(e)?.order);
    if(Number.isFinite(explicit)) orders.add(explicit);
    for(const o of orders){
      if(!byOrder.has(o)) byOrder.set(o,[]);
      byOrder.get(o).push(e);
    }
  }
  return byOrder;
}
function resolveExact(byOrder,file,pieces){
  const candidates=byOrder.get(orderNumber(file))||[];
  const exact=candidates.filter(e=>countPieces(e)===pieces);
  if(exact.length!==1)
    throw new Error(file+": exact canonical match failed, candidates="+candidates.length+", exact="+exact.length);
  return exact[0];
}
function firstNumber(...xs){ for(const x of xs){const n=Number(x);if(Number.isFinite(n))return n;} return null; }
function toProblem(entry,file){
  const r=rootOf(entry);
  const width=firstNumber(r.panel?.width,r.stock_width,r.stockWidth,r.board_width,r.boardWidth);
  const height=firstNumber(r.panel?.height,r.stock_height,r.stockHeight,r.board_height,r.boardHeight);
  const saw=firstNumber(r.kerf,r.saw,r.sierra,4.5);
  const trimX=firstNumber(r.trim?.x,r.trim_x,r.trimX,r.refiladoX,0);
  const trimY=firstNumber(r.trim?.y,r.trim_y,r.trimY,r.refiladoY,0);
  const directional=r.material?.hasGrain===true ||
    Boolean(r.directional??r.directional_input??r.materialConVeta??r.has_grain) ||
    r.pieces.some(p=>p.grain===true||p.veta===true||p.rotationAllowed===false);
  const pieces=r.pieces.map((p,i)=>({
    base:firstNumber(p.base,p.width), altura:firstNumber(p.altura,p.height),
    cant:firstNumber(p.cant,p.quantity,1), veta:Boolean(p.veta??p.grain??(p.rotationAllowed===false)),
    ref:p.ref??p.reference??i, detalle:p.detalle??p.description??"",
  }));
  if(!(width>0)||!(height>0)||pieces.some(p=>!(p.base>0)||!(p.altura>0)||!(p.cant>0)))
    throw new Error(file+": invalid canonical geometry");
  return {file,width,height,saw,trimX,trimY,directional,pieces};
}
function digestBoard(board){
  return {
    placements:(board?.colocadas??[]).map(p=>[p?.pieza?.ref,p.base,p.altura,p.x,p.y,Boolean(p.rotada),p.nivel??0]),
    cuts:(board?.cortes??[]).map(c=>[c.x1,c.y1,c.x2,c.y2,c.nivel??0,Boolean(c.terminal)]),
    remnants:(board?.restos??[]).map(r=>[r.x,r.y,r.w,r.h]),
  };
}
function planDigest(plan){
  return crypto.createHash("sha256").update(JSON.stringify((plan?.placas??[]).map(digestBoard))).digest("hex");
}
function configFor(problem, m){
  const total=problem.pieces.reduce((s,p)=>s+p.cant,0);
  const cacheEnabled = m !== "nocache" && total <= 160;
  return {
    placaBase:problem.width, placaAltura:problem.height,
    refiladoX:problem.trimX, refiladoY:problem.trimY, sierra:problem.saw,
    etapas:4, materialConVeta:Boolean(problem.directional),
    descontarCanto:false,cantoEspesor:0,restoMin:250,restoMax:400,
    usarOneBoard:true,usarMaster:true,usarMultiSlice:true,usarCompactacion:true,
    usarRustPatternGenerator:true,
    usarCache:cacheEnabled,maxPiezasCache:cacheEnabled?160:0,
    rondasPatrones:40,msMaster:8000,
    usarCotaBarataPostCompactacion:true,
    usarDffFs0PostCompactacion:true,
    usarMascarasUnicasMasterLe4:true,
  };
}
function runMode(m){
  const {optimizarV10,nuevasMetricas,validarPlanIndustrial}=require(path.join(REPO,"src/lib/optimizer/legacy/v10.cjs"));
  const {calidadPlanPlacas}=require(path.join(REPO,"src/lib/optimizer/legacy/motor.cjs"));
  const entries=unwrapCorpus(loadJson(CANONICAL));
  const byOrder=buildIndex(entries);
  const rows=[];
  for(let i=0;i<TARGETS.length;i++){
    const [file,expected]=TARGETS[i];
    const problem=toProblem(resolveExact(byOrder,file,expected),file);
    const lines=problem.pieces.map((p,idx)=>({
      base:p.base,altura:p.altura,cant:p.cant,veta:Boolean(problem.directional)&&Boolean(p.veta),
      ref:p.ref??idx,detalle:p.detalle,
    }));
    const config=configFor(problem,m);
    const t0=process.hrtime.bigint();
    let result=null,error=null;
    try{ result=optimizarV10(lines,config,nuevasMetricas()); }
    catch(e){ error=String(e?.stack||e?.message||e).slice(0,1200); }
    const elapsedMs=Number(process.hrtime.bigint()-t0)/1e6;
    const plan=result?.plan??null;
    const validation=plan?validarPlanIndustrial(plan,expected):{ok:false};
    rows.push({
      file,expectedPieces:expected,types:lines.length,
      cacheEnabled:config.usarCache===true,
      ok:!error&&Boolean(validation?.ok),error,validationOk:Boolean(validation?.ok),
      boards:plan?.resumen?.placas??null,elapsedMs,
      digest:plan?planDigest(plan):null,
      quality:plan?calidadPlanPlacas(plan.placas,plan.opts||config):null,
      cacheHits:plan?.resumen?.cacheHits??null,
      cacheMisses:plan?.resumen?.cacheFallos??null,
      master:result?.metricas?.master??null,
      multislice:result?.metricas?.multislice??null,
      compactacion:result?.metricas?.compactacion??null,
      lowerBound:result?.metricas?.lowerBound??null,
    });
    console.log(m+" "+(i+1)+"/"+TARGETS.length+" "+file+
      " boards="+rows.at(-1).boards+" hits="+rows.at(-1).cacheHits+" ms="+elapsedMs.toFixed(1));
  }
  fs.writeFileSync(path.join(OUT,"cache-key-"+m+".json"),JSON.stringify({mode:m,rows},null,2)+"\n");
}
function compareQuality(a,b,compararCalidad){
  if(!a||!b) return null;
  return compararCalidad(a,b);
}
function report(){
  const {compararCalidad}=require(path.join(REPO,"src/lib/optimizer/legacy/motor.cjs"));
  const runs=Object.fromEntries([...MODES].map(m=>[m,loadJson(path.join(OUT,"cache-key-"+m+".json")).rows]));
  const maps=Object.fromEntries([...MODES].map(m=>[m,new Map(runs[m].map(r=>[r.file,r]))]));
  const perCase=[];
  let v2VsNoCacheDigest=0, legacyVsNoCacheDigest=0, legacyVsV2Digest=0;
  let v2BoardReg=0, legacyBoardReg=0, invalid=0;
  for(const [file] of TARGETS){
    const legacy=maps.legacy.get(file), v2=maps.v2.get(file), nocache=maps.nocache.get(file);
    if(!legacy?.ok||!v2?.ok||!nocache?.ok) invalid++;
    if(v2?.digest!==nocache?.digest) v2VsNoCacheDigest++;
    if(legacy?.digest!==nocache?.digest) legacyVsNoCacheDigest++;
    if(legacy?.digest!==v2?.digest) legacyVsV2Digest++;
    if(v2?.boards>nocache?.boards) v2BoardReg++;
    if(legacy?.boards>nocache?.boards) legacyBoardReg++;
    perCase.push({
      file,
      legacy:{boards:legacy?.boards,ms:+(legacy?.elapsedMs||0).toFixed(2),digest:legacy?.digest,cacheHits:legacy?.cacheHits,
              multiWins:legacy?.multislice?.ganancias||0,masterWins:legacy?.master?.ganancias||0},
      v2:{boards:v2?.boards,ms:+(v2?.elapsedMs||0).toFixed(2),digest:v2?.digest,cacheHits:v2?.cacheHits,
          multiWins:v2?.multislice?.ganancias||0,masterWins:v2?.master?.ganancias||0},
      nocache:{boards:nocache?.boards,ms:+(nocache?.elapsedMs||0).toFixed(2),digest:nocache?.digest,
               multiWins:nocache?.multislice?.ganancias||0,masterWins:nocache?.master?.ganancias||0},
      v2VsNoCacheQuality:compareQuality(v2?.quality,nocache?.quality,compararCalidad),
      legacyVsNoCacheQuality:compareQuality(legacy?.quality,nocache?.quality,compararCalidad),
    });
  }
  const sum=m=>({
    totalMs:+runs[m].reduce((s,r)=>s+(r.elapsedMs||0),0).toFixed(2),
    boards:runs[m].reduce((s,r)=>s+(r.boards||0),0),
    invalid:runs[m].filter(r=>!r.ok).length,
    cacheHits:runs[m].reduce((s,r)=>s+(r.cacheHits||0),0),
    multisliceWins:runs[m].reduce((s,r)=>s+(r.multislice?.ganancias||0),0),
    masterWins:runs[m].reduce((s,r)=>s+(r.master?.ganancias||0),0),
  });
  const result={
    schema:"optimizer-cache-key-audit-v1",
    generatedAt:new Date().toISOString(),
    summary:{legacy:sum("legacy"),v2:sum("v2"),nocache:sum("nocache")},
    comparisons:{invalid,v2VsNoCacheDigest,legacyVsNoCacheDigest,legacyVsV2Digest,v2BoardReg,legacyBoardReg},
    perCase,
  };
  fs.writeFileSync(path.join(OUT,"cache-key-audit-results.json"),JSON.stringify(result,null,2)+"\n");
  console.log("CACHE_KEY_AUDIT "+JSON.stringify(result));
  if(invalid) throw new Error("invalid cases="+invalid);
}

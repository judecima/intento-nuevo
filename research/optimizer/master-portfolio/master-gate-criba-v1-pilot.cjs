"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const ROOT = path.resolve(__dirname, "../../..");
const CANONICAL_PATH = path.join(ROOT, "experiencia/canonical_cases.json");
const MANIFEST_PATH = path.join(ROOT, "research/optimizer/master-portfolio/MASTER_ACTIVE_323_MANIFEST_2026-09-18.json");
const FIXTURE_4056900 = path.join(ROOT, "research/optimizer/pattern-generators/guide-slice/INDUSTRIAL_PORTFOLIO_4056900_CHECKPOINT_2026-09-14.json");
const OUT_DIR = path.join(ROOT, "research/optimizer/master-portfolio/out");
const OUT_PATH = path.join(OUT_DIR, "MASTER_GATE_CRIBA_V1_PILOT_2026-09-21.json");

const LEGACY = path.join(ROOT, "src/lib/optimizer/legacy");
const { optimizarV10, nuevasMetricas, validarPlanIndustrial } = require(path.join(LEGACY, "v10.cjs"));
const { generarPatrones, patronesMonotipo } = require(path.join(LEGACY, "patrones.cjs"));
const { resolverCobertura } = require(path.join(LEGACY, "cobertura.cjs"));
const { materializar } = require(path.join(LEGACY, "materializar.cjs"));

const TARGET_ELIGIBLE = Number(process.env.PILOT_TARGET_ELIGIBLE || 18);
const MAX_SCANNED = Number(process.env.PILOT_MAX_SCANNED || 70);
const MASTER_MS = Number(process.env.PILOT_MASTER_MS || 8000);
const MAX_PIECES = Number(process.env.PILOT_MAX_PIECES || 160);
const SKIP_KNOWN = /^(1|true|yes)$/i.test(String(process.env.PILOT_SKIP_KNOWN || ""));
const LONG_THIN_MAX = 0.1702127659574468;
const MULTIPLICITY_MAX = 30;

function boolTrue(v) {
  return v === true || v === 1 || v === "1" || v === "true" || v === "TRUE";
}
function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function basename(v) {
  return typeof v === "string" ? v.replaceAll("\\", "/").split("/").pop() : null;
}
function qty(p) {
  for (const k of ["quantity", "qty", "count", "cant", "num", "q", "qMin"]) {
    const n = Number(p?.[k]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 1;
}
function dims(p) {
  return { w: num(p?.width ?? p?.base ?? p?.l ?? p?.L), h: num(p?.height ?? p?.altura ?? p?.w ?? p?.W) };
}
function grainBlocking(row) {
  const fmt = String(row.source_format || "").toLowerCase();
  if (fmt === "project") return false;
  const ps = Array.isArray(row.pieces) ? row.pieces : [];
  if (ps.some(p => boolTrue(p?.xmlPartGrain) || boolTrue(p?.rawGrain) || boolTrue(p?.grain))) return true;
  return fmt === "order" ? boolTrue(row.directional) : false;
}
function features(row) {
  const ps = Array.isArray(row.pieces) ? row.pieces : [];
  const qs = ps.map(qty);
  const pieceCount = num(row.piece_count, qs.reduce((a,b)=>a+b,0));
  const typeCount = num(row.piece_types, ps.length);
  const multiplicityMean = typeCount ? pieceCount / typeCount : 0;
  const multiplicityMax = qs.length ? Math.max(...qs) : multiplicityMean;
  let longThinQty = 0;
  let totalArea = 0;
  let top1Qty = 0;
  const areas = [];
  const dimensionPieces = new Map();
  for (let i=0;i<ps.length;i++) {
    const q=qs[i], {w,h}=dims(ps[i]);
    const lo=Math.min(w,h), hi=Math.max(w,h);
    if (lo > 0 && hi / lo >= 4) longThinQty += q;
    const a=Math.max(0,w)*Math.max(0,h)*q;
    totalArea += a;
    areas.push(a);
    top1Qty=Math.max(top1Qty,q);
    for (const d of new Set([w.toFixed(3),h.toFixed(3)])) {
      dimensionPieces.set(d,(dimensionPieces.get(d)||0)+q);
    }
  }
  areas.sort((a,b)=>b-a);
  const maxDimPieces = dimensionPieces.size ? Math.max(...dimensionPieces.values()) : 0;
  return {
    file: basename(row.source_path || ((row.case_id||"")+".xml")),
    pieceCount,
    typeCount,
    multiplicityMean,
    multiplicityMax,
    top1QtyShare: pieceCount ? top1Qty/pieceCount : 0,
    top1AreaShare: totalArea ? (areas[0]||0)/totalArea : 0,
    top3AreaShare: totalArea ? areas.slice(0,3).reduce((a,b)=>a+b,0)/totalArea : 0,
    longThinPieceShare: pieceCount ? longThinQty/pieceCount : 0,
    maxSharedDimensionPieceShare: pieceCount ? maxDimPieces/pieceCount : 0,
    grainBlocking: grainBlocking(row),
  };
}
function gate(f) {
  return f.multiplicityMean >= 4.75 &&
    !f.grainBlocking &&
    f.longThinPieceShare <= LONG_THIN_MAX + 1e-12 &&
    f.multiplicityMax <= MULTIPLICITY_MAX;
}
function toLines(row) {
  const fmt = String(row.source_format || "").toLowerCase();
  return (row.pieces || []).map((p,i) => ({
    ref: String(i+1),
    detalle: String(i+1),
    cant: qty(p),
    base: dims(p).w,
    altura: dims(p).h,
    veta: fmt === "order" && (boolTrue(p?.xmlPartGrain) || boolTrue(p?.rawGrain) || boolTrue(p?.grain)),
    cantos: null,
  }));
}
function toConfig(row) {
  const fmt = String(row.source_format || "").toLowerCase();
  return {
    placaBase: num(row.stock_width, 2600),
    placaAltura: num(row.stock_height, 1830),
    refiladoX: 0,
    refiladoY: 0,
    sierra: num(row.saw, 4.5),
    etapas: 4,
    materialConVeta: fmt === "order" ? boolTrue(row.directional) : false,
    descontarCanto: false,
    cantoEspesor: 0,
    restoMin: 250,
    restoMax: 400,
    usarCache: true,
    maxPiezasCache: 160,
    usarCompactacion: true,
    usarMultiSlice: true,
    usarOneBoard: true,
    usarMaster: false,
    rondasPatrones: 40,
    msMaster: MASTER_MS,
  };
}
function validRow(row) {
  const f=features(row);
  return f.file && f.pieceCount > 0 && f.typeCount > 0 &&
    f.pieceCount <= MAX_PIECES &&
    num(row.stock_width) > 0 && num(row.stock_height) > 0 &&
    Array.isArray(row.pieces) && row.pieces.length > 0 &&
    row.pieces.every(p => dims(p).w > 0 && dims(p).h > 0 && qty(p) > 0);
}
const DIST_FEATURES = [
  "pieceCount","typeCount","multiplicityMean","multiplicityMax","top1QtyShare",
  "top1AreaShare","top3AreaShare","longThinPieceShare","maxSharedDimensionPieceShare",
];
function stats(rows) {
  const out={};
  for (const k of DIST_FEATURES) {
    const xs=rows.map(x=>x.f[k]).filter(Number.isFinite);
    const m=xs.reduce((a,b)=>a+b,0)/Math.max(1,xs.length);
    const sd=Math.sqrt(xs.reduce((s,x)=>s+(x-m)**2,0)/Math.max(1,xs.length))||1;
    out[k]={m,sd};
  }
  return out;
}
function dist(a,b,s) {
  let z=0;
  for (const k of DIST_FEATURES) z += ((a[k]-b[k])/s[k].sd)**2;
  return Math.sqrt(z/DIST_FEATURES.length);
}
function synthetic4056900() {
  const cp=JSON.parse(fs.readFileSync(FIXTURE_4056900,"utf8")).source;
  return {
    case_id:"4056900__Alfredo_Arrua4056900",
    source_path:cp.file,
    source_format:cp.format,
    stock_width:cp.board.width,
    stock_height:cp.board.height,
    saw:cp.board.kerf,
    directional:false,
    piece_count:cp.pieceQuantity,
    piece_types:cp.pieceTypes,
    pieces:cp.lines.map(x=>({base:x.width,altura:x.height,cant:x.quantity})),
    _syntheticFrozen:true,
  };
}
function runMasterOnly(row, label) {
  const f=features(row);
  const lines=toLines(row);
  const config=toConfig(row);
  const expected=lines.reduce((s,l)=>s+l.cant,0);

  const tPre=performance.now();
  let pre;
  try {
    pre=optimizarV10(lines,{...config,usarMaster:false},nuevasMetricas());
  } catch (e) {
    return {label,file:f.file,features:f,error:"pre:"+String(e?.message||e)};
  }
  const preMs=performance.now()-tPre;
  const prePlan=pre?.plan;
  const preBoards=prePlan?.resumen?.placas ?? null;
  const cota=pre?.cota ?? null;
  const preValid=prePlan ? validarPlanIndustrial(prePlan,expected) : null;
  const eligible=Number.isFinite(preBoards) && Number.isFinite(cota) && preBoards > cota;

  const rec={
    label,file:f.file,features:f,preMs,preBoards,cota,cotaArea:pre?.cotaArea ?? null,
    preValid:preValid?.ok ?? false,eligible,
    preMetrics:pre?.metricas ? {
      compactacion:pre.metricas.compactacion,
      multislice:pre.metricas.multislice,
      oneboard:pre.metricas.oneboard,
    } : null,
  };
  if (!eligible || !prePlan || !preValid?.ok) return rec;

  const tGen=performance.now();
  let pool;
  try {
    pool=generarPatrones(lines,config,40).concat(patronesMonotipo(lines,config));
  } catch (e) {
    return {...rec,masterError:"gen:"+String(e?.message||e),generationMs:performance.now()-tGen};
  }
  const generationMs=performance.now()-tGen;

  const areaPlaca=(config.placaBase-config.refiladoX)*(config.placaAltura-config.refiladoY);
  const tSolve=performance.now();
  let sol=null;
  try {
    const handle=resolverCobertura(
      pool,
      lines.map(l=>l.cant),
      areaPlaca,
      preBoards,
      MASTER_MS,
      { maxNodos: 1_600_000, watchdogMs: Math.max(12000,MASTER_MS+4000) },
    );
    sol=handle ? handle.resolver(lines.map(l=>l.base*l.altura)) : null;
  } catch (e) {
    return {...rec,poolSize:pool.length,generationMs,masterError:"solve:"+String(e?.message||e),solveMs:performance.now()-tSolve};
  }
  const solveMs=performance.now()-tSolve;

  let candidate=null,validation=null;
  if (sol?.plan) {
    try {
      candidate=materializar(sol.plan,lines,prePlan.opts);
      validation=candidate ? validarPlanIndustrial(candidate,expected) : null;
    } catch (e) {
      return {...rec,poolSize:pool.length,generationMs,solveMs,masterError:"materialize:"+String(e?.message||e)};
    }
  }
  const masterBoards=candidate?.resumen?.placas ?? sol?.placas ?? null;
  const win=Boolean(validation?.ok && Number.isFinite(masterBoards) && masterBoards < preBoards);
  return {
    ...rec,
    poolSize:pool.length,
    generationMs,
    solveMs,
    nodes:sol?.nodos ?? null,
    exhausted:sol?.agotado ?? null,
    masterBoards,
    masterValid:validation?.ok ?? false,
    win,
    boardsSaved:win ? preBoards-masterBoards : 0,
  };
}

function main() {
  const raw=JSON.parse(fs.readFileSync(CANONICAL_PATH,"utf8"));
  const manifest=JSON.parse(fs.readFileSync(MANIFEST_PATH,"utf8"));
  const labeled=new Set((manifest.cases||[]).map(x=>basename(x.file)));
  const rows=(Array.isArray(raw)?raw:raw.cases||[]).filter(validRow).map(row=>({row,f:features(row)}));
  const st=stats(rows);

  const byFile=new Map(rows.map(x=>[x.f.file,x]));
  const targets=[];
  for (const file of ["4050594__Mega_Maderas4050594.xml","4057401__GABRIEL_TUMBACO CRUZ4057401.xml"]) {
    const x=byFile.get(file); if (x) targets.push({name:file,f:x.f});
  }
  const syn=synthetic4056900();
  targets.push({name:"4056900-frozen",f:features(syn)});

  const candidateRows=rows.filter(x=>gate(x.f) && !labeled.has(x.f.file));
  for (const x of candidateRows) {
    x.distance=Math.min(...targets.map(t=>dist(x.f,t.f,st)));
    x.nearestTarget=targets.slice().sort((a,b)=>dist(x.f,a.f,st)-dist(x.f,b.f,st))[0]?.name ?? null;
  }
  candidateRows.sort((a,b)=>a.distance-b.distance || a.f.file.localeCompare(b.f.file));

  const records=[];
  const knownRows=[
    byFile.get("4050594__Mega_Maderas4050594.xml")?.row,
    byFile.get("4057401__GABRIEL_TUMBACO CRUZ4057401.xml")?.row,
    syn,
    byFile.get("4053911__Julian_Andrieu4053911.xml")?.row,
    byFile.get("4056355__Dinorah_Contreras4056355.xml")?.row,
  ].filter(Boolean);
  if (!SKIP_KNOWN) {
    for (const row of knownRows) {
      const order=(row.case_id||"").match(/4050594|4057401|4056900|4053911|4056355/)?.[0] || "known";
      console.log("KNOWN_START",order,features(row).file);
      const r=runMasterOnly(row,"known-"+order);
      records.push(r);
      console.log("KNOWN_DONE",JSON.stringify(r));
    }
  }

  let eligible=0, scanned=0;
  for (const x of candidateRows) {
    if (scanned>=MAX_SCANNED || eligible>=TARGET_ELIGIBLE) break;
    scanned++;
    console.log("PILOT_START",scanned,x.f.file,"d="+x.distance.toFixed(4),"target="+x.nearestTarget);
    const r=runMasterOnly(x.row,"neighbor");
    r.distance=x.distance;
    r.nearestTarget=x.nearestTarget;
    records.push(r);
    if (r.eligible) eligible++;
    console.log("PILOT_DONE",JSON.stringify({
      file:r.file,eligible:r.eligible,preBoards:r.preBoards,cota:r.cota,
      win:r.win,masterBoards:r.masterBoards,generationMs:r.generationMs,solveMs:r.solveMs,
      distance:r.distance,nearestTarget:r.nearestTarget,
    }));
  }

  const pilot=records.filter(r=>r.label==="neighbor");
  const elig=pilot.filter(r=>r.eligible);
  const wins=elig.filter(r=>r.win);
  const known=records.filter(r=>r.label?.startsWith("known-"));
  const summary={
    schema:"master-gate-criba-v1-pilot",
    generatedAt:new Date().toISOString(),
    config:{TARGET_ELIGIBLE,MAX_SCANNED,MASTER_MS,MAX_PIECES,SKIP_KNOWN,LONG_THIN_MAX,MULTIPLICITY_MAX},
    corpus:{validRows:rows.length,gateRows:rows.filter(x=>gate(x.f)).length,unlabeledGateRows:candidateRows.length},
    known:known.map(r=>({file:r.file,eligible:r.eligible,preBoards:r.preBoards,cota:r.cota,win:r.win,masterBoards:r.masterBoards,generationMs:r.generationMs,solveMs:r.solveMs,error:r.error||r.masterError||null})),
    pilot:{
      scanned,
      eligible:elig.length,
      ineligible:pilot.length-elig.length,
      wins:wins.length,
      winRateEligible:elig.length?wins.length/elig.length:null,
      boardsSaved:wins.reduce((s,r)=>s+(r.boardsSaved||0),0),
      generationMs:elig.reduce((s,r)=>s+(r.generationMs||0),0),
      solveMs:elig.reduce((s,r)=>s+(r.solveMs||0),0),
      winFiles:wins.map(r=>r.file),
    },
    records,
  };
  fs.mkdirSync(OUT_DIR,{recursive:true});
  fs.writeFileSync(OUT_PATH,JSON.stringify(summary,null,2)+"\n");
  console.log("PILOT_SUMMARY",JSON.stringify(summary.pilot));
  console.log("CORPUS_GATE",JSON.stringify(summary.corpus));
  console.log("OUT",path.relative(ROOT,OUT_PATH));
}
main();

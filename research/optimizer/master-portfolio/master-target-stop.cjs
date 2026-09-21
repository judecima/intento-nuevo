"use strict";

const fs=require("node:fs");
const path=require("node:path");
const {performance}=require("node:perf_hooks");

const ROOT=path.resolve(__dirname,"../../..");
const CANONICAL=path.join(ROOT,"experiencia/canonical_cases.json");
const MANIFEST=path.join(ROOT,"research/optimizer/master-portfolio/MASTER_ACTIVE_323_MANIFEST_2026-09-18.json");
const FIX4056900=path.join(ROOT,"research/optimizer/pattern-generators/guide-slice/INDUSTRIAL_PORTFOLIO_4056900_CHECKPOINT_2026-09-14.json");
const OUT_DIR=path.join(ROOT,"research/optimizer/master-portfolio/out");
const OUT=path.join(OUT_DIR,"MASTER_TARGET_STOP_2026-09-21.json");

const LEGACY=path.join(ROOT,"src/lib/optimizer/legacy");
const {optimizarV10,nuevasMetricas,validarPlanIndustrial}=require(path.join(LEGACY,"v10.cjs"));
const {patronesMonotipo}=require(path.join(LEGACY,"patrones.cjs"));
const {resolverCobertura}=require(path.join(LEGACY,"cobertura.cjs"));
const {materializar}=require(path.join(LEGACY,"materializar.cjs"));
const {calidadPlanPlacas,compararCalidad}=require(path.join(LEGACY,"motor.cjs"));
const {createIncrementalRustMasterGenerator}=require("./incremental-rust-master.cjs");

function num(v,f=0){const n=Number(v);return Number.isFinite(n)?n:f;}
function boolTrue(v){return v===true||v===1||v==="1"||v==="true"||v==="TRUE";}
function basename(v){return typeof v==="string"?v.replaceAll("\\","/").split("/").pop():null;}
function qty(p){for(const k of ["quantity","qty","count","cant","num","q","qMin"]){const n=Number(p?.[k]);if(Number.isFinite(n)&&n>0)return n;}return 1;}
function dims(p){return {w:num(p?.width??p?.base??p?.l??p?.L),h:num(p?.height??p?.altura??p?.w??p?.W)};}
function features(row){const ps=Array.isArray(row.pieces)?row.pieces:[];return {file:basename(row.source_path||((row.case_id||"")+".xml")),pieceCount:num(row.piece_count,ps.reduce((s,p)=>s+qty(p),0)),typeCount:num(row.piece_types,ps.length)};}
function toLines(row){const fmt=String(row.source_format||"").toLowerCase();return (row.pieces||[]).map((p,i)=>({ref:String(i+1),detalle:String(i+1),cant:qty(p),base:dims(p).w,altura:dims(p).h,veta:fmt==="order"&&(boolTrue(p?.xmlPartGrain)||boolTrue(p?.rawGrain)||boolTrue(p?.grain)),cantos:null}));}
function toConfig(row){const fmt=String(row.source_format||"").toLowerCase();return {placaBase:num(row.stock_width,2600),placaAltura:num(row.stock_height,1830),refiladoX:0,refiladoY:0,sierra:num(row.saw,4.5),etapas:4,materialConVeta:fmt==="order"?boolTrue(row.directional):false,descontarCanto:false,cantoEspesor:0,restoMin:250,restoMax:400,usarCache:true,maxPiezasCache:3000,usarCompactacion:true,usarMultiSlice:true,usarOneBoard:true,usarMaster:false,rondasPatrones:40,msMaster:8000};}
function synthetic4056900(){const cp=JSON.parse(fs.readFileSync(FIX4056900,"utf8")).source;return {case_id:"4056900__Alfredo_Arrua4056900",source_path:cp.file,source_format:cp.format,stock_width:cp.board.width,stock_height:cp.board.height,saw:cp.board.kerf,directional:false,piece_count:cp.pieceQuantity,piece_types:cp.pieceTypes,pieces:cp.lines.map(x=>({base:x.width,altura:x.height,cant:x.quantity}))};}
function synthetic4057401(){return {case_id:"4057401__GABRIEL_TUMBACO CRUZ4057401",source_path:"4057401__GABRIEL_TUMBACO CRUZ4057401.xml",source_format:"project",stock_width:2742,stock_height:1822,saw:4.5,directional:false,piece_count:19,piece_types:4,pieces:[{base:1800,altura:1050,cant:2},{base:2000,altura:1100,cant:2},{base:1900,altura:1500,cant:1},{base:744,altura:450,cant:14}]};}
function solve(pool,lines,area,incumbent,stopAtBoards){
  const t=performance.now();
  const h=resolverCobertura(pool,lines.map(l=>l.cant),area,incumbent,8000,{maxNodos:1600000,watchdogMs:12000,stopAtBoards});
  const sol=h?h.resolver(lines.map(l=>l.base*l.altura)):null;
  return {sol,ms:performance.now()-t};
}
function materializeSafe(sol,lines,prePlan,expected){
  if(!sol?.plan)return null;
  try{const plan=materializar(sol.plan,lines,prePlan.opts);const v=plan?validarPlanIndustrial(plan,expected):null;if(!v?.ok)return null;return {boards:plan.resumen.placas,quality:calidadPlanPlacas(plan.placas||[],plan.opts||prePlan.opts)};}catch(_){return null;}
}
function run(row,rounds){
  const lines=toLines(row),config=toConfig(row),expected=lines.reduce((s,l)=>s+num(l.cant),0);
  const pre=optimizarV10(lines,{...config,usarMaster:false},nuevasMetricas());
  const prePlan=pre.plan,area=(config.placaBase-config.refiladoX)*(config.placaAltura-config.refiladoY);
  const gen=createIncrementalRustMasterGenerator(lines,config,40,7);gen.execute(rounds);
  const pool=gen.patterns(rounds).concat(patronesMonotipo(lines,config));
  const a=solve(pool,lines,area,prePlan.resumen.placas,null);
  const b=solve(pool,lines,area,prePlan.resumen.placas,pre.cota);
  const ma=materializeSafe(a.sol,lines,prePlan,expected),mb=materializeSafe(b.sol,lines,prePlan,expected);
  const parity=!!ma&&!!mb&&ma.boards===mb.boards&&compararCalidad(mb.quality,ma.quality)===0;
  return {preBoards:prePlan.resumen.placas,cota:pre.cota,rounds,patterns:pool.length,
    baseline:{boards:ma?.boards??a.sol?.placas??null,ms:a.ms,nodes:a.sol?.nodos??null,exhausted:a.sol?.agotado??null},
    targetStop:{boards:mb?.boards??b.sol?.placas??null,ms:b.ms,nodes:b.sol?.nodos??null,exhausted:b.sol?.agotado??null,hit:b.sol?.objetivoAlcanzado??false},
    parity,nodeSavedPct:a.sol?.nodos?1-num(b.sol?.nodos)/num(a.sol?.nodos):null,timeSavedPct:a.ms?1-b.ms/a.ms:null};
}
function main(){
  const manifest=JSON.parse(fs.readFileSync(MANIFEST,"utf8"));
  const raw=JSON.parse(fs.readFileSync(CANONICAL,"utf8"));const all=Array.isArray(raw)?raw:raw.cases||[];
  const byFile=new Map(all.map(r=>[features(r).file,r]));
  const cases=[
    {order:4050594,row:byFile.get("4050594__Mega_Maderas4050594.xml"),rounds:[0,2,6]},
    {order:4056900,row:synthetic4056900(),rounds:[0,2,6,20,36,22]},
    {order:4057401,row:synthetic4057401(),rounds:[0,2,6]},
  ];
  const records=[];
  for(const x of cases){
    if(!x.row)continue;
    const rec=run(x.row,x.rounds);records.push({order:x.order,...rec});
    console.log("TARGET_STOP_CASE",JSON.stringify(records[records.length-1]));
  }
  const summary={schema:"master-target-stop-v1",generatedAt:new Date().toISOString(),records,
    pass:records.length>0&&records.every(r=>r.parity&&r.targetStop.hit),
    aggregate:{baselineMs:records.reduce((s,r)=>s+r.baseline.ms,0),targetStopMs:records.reduce((s,r)=>s+r.targetStop.ms,0),baselineNodes:records.reduce((s,r)=>s+num(r.baseline.nodes),0),targetStopNodes:records.reduce((s,r)=>s+num(r.targetStop.nodes),0)}};
  summary.aggregate.timeSavedPct=summary.aggregate.baselineMs?1-summary.aggregate.targetStopMs/summary.aggregate.baselineMs:null;
  summary.aggregate.nodeSavedPct=summary.aggregate.baselineNodes?1-summary.aggregate.targetStopNodes/summary.aggregate.baselineNodes:null;
  fs.mkdirSync(OUT_DIR,{recursive:true});fs.writeFileSync(OUT,JSON.stringify(summary,null,2)+"\n");
  console.log("TARGET_STOP_SUMMARY",JSON.stringify({pass:summary.pass,aggregate:summary.aggregate}));
  if(!summary.pass)process.exitCode=2;
}
main();

"use strict";

const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const {performance}=require("node:perf_hooks");

const ROOT=path.resolve(__dirname,"../../..");
const CANONICAL=path.join(ROOT,"experiencia/canonical_cases.json");
const MANIFEST=path.join(ROOT,"research/optimizer/master-portfolio/MASTER_ACTIVE_323_MANIFEST_2026-09-18.json");
const OUT_DIR=path.join(ROOT,"research/optimizer/master-portfolio/out");
const OUT=path.join(OUT_DIR,"PERFV1_MASTER40_INCREMENTAL_GUIDED_SMOKE_2026-09-21.json");
const LEGACY=path.join(ROOT,"src/lib/optimizer/legacy");

process.env.OPTIMIZER_RUST_BEAM_RANK_CACHE_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_LEAN_BEAM_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_GREEDY_PLAN_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_LARGE_ROUND_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_SIMPLE_CHOOSE_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_MASTER_ROUND_REUSE_EXPERIMENTAL="0";

const {optimizarV10,nuevasMetricas,validarPlanIndustrial}=require(path.join(LEGACY,"v10.cjs"));
const {patronesMonotipo}=require(path.join(LEGACY,"patrones.cjs"));
const {resolverCobertura}=require(path.join(LEGACY,"cobertura.cjs"));
const {materializar}=require(path.join(LEGACY,"materializar.cjs"));
const {calidadPlanPlacas,compararCalidad}=require(path.join(LEGACY,"motor.cjs"));
const {createIncrementalRustMasterGenerator}=require("./incremental-rust-master-perfv1.cjs");

const P16=Object.freeze([0,2,6,10,12,13,16,17,18,19,20,21,22,25,34,36]);
const GUIDED_FIRST=Object.freeze([9,23,32,1]);
const NORMAL=Object.freeze([...P16,...Array.from({length:40},(_,i)=>i).filter(r=>!P16.includes(r))]);
const GUIDED=Object.freeze([...P16,...GUIDED_FIRST,...Array.from({length:40},(_,i)=>i).filter(r=>!P16.includes(r)&&!GUIDED_FIRST.includes(r))]);
const CHECKPOINTS=Object.freeze([3,16,20,24,28,32,36,40]);

const MAX_CASES=Number(process.env.INC_MAX_CASES||16);
const MAX_PIECES=Number(process.env.INC_MAX_PIECES||300);
const PROBE_NODES=Number(process.env.INC_PROBE_NODES||100000);
const PROBE_WATCHDOG_MS=Number(process.env.INC_PROBE_WATCHDOG_MS||300);
const FULL_NODES=Number(process.env.INC_FULL_NODES||1600000);
const FULL_WATCHDOG_MS=Number(process.env.INC_FULL_WATCHDOG_MS||12000);

function num(v,f=0){const n=Number(v);return Number.isFinite(n)?n:f;}
function boolTrue(v){return v===true||v===1||v==="1"||v==="true"||v==="TRUE";}
function basename(v){return typeof v==="string"?v.replaceAll("\\","/").split("/").pop():null;}
function qty(p){for(const k of ["quantity","qty","count","cant","num","q","qMin"]){const n=Number(p?.[k]);if(Number.isFinite(n)&&n>0)return n;}return 1;}
function dims(p){return {w:num(p?.width??p?.base??p?.l??p?.L),h:num(p?.height??p?.altura??p?.w??p?.W)};}
function features(row){
  const ps=Array.isArray(row.pieces)?row.pieces:[];
  return {file:basename(row.source_path||((row.case_id||"")+".xml")),pieceCount:num(row.piece_count,ps.reduce((s,p)=>s+qty(p),0)),typeCount:num(row.piece_types,ps.length)};
}
function toLines(row){
  const fmt=String(row.source_format||"").toLowerCase();
  return (row.pieces||[]).map((p,i)=>({
    ref:String(i+1),detalle:String(i+1),cant:qty(p),base:dims(p).w,altura:dims(p).h,
    veta:fmt==="order"&&(boolTrue(p?.xmlPartGrain)||boolTrue(p?.rawGrain)||boolTrue(p?.grain)),cantos:null
  }));
}
function toConfig(row){
  const fmt=String(row.source_format||"").toLowerCase();
  return {
    placaBase:num(row.stock_width,2600),placaAltura:num(row.stock_height,1830),refiladoX:0,refiladoY:0,
    sierra:num(row.saw,4.5),etapas:4,materialConVeta:fmt==="order"?boolTrue(row.directional):false,
    descontarCanto:false,cantoEspesor:0,restoMin:250,restoMax:400,usarCache:false,maxPiezasCache:0,
    usarCompactacion:true,usarMultiSlice:true,usarOneBoard:true,usarMaster:false,usarRustPatternGenerator:true,
    rondasPatrones:40,msMaster:8000,usarCotaBarataPostCompactacion:true,usarDffFs0PostCompactacion:true,
    usarMascarasUnicasMasterLe4:true,minPiezasMultiSliceExperimental:200,maxPiezasMultiSliceExperimental:500
  };
}
function cpuMs(start){const d=process.cpuUsage(start);return (d.user+d.system)/1000;}
function timed(fn){const c=process.cpuUsage(),t=performance.now();const value=fn();return {value,wallMs:performance.now()-t,cpuMs:cpuMs(c)};}
function solve(pool,lines,area,incumbent,isFinal){
  const control={maxNodos:isFinal?FULL_NODES:PROBE_NODES,watchdogMs:isFinal?FULL_WATCHDOG_MS:PROBE_WATCHDOG_MS};
  const t=timed(()=>{
    const h=resolverCobertura(pool,lines.map(l=>l.cant),area,incumbent,8000,control);
    return h?h.resolver(lines.map(l=>l.base*l.altura)):null;
  });
  return {sol:t.value,wallMs:t.wallMs,cpuMs:t.cpuMs};
}
function materializeSafe(sol,lines,prePlan,expected){
  if(!sol?.plan)return null;
  try{
    const plan=materializar(sol.plan,lines,prePlan.opts);
    const v=plan?validarPlanIndustrial(plan,expected):null;
    if(!v?.ok)return null;
    return {plan,boards:plan?.resumen?.placas??sol?.placas,quality:calidadPlanPlacas(plan.placas||[],plan.opts||prePlan.opts)};
  }catch(_){return null;}
}
function poolDigest(pool){
  const normalized=pool.map(p=>({
    uso:[...p.uso.entries()].sort((a,b)=>a[0]-b[0]),
    area:p.area,
    colocadas:(p.placa?.colocadas||[]).map(x=>[x?.pieza?.ref,x.base,x.altura,x.x??null,x.y??null,Boolean(x.rotada)])
  }));
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}
function qualityCmp(a,b){return compararCalidad(a,b);}
function runSchedule(name,order,lines,config,prePlan,cota,mono,expected){
  const area=(config.placaBase-config.refiladoX)*(config.placaAltura-config.refiladoY);
  const gen=createIncrementalRustMasterGenerator(lines,config,40,7);
  const preQuality=calidadPlanPlacas(prePlan.placas||[],prePlan.opts||config);
  let best={boards:prePlan.resumen.placas,quality:preQuality,source:"pre"};
  let prev=0;
  const checkpoints=[];
  let finalReference=null;

  for(const size of CHECKPOINTS){
    const added=order.slice(prev,size);
    const exec=timed(()=>gen.execute(added));
    const dedup=timed(()=>gen.patterns(order.slice(0,size)));
    const patterns=dedup.value;
    const isFinal=size===40;

    let probe={sol:null,wallMs:0,cpuMs:0},improved=false;
    if(best.boards>cota){
      probe=solve(patterns.concat(mono),lines,area,best.boards,false);
      const mat=materializeSafe(probe.sol,lines,prePlan,expected);
      if(mat&&Number.isFinite(mat.boards)&&mat.boards<best.boards){
        best={boards:mat.boards,quality:mat.quality,source:size};improved=true;
      }
    }

    if(isFinal){
      const refSolve=solve(patterns.concat(mono),lines,area,prePlan.resumen.placas,true);
      const refMat=materializeSafe(refSolve.sol,lines,prePlan,expected);
      finalReference=refMat&&Number.isFinite(refMat.boards)&&refMat.boards<prePlan.resumen.placas
        ? {boards:refMat.boards,quality:refMat.quality,solveWallMs:refSolve.wallMs,solveCpuMs:refSolve.cpuMs,nodes:refSolve.sol?.nodos??null}
        : {boards:prePlan.resumen.placas,quality:preQuality,solveWallMs:refSolve.wallMs,solveCpuMs:refSolve.cpuMs,nodes:refSolve.sol?.nodos??null};
      if(finalReference.boards<best.boards)best={boards:finalReference.boards,quality:finalReference.quality,source:"full40-ref"};
    }

    checkpoints.push({
      size,added,boards:best.boards,improved,source:best.source,
      genDeltaWallMs:exec.wallMs,genDeltaCpuMs:exec.cpuMs,generationCpuMs:gen.generationCpuMs,
      dedupWallMs:dedup.wallMs,dedupCpuMs:dedup.cpuMs,patterns:patterns.length,
      solveWallMs:probe.wallMs,solveCpuMs:probe.cpuMs,nodes:probe.sol?.nodos??null,
      poolDigest:isFinal?poolDigest(patterns):null
    });
    prev=size;
  }
  const refBoards=finalReference.boards;
  const earliest=checkpoints.find(c=>c.boards<=refBoards)?.size??40;
  const earliestCp=checkpoints.find(c=>c.size===earliest);
  const p40=checkpoints[checkpoints.length-1];
  return {
    name,reference:finalReference,terminal:best,earliestFinalBoardMatch:earliest,
    cpuToFinalIncumbentMs:earliestCp?.generationCpuMs??null,
    checkpoints,
    totals:{
      generationCpuMs:p40.generationCpuMs,
      dedupWallMs:checkpoints.reduce((s,c)=>s+c.dedupWallMs,0),
      dedupCpuMs:checkpoints.reduce((s,c)=>s+c.dedupCpuMs,0),
      probeSolveWallMs:checkpoints.reduce((s,c)=>s+c.solveWallMs,0),
      probeSolveCpuMs:checkpoints.reduce((s,c)=>s+c.solveCpuMs,0)
    }
  };
}
function percentile(values,p){
  const a=values.filter(Number.isFinite).slice().sort((x,y)=>x-y);if(!a.length)return null;
  const i=Math.min(a.length-1,Math.max(0,Math.ceil(p*a.length)-1));return a[i];
}
function dist(records,key){
  const out={};
  for(const cp of CHECKPOINTS)out[cp]=records.filter(r=>r[key].earliestFinalBoardMatch<=cp).length;
  return out;
}
function main(){
  const manifest=JSON.parse(fs.readFileSync(MANIFEST,"utf8"));
  const raw=JSON.parse(fs.readFileSync(CANONICAL,"utf8"));
  const all=Array.isArray(raw)?raw:raw.cases||[];
  const byFile=new Map(all.map(r=>[features(r).file,r]));
  const eligible=(manifest.cases||[]).filter(m=>num(m.pieces)<=MAX_PIECES)
    .sort((a,b)=>(num(b.generationMs)+num(b.solveMs)+num(b.monotypeMs))-(num(a.generationMs)+num(a.solveMs)+num(a.monotypeMs)));
  const must=new Set([4050594,4058501,4057401,4059200]);
  const chosen=[],unavailable=[];
  for(const m of eligible){
    if(chosen.length>=MAX_CASES&&!must.has(num(m.order)))continue;
    let row=byFile.get(basename(m.file));
    if(!row)row=all.find(r=>String(r.case_id||r.source_path||"").includes(String(m.order)));
    if(!row){unavailable.push({order:m.order,reason:"missing"});continue;}
    const f=features(row);
    if(f.pieceCount!==num(m.pieces)||f.typeCount!==num(m.typeCount)){unavailable.push({order:m.order,reason:"snapshot"});continue;}
    chosen.push({m,row});
  }

  const records=[];
  for(const {m,row} of chosen){
    const lines=toLines(row),config=toConfig(row),expected=lines.reduce((s,l)=>s+num(l.cant),0);
    const preT=timed(()=>optimizarV10(lines,{...config,usarMaster:false},nuevasMetricas()));
    const pre=preT.value,prePlan=pre?.plan,valid=prePlan?validarPlanIndustrial(prePlan,expected):null;
    if(!prePlan||!valid?.ok){records.push({order:m.order,error:"invalid-pre"});continue;}
    const preParity=prePlan.resumen.placas===num(m.preMasterBoards)&&pre.cota===num(m.lowerBound);
    const monoT=timed(()=>patronesMonotipo(lines,config));
    const normal=runSchedule("normal",NORMAL,lines,config,prePlan,pre.cota,monoT.value,expected);
    const guided=runSchedule("guided",GUIDED,lines,config,prePlan,pre.cota,monoT.value,expected);
    const fullPoolParity=normal.checkpoints.at(-1).poolDigest===guided.checkpoints.at(-1).poolDigest;
    const boardParity=normal.reference.boards===guided.reference.boards;
    const qualityParity=boardParity&&qualityCmp(normal.reference.quality,guided.reference.quality)===0;
    const rec={order:m.order,pieces:features(row).pieceCount,typeCount:features(row).typeCount,preParity,
      preBoards:prePlan.resumen.placas,cota:pre.cota,preWallMs:preT.wallMs,monoWallMs:monoT.wallMs,
      fullPoolParity,boardParity,qualityParity,normal,guided};
    records.push(rec);
    console.log("INC_CASE",JSON.stringify({
      order:rec.order,preParity,fullPoolParity,boardParity,qualityParity,
      normal:{ref:normal.reference.boards,earliest:normal.earliestFinalBoardMatch,cpu:normal.cpuToFinalIncumbentMs,dedup:normal.totals.dedupWallMs},
      guided:{ref:guided.reference.boards,earliest:guided.earliestFinalBoardMatch,cpu:guided.cpuToFinalIncumbentMs,dedup:guided.totals.dedupWallMs}
    }));
  }

  const scored=records.filter(r=>!r.error&&r.preParity);
  const ncpu=scored.map(r=>r.normal.cpuToFinalIncumbentMs),gcpu=scored.map(r=>r.guided.cpuToFinalIncumbentMs);
  const pctSaved=scored.map(r=>r.normal.cpuToFinalIncumbentMs>0?1-r.guided.cpuToFinalIncumbentMs/r.normal.cpuToFinalIncumbentMs:0);
  const summary={
    schema:"perfv1-master40-incremental-guided-smoke-v1",generatedAt:new Date().toISOString(),
    branch:process.env.GITHUB_REF_NAME||null,checkpoints:CHECKPOINTS,normalOrder:NORMAL,guidedOrder:GUIDED,
    counts:{eligible:eligible.length,chosen:records.length,scored:scored.length,unavailable:unavailable.length,
      poolMismatches:scored.filter(r=>!r.fullPoolParity).map(r=>r.order),
      boardRegressions:scored.filter(r=>r.guided.reference.boards>r.normal.reference.boards).map(r=>r.order),
      qualityRegressions:scored.filter(r=>r.boardParity&&!r.qualityParity).map(r=>r.order)},
    curve:{normal:dist(scored,"normal"),guided:dist(scored,"guided")},
    cpuToFinalIncumbentMs:{
      normal:{p50:percentile(ncpu,.5),p95:percentile(ncpu,.95),p99:percentile(ncpu,.99),max:percentile(ncpu,1)},
      guided:{p50:percentile(gcpu,.5),p95:percentile(gcpu,.95),p99:percentile(gcpu,.99),max:percentile(gcpu,1)},
      savedPct:{p50:percentile(pctSaved,.5),p95:percentile(pctSaved,.95),p99:percentile(pctSaved,.99)}
    },
    dedupWallMs:{
      normal:{p50:percentile(scored.map(r=>r.normal.totals.dedupWallMs),.5),p95:percentile(scored.map(r=>r.normal.totals.dedupWallMs),.95)},
      guided:{p50:percentile(scored.map(r=>r.guided.totals.dedupWallMs),.5),p95:percentile(scored.map(r=>r.guided.totals.dedupWallMs),.95)}
    },
    pass:scored.length>0&&scored.every(r=>r.fullPoolParity&&r.boardParity&&r.qualityParity),
    unavailable,records
  };
  fs.mkdirSync(OUT_DIR,{recursive:true});
  fs.writeFileSync(OUT,JSON.stringify(summary,null,2)+"\n");
  console.log("INC_SUMMARY",JSON.stringify({pass:summary.pass,counts:summary.counts,curve:summary.curve,cpu:summary.cpuToFinalIncumbentMs,dedup:summary.dedupWallMs}));
  if(!summary.pass)process.exitCode=2;
}
main();

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const ROOT = path.resolve(__dirname, "../../..");
const CANONICAL_PATH = path.join(ROOT, "experiencia/canonical_cases.json");
const MANIFEST_PATH = path.join(ROOT, "research/optimizer/master-portfolio/MASTER_ACTIVE_323_MANIFEST_2026-09-18.json");
const FIXTURE_4056900 = path.join(ROOT, "research/optimizer/pattern-generators/guide-slice/INDUSTRIAL_PORTFOLIO_4056900_CHECKPOINT_2026-09-14.json");
const OUT_DIR = path.join(ROOT, "research/optimizer/master-portfolio/out");
const OUT_PATH = path.join(OUT_DIR, "MASTER_P15_GAP1_2026-09-21.json");

const LEGACY = path.join(ROOT, "src/lib/optimizer/legacy");
const { optimizarV10, nuevasMetricas, validarPlanIndustrial } = require(path.join(LEGACY, "v10.cjs"));
const { patronesMonotipo } = require(path.join(LEGACY, "patrones.cjs"));
const { resolverCobertura } = require(path.join(LEGACY, "cobertura.cjs"));
const { materializar } = require(path.join(LEGACY, "materializar.cjs"));
const { calidadPlanPlacas, compararCalidad } = require(path.join(LEGACY, "motor.cjs"));
const { defragmentarPlanPorPlaca } = require(path.join(ROOT, "src/lib/optimizer/experimental/per-board-remnant-defrag.cjs"));
const { createIncrementalRustMasterGenerator } = require("./incremental-rust-master.cjs");

const P15 = Object.freeze([0,2,6,10,12,13,16,17,18,19,21,22,25,34,36]);
const THRESHOLD = Number(process.env.MASTER_GATE_MULT || 4.75);
const MAX_CASES = Number(process.env.P15_MAX_CASES || 24);
const MAX_PIECES = Number(process.env.P15_MAX_PIECES || 180);
const FULL_MS = Number(process.env.P15_FULL_MS || 8000);
const EARLY_NODES = Number(process.env.P15_EARLY_NODES || 200000);
const EARLY_WATCHDOG_MS = Number(process.env.P15_EARLY_WATCHDOG_MS || 1500);
const FULL_NODES = Number(process.env.P15_FULL_NODES || 1600000);
const FULL_WATCHDOG_MS = Number(process.env.P15_FULL_WATCHDOG_MS || 12000);

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function boolTrue(v) {
  return v === true || v === 1 || v === "1" || v === "true" || v === "TRUE";
}
function basename(v) {
  return typeof v === "string" ? v.replaceAll("\\", "/").split("/").pop() : null;
}
function qty(p) {
  for (const k of ["quantity","qty","count","cant","num","q","qMin"]) {
    const n = Number(p?.[k]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 1;
}
function dims(p) {
  return { w:num(p?.width ?? p?.base ?? p?.l ?? p?.L), h:num(p?.height ?? p?.altura ?? p?.w ?? p?.W) };
}
function features(row) {
  const ps = Array.isArray(row.pieces) ? row.pieces : [];
  const pieceCount = num(row.piece_count, ps.reduce((s,p)=>s+qty(p),0));
  const typeCount = num(row.piece_types, ps.length);
  return {
    file: basename(row.source_path || ((row.case_id || "") + ".xml")),
    pieceCount,
    typeCount,
    multiplicityMean: typeCount ? pieceCount/typeCount : 0,
  };
}
function gateV2(m) {
  const gap = num(m.preMasterBoards) - num(m.lowerBound);
  const multiplicityMean = num(m.typeCount) ? num(m.pieces)/num(m.typeCount) : 0;
  return gap > 1 || multiplicityMean >= THRESHOLD;
}
function toLines(row) {
  const fmt = String(row.source_format || "").toLowerCase();
  return (row.pieces || []).map((p,i)=>({
    ref:String(i+1), detalle:String(i+1), cant:qty(p),
    base:dims(p).w, altura:dims(p).h,
    veta:fmt==="order" && (boolTrue(p?.xmlPartGrain)||boolTrue(p?.rawGrain)||boolTrue(p?.grain)),
    cantos:null,
  }));
}
function toConfig(row) {
  const fmt = String(row.source_format || "").toLowerCase();
  return {
    placaBase:num(row.stock_width,2600),
    placaAltura:num(row.stock_height,1830),
    refiladoX:0, refiladoY:0,
    sierra:num(row.saw,4.5),
    etapas:4,
    materialConVeta:fmt==="order" ? boolTrue(row.directional) : false,
    descontarCanto:false, cantoEspesor:0,
    restoMin:250, restoMax:400,
    usarCache:true, maxPiezasCache:3000,
    usarCompactacion:true, usarMultiSlice:true, usarOneBoard:true,
    usarMaster:false,
    rondasPatrones:40,
    msMaster:FULL_MS,
  };
}
function synthetic4056900() {
  const cp=JSON.parse(fs.readFileSync(FIXTURE_4056900,"utf8")).source;
  return {
    case_id:"4056900__Alfredo_Arrua4056900",
    source_path:cp.file, source_format:cp.format,
    stock_width:cp.board.width, stock_height:cp.board.height, saw:cp.board.kerf,
    directional:false, piece_count:cp.pieceQuantity, piece_types:cp.pieceTypes,
    pieces:cp.lines.map(x=>({base:x.width,altura:x.height,cant:x.quantity})),
    _syntheticFrozen:true,
  };
}
function synthetic4057401() {
  return {
    case_id:"4057401__GABRIEL_TUMBACO CRUZ4057401",
    source_path:"4057401__GABRIEL_TUMBACO CRUZ4057401.xml",
    source_format:"project",
    stock_width:2742, stock_height:1822, saw:4.5, directional:false,
    piece_count:19, piece_types:4,
    pieces:[
      {base:1800,altura:1050,cant:2},
      {base:2000,altura:1100,cant:2},
      {base:1900,altura:1500,cant:1},
      {base:744,altura:450,cant:14},
    ],
    _syntheticFrozen:true,
  };
}
function solve(pool, lines, areaPlaca, incumbent, maxNodos, watchdogMs) {
  const t0=performance.now();
  const h=resolverCobertura(
    pool, lines.map(l=>l.cant), areaPlaca, incumbent, FULL_MS,
    {maxNodos,watchdogMs}
  );
  const sol=h ? h.resolver(lines.map(l=>l.base*l.altura)) : null;
  return {sol, solveMs:performance.now()-t0};
}
function materialize(sol, lines, prePlan, expected) {
  if (!sol?.plan) return {plan:null,valid:false,boards:sol?.placas ?? null,quality:null};
  const plan=materializar(sol.plan,lines,prePlan.opts);
  const validation=plan ? validarPlanIndustrial(plan,expected) : null;
  return {
    plan,
    valid:validation?.ok ?? false,
    boards:plan?.resumen?.placas ?? sol?.placas ?? null,
    quality:plan ? calidadPlanPlacas(plan.placas||[],plan.opts||prePlan.opts) : null,
  };
}
function finalFrom(prePlan, masterResult) {
  if (masterResult?.valid && Number.isFinite(masterResult.boards) && masterResult.boards < prePlan.resumen.placas) return masterResult;
  return {
    plan:prePlan, valid:true, boards:prePlan.resumen.placas,
    quality:calidadPlanPlacas(prePlan.placas||[],prePlan.opts||{}),
  };
}

function runBaseline(row) {
  const lines=toLines(row), config=toConfig(row);
  const expected=lines.reduce((s,l)=>s+num(l.cant),0);
  const preStart=performance.now();
  const pre=optimizarV10(lines,{...config,usarMaster:false},nuevasMetricas());
  const preMs=performance.now()-preStart;
  const prePlan=pre?.plan;
  const preValid=prePlan ? validarPlanIndustrial(prePlan,expected) : null;
  if (!prePlan || !preValid?.ok) return {error:"invalid-pre",preMs};
  const gen=createIncrementalRustMasterGenerator(lines,config,40,7);
  const genStart=performance.now();
  gen.execute([...Array(40).keys()]);
  const patterns=gen.patterns();
  const mono=patronesMonotipo(lines,config);
  const generationWallMs=performance.now()-genStart;
  const area=(config.placaBase-config.refiladoX)*(config.placaAltura-config.refiladoY);
  const solved=solve(patterns.concat(mono),lines,area,prePlan.resumen.placas,FULL_NODES,FULL_WATCHDOG_MS);
  const master=materialize(solved.sol,lines,prePlan,expected);
  const final=finalFrom(prePlan,master);
  return {
    preMs, preBoards:prePlan.resumen.placas, cota:pre.cota,
    generationWallMs, generationCpuMs:gen.generationCpuMs,
    generatedPatterns:patterns.length, monotypes:mono.length,
    solveMs:solved.solveMs, nodes:solved.sol?.nodos ?? null, exhausted:solved.sol?.agotado ?? null,
    masterValid:master.valid, masterBoards:master.boards,
    finalBoards:final.boards, finalQuality:final.quality,
  };
}

function runStaged(row) {
  const lines=toLines(row), config=toConfig(row);
  const expected=lines.reduce((s,l)=>s+num(l.cant),0);
  const preStart=performance.now();
  const pre=optimizarV10(lines,{...config,usarMaster:false},nuevasMetricas());
  const preMs=performance.now()-preStart;
  const prePlan=pre?.plan;
  const preValid=prePlan ? validarPlanIndustrial(prePlan,expected) : null;
  if (!prePlan || !preValid?.ok) return {error:"invalid-pre",preMs};
  const area=(config.placaBase-config.refiladoX)*(config.placaAltura-config.refiladoY);
  const monoStart=performance.now();
  const mono=patronesMonotipo(lines,config);
  const monoMs=performance.now()-monoStart;

  const gen=createIncrementalRustMasterGenerator(lines,config,40,7);
  const p15Start=performance.now();
  gen.execute(P15);
  const p15Patterns=gen.patterns(P15);
  const p15GenerationWallMs=performance.now()-p15Start;
  const early=solve(p15Patterns.concat(mono),lines,area,prePlan.resumen.placas,EARLY_NODES,EARLY_WATCHDOG_MS);
  const earlyMaster=materialize(early.sol,lines,prePlan,expected);
  const certifiedEarly=Boolean(
    earlyMaster.valid &&
    Number.isFinite(earlyMaster.boards) &&
    earlyMaster.boards === pre.cota &&
    earlyMaster.boards < prePlan.resumen.placas
  );

  if (certifiedEarly) {
    // Objective #1 is now mathematically closed. Spend only on objective #2:
    // a fixed-board polish that cannot move pieces between boards or add boards.
    const polishStart=performance.now();
    const polished=defragmentarPlanPorPlaca(earlyMaster.plan,{piezasEsperadas:expected});
    const polishMs=performance.now()-polishStart;
    const polishedPlan=polished && !polished.invalidFinal && polished.plan ? polished.plan : earlyMaster.plan;
    const polishedValid=polishedPlan ? validarPlanIndustrial(polishedPlan,expected) : null;
    const finalPlan=polishedValid?.ok ? polishedPlan : earlyMaster.plan;
    return {
      preMs, preBoards:prePlan.resumen.placas, cota:pre.cota,
      stoppedEarly:true, executedRounds:P15.length,
      p15Patterns:p15Patterns.length, monotypes:mono.length, monoMs,
      p15GenerationWallMs, generationCpuMs:gen.generationCpuMs,
      earlySolveMs:early.solveMs, earlyNodes:early.sol?.nodos ?? null, earlyExhausted:early.sol?.agotado ?? null,
      remnantPolishMs:polishMs,
      remnantPolishChanged:Boolean(polished?.changed),
      remnantPolishImprovedBoards:num(polished?.improvedBoards),
      fallbackGenerationWallMs:0, fallbackSolveMs:0,
      finalBoards:finalPlan?.resumen?.placas ?? earlyMaster.boards,
      finalQuality:calidadPlanPlacas(finalPlan?.placas||[],finalPlan?.opts||prePlan.opts),
    };
  }

  const fallbackStart=performance.now();
  gen.execute(gen.missingRounds());
  const allPatterns=gen.patterns();
  const fallbackGenerationWallMs=performance.now()-fallbackStart;
  const full=solve(allPatterns.concat(mono),lines,area,prePlan.resumen.placas,FULL_NODES,FULL_WATCHDOG_MS);
  const fullMaster=materialize(full.sol,lines,prePlan,expected);
  const final=finalFrom(prePlan,fullMaster);
  return {
    preMs, preBoards:prePlan.resumen.placas, cota:pre.cota,
    stoppedEarly:false, executedRounds:40,
    p15Patterns:p15Patterns.length, allPatterns:allPatterns.length, monotypes:mono.length, monoMs,
    p15GenerationWallMs, fallbackGenerationWallMs, generationCpuMs:gen.generationCpuMs,
    earlySolveMs:early.solveMs, earlyNodes:early.sol?.nodos ?? null, earlyExhausted:early.sol?.agotado ?? null,
    fallbackSolveMs:full.solveMs, fallbackNodes:full.sol?.nodos ?? null, fallbackExhausted:full.sol?.agotado ?? null,
    finalBoards:final.boards, finalQuality:final.quality,
  };
}

function runPair(row, historical, index) {
  const candidateFirst=index%2===1;
  let baseline,candidate;
  const t0=performance.now();
  if(candidateFirst){candidate=runStaged(row);baseline=runBaseline(row);}
  else{baseline=runBaseline(row);candidate=runStaged(row);}
  const pairWallMs=performance.now()-t0;
  const boardParity=baseline.finalBoards===candidate.finalBoards;
  const qualityCmp=boardParity && baseline.finalQuality && candidate.finalQuality
    ? compararCalidad(candidate.finalQuality,baseline.finalQuality)
    : null;
  const qualityNotWorse=qualityCmp!==null && qualityCmp>=0;
  const historicalParity=baseline.finalBoards===num(historical.finalBoards);
  const baselineMasterWorkMs=num(baseline.generationWallMs)+num(baseline.solveMs);
  const candidateMasterWorkMs=
    num(candidate.monoMs)+num(candidate.p15GenerationWallMs)+num(candidate.earlySolveMs)+
    num(candidate.remnantPolishMs)+num(candidate.fallbackGenerationWallMs)+num(candidate.fallbackSolveMs);
  return {
    order:historical.order,file:features(row).file,features:features(row),historical:{
      finalBoards:num(historical.finalBoards),preMasterBoards:num(historical.preMasterBoards),
      lowerBound:num(historical.lowerBound),masterWin:Boolean(historical.masterWin),
      generationMs:num(historical.generationMs),solveMs:num(historical.solveMs),
    },
    candidateFirst,pairWallMs,baseline,candidate,historicalParity,boardParity,qualityNotWorse,
    baselineMasterWorkMs,candidateMasterWorkMs,
    savedMs:baselineMasterWorkMs-candidateMasterWorkMs,
  };
}

function main(){
  const manifest=JSON.parse(fs.readFileSync(MANIFEST_PATH,"utf8"));
  const raw=JSON.parse(fs.readFileSync(CANONICAL_PATH,"utf8"));
  const all=Array.isArray(raw)?raw:raw.cases||[];
  const byFile=new Map(all.map(r=>[features(r).file,r]));

  const historical=(manifest.cases||[])
    .filter(gateV2)
    .filter(m=>num(m.preMasterBoards)-num(m.lowerBound)===1)
    .filter(m=>num(m.pieces)<=MAX_PIECES)
    .sort((a,b)=>(num(b.generationMs)+num(b.solveMs))-(num(a.generationMs)+num(a.solveMs)));

  const mandatoryWinnerOrders=new Set([4050594,4056900,4057401]);
  const chosen=[];
  for(const m of historical){
    if(chosen.length>=MAX_CASES && !mandatoryWinnerOrders.has(num(m.order))) continue;
    let row =
      num(m.order)===4056900 ? synthetic4056900() :
      num(m.order)===4057401 ? synthetic4057401() :
      byFile.get(basename(m.file));
    if(!row) row=all.find(r=>String(r.case_id||r.source_path||"").includes(String(m.order)));
    if(!row) continue;
    const f=features(row);
    if(f.pieceCount!==num(m.pieces)||f.typeCount!==num(m.typeCount)) continue;
    chosen.push({m,row});
  }
  // Ensure known gap=1 winners are present even if outside cost cap.
  for(const order of mandatoryWinnerOrders){
    if(chosen.some(x=>num(x.m.order)===order)) continue;
    const m=(manifest.cases||[]).find(x=>num(x.order)===order);
    if(!m) continue;
    const row=order===4056900?synthetic4056900():order===4057401?synthetic4057401():byFile.get(basename(m.file));
    if(row) chosen.push({m,row});
  }

  const records=[];
  for(let i=0;i<chosen.length;i++){
    const {m,row}=chosen[i];
    const rec=runPair(row,m,i);
    records.push(rec);
    console.log("P15_PAIR",JSON.stringify({
      order:rec.order,win:rec.historical.masterWin,historicalParity:rec.historicalParity,
      boardParity:rec.boardParity,qualityNotWorse:rec.qualityNotWorse,
      stoppedEarly:rec.candidate.stoppedEarly,baselineBoards:rec.baseline.finalBoards,
      candidateBoards:rec.candidate.finalBoards,baselineMasterWorkMs:rec.baselineMasterWorkMs,
      candidateMasterWorkMs:rec.candidateMasterWorkMs,savedMs:rec.savedMs,
      earlySolveMs:rec.candidate.earlySolveMs,earlyNodes:rec.candidate.earlyNodes,
      polishMs:rec.candidate.remnantPolishMs ?? 0,polishChanged:rec.candidate.remnantPolishChanged ?? false,
      p15Patterns:rec.candidate.p15Patterns,allPatterns:rec.candidate.allPatterns ?? null,
    }));
  }

  const scored=records.filter(r=>r.historicalParity);
  const sum=(xs,fn)=>xs.reduce((s,x)=>s+num(fn(x)),0);
  const base=sum(scored,r=>r.baselineMasterWorkMs);
  const cand=sum(scored,r=>r.candidateMasterWorkMs);
  const winners=scored.filter(r=>r.historical.masterWin);
  const summary={
    schema:"master-p15-gap1-v1",
    generatedAt:new Date().toISOString(),
    policy:{
      gate:"Gate V2 survivor && gap == 1",
      firstRounds:P15,
      stopCondition:"valid board-reducing plan reaches optimizer lower bound",
      fallback:"execute only missing rounds, reusing incremental Rust state, then full solve",
      earlyNodeBudget:EARLY_NODES,
      earlyWatchdogMs:EARLY_WATCHDOG_MS,
    },
    counts:{
      chosen:records.length,
      scoredHistoricalParity:scored.length,
      boardParity:scored.filter(r=>r.boardParity).length,
      qualityNotWorse:scored.filter(r=>r.qualityNotWorse).length,
      stoppedEarly:scored.filter(r=>r.candidate.stoppedEarly).length,
      winners:winners.map(r=>r.order),
      winnersStoppedEarly:winners.filter(r=>r.candidate.stoppedEarly).map(r=>r.order),
    },
    timing:{
      baselineMasterWorkMs:base,
      candidateMasterWorkMs:cand,
      savedMs:base-cand,
      savedPct:base?(base-cand)/base:null,
    },
    pass:
      scored.length>0 &&
      scored.every(r=>r.boardParity && r.qualityNotWorse) &&
      winners.every(r=>r.candidate.finalBoards===r.baseline.finalBoards),
    records,
  };
  fs.mkdirSync(OUT_DIR,{recursive:true});
  fs.writeFileSync(OUT_PATH,JSON.stringify(summary,null,2)+"\n","utf8");
  console.log("P15_SUMMARY",JSON.stringify({pass:summary.pass,counts:summary.counts,timing:summary.timing}));
  if(!summary.pass) process.exitCode=2;
}

main();

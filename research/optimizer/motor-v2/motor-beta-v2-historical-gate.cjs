"use strict";

(async()=>{
const fs=require("node:fs");
const path=require("node:path");
const {pathToFileURL}=require("node:url");

const ROOT=path.resolve(__dirname,"../../..");
const CORPUS=path.join(ROOT,"experiencia/canonical_cases.json");
const SHARD_INDEX=Number(process.env.SHARD_INDEX||0);
const SHARD_TOTAL=Number(process.env.SHARD_TOTAL||32);
const MODE=process.argv[2]||"shard";

process.env.OPTIMIZER_RUST_BEAM_RANK_CACHE_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_LEAN_BEAM_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_GREEDY_PLAN_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_LARGE_ROUND_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_SIMPLE_CHOOSE_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_MASTER_ROUND_REUSE_EXPERIMENTAL="0";
process.env.OPTIMIZER_MASTER_UNIQUE_MASKS_LE4_EXPERIMENTAL="1";

const wrapper=await import(pathToFileURL(path.join(ROOT,"research/optimizer/motor-v2/master-structural-shortcircuit-v2.mjs")).href);
const gateMod=await import(pathToFileURL(path.join(ROOT,"research/optimizer/motor-v2/structural-repetition-rescue-v2.mjs")).href);
const {
  runMasterStructuralShortCircuitV2,
  runFrozenV10,
  validarPlanIndustrial,
  calidadPlanPlacas,
  compararCalidad,
}=wrapper;
const {repetitionGate}=gateMod;

function loadCorpus(){
  const raw=JSON.parse(fs.readFileSync(CORPUS,"utf8"));
  return Array.isArray(raw)?raw:(raw.cases||raw.records||raw.canonical_cases||raw.canonicalCases||raw.data||[]);
}
function root(e){return e?.case??e?.canonical??e?.optimization_case??e?.optimizationCase??e;}
function num(...xs){for(const x of xs){const n=Number(x);if(Number.isFinite(n))return n;}return null;}
function orderNumber(v){const runs=String(v||"").replace(/\.xml$/i,"").match(/\d+/g);if(!runs)return null;const last=runs.at(-1);return Number(last.length>7?last.slice(-7):last);}
function identity(e,index){
  const r=root(e),vals=[e?.case_id,e?.caseId,e?.file,e?.file_name,e?.fileName,e?.source_file,e?.sourceFile,e?.name,e?.id,r?.case_id,r?.caseId,r?.file,r?.file_name,r?.fileName,r?.source_file,r?.sourceFile,r?.name,r?.id].filter(v=>typeof v==="string"||Number.isFinite(Number(v)));
  for(const s of vals){const n=orderNumber(s);if(Number.isFinite(n))return {order:n,file:String(s)};}
  return {order:null,file:"canonical-index-"+index};
}
function problem(e){
  const r=root(e);
  if(!Array.isArray(r?.pieces)||!r.pieces.length)throw new Error("missing pieces");
  const width=num(r.panel?.width,r.stock_width,r.stockWidth,r.board_width,r.boardWidth);
  const height=num(r.panel?.height,r.stock_height,r.stockHeight,r.board_height,r.boardHeight);
  if(!(width>0&&height>0))throw new Error("invalid stock");
  const saw=num(r.kerf,r.saw,r.sierra,4.5);
  const trimX=num(r.trim?.x,r.trim_x,r.trimX,r.refiladoX,0);
  const trimY=num(r.trim?.y,r.trim_y,r.trimY,r.refiladoY,0);
  const directional=r.material?.hasGrain===true||Boolean(r.directional??r.directional_input??r.materialConVeta??r.has_grain)||r.pieces.some(p=>p.grain===true||p.veta===true||p.rotationAllowed===false);
  const lines=r.pieces.map((p,i)=>({
    base:num(p.base,p.width),altura:num(p.altura,p.height),cant:num(p.cant,p.quantity,1),
    veta:Boolean(p.veta??p.grain??(p.rotationAllowed===false)),
    ref:p.ref??p.reference??i,detalle:p.detalle??p.description??"",cantos:p.cantos??null
  }));
  if(lines.some(l=>!(l.base>0&&l.altura>0&&l.cant>0)))throw new Error("invalid piece");
  return {
    width,height,saw,trimX,trimY,directional,lines,
    pieces:lines.reduce((s,l)=>s+l.cant,0),types:lines.length,
    sourceFormat:String(r.source_format??e?.source_format??"").toLowerCase(),
    referencePanels:num(r.reference_panels,e?.reference_panels),
    structuralFp:r.structural_fp??e?.structural_fp??null,
  };
}
function config(p){
  return {
    placaBase:p.width,placaAltura:p.height,refiladoX:p.trimX,refiladoY:p.trimY,
    sierra:p.saw,etapas:4,materialConVeta:Boolean(p.directional),
    descontarCanto:false,cantoEspesor:0,restoMin:250,restoMax:400,
    usarOneBoard:true,usarMaster:true,usarMultiSlice:true,usarCompactacion:true,
    usarRustPatternGenerator:true,usarCache:false,maxPiezasCache:0,
    rondasPatrones:40,msMaster:8000,maxNodosMaster:1600000,watchdogMasterMs:12000,
    usarCotaBarataPostCompactacion:true,usarDffFs0PostCompactacion:true,
    usarMascarasUnicasMasterLe4:true,minPiezasMultiSliceExperimental:200,
    maxPiezasMultiSliceExperimental:500,masterIndustrialRulesV3Experimental:true
  };
}
function timed(fn){
  const t=process.hrtime.bigint(),cpu0=process.cpuUsage();
  try{
    const value=fn(),d=process.cpuUsage(cpu0);
    return {ok:true,value,wallMs:Number(process.hrtime.bigint()-t)/1e6,cpuMs:(d.user+d.system)/1000,error:null};
  }catch(e){
    const d=process.cpuUsage(cpu0);
    return {ok:false,value:null,wallMs:Number(process.hrtime.bigint()-t)/1e6,cpuMs:(d.user+d.system)/1000,error:String(e?.stack||e)};
  }
}
const cmp=(a,b)=>a<b?-1:a>b?1:0;
function quality(plan,cfg){return calidadPlanPlacas(plan?.placas||[],plan?.opts||cfg);}
function segment(boards){
  if(!(boards>0))return "unknown";
  if(boards<=10)return "furniture-1-10";
  if(boards<=30)return "project-11-30";
  return "batch-gt30";
}
function quant(xs,p){const a=xs.filter(Number.isFinite).slice().sort((a,b)=>a-b);if(!a.length)return null;const pos=(a.length-1)*p,l=Math.floor(pos),h=Math.ceil(pos);return l===h?a[l]:a[l]+(a[h]-a[l])*(pos-l);}
function summarize(rows){
  const valid=rows.filter(r=>r.validV1&&r.validV2),same=valid.filter(r=>r.boardCmp===0),wins=valid.filter(r=>r.boardCmp<0),losses=valid.filter(r=>r.boardCmp>0);
  const sum=xs=>xs.reduce((s,x)=>s+(Number.isFinite(x)?x:0),0);
  const v1Wall=sum(valid.map(r=>r.v1WallMs)),v2Wall=sum(valid.map(r=>r.v2WallMs));
  return {
    cases:rows.length,valid:valid.length,invalid:rows.length-valid.length,
    v2Attempted:rows.filter(r=>r.structuralAttempted).length,
    shortCircuit:rows.filter(r=>r.shortCircuit).length,
    boardWins:wins.length,boardLosses:losses.length,
    boardsSaved:wins.reduce((s,r)=>s+(r.v1Boards-r.v2Boards),0),
    boardsLost:losses.reduce((s,r)=>s+(r.v2Boards-r.v1Boards),0),
    remnantWorse:same.filter(r=>r.qualityCmp<0).length,
    remnantEqual:same.filter(r=>r.qualityCmp===0).length,
    remnantBetter:same.filter(r=>r.qualityCmp>0).length,
    wall:{v1TotalMs:v1Wall,v2TotalMs:v2Wall,savingPct:v1Wall?100*(1-v2Wall/v1Wall):null,
      v1P50:quant(valid.map(r=>r.v1WallMs),.5),v2P50:quant(valid.map(r=>r.v2WallMs),.5),
      v1P95:quant(valid.map(r=>r.v1WallMs),.95),v2P95:quant(valid.map(r=>r.v2WallMs),.95),
      v1P99:quant(valid.map(r=>r.v1WallMs),.99),v2P99:quant(valid.map(r=>r.v2WallMs),.99)},
    cpu:{v1TotalMs:sum(valid.map(r=>r.v1CpuMs)),v2TotalMs:sum(valid.map(r=>r.v2CpuMs))}
  };
}
function projectLeptonSummary(rows){
  const p=rows.filter(r=>r.sourceFormat==="project"&&Number.isFinite(r.referencePanels)&&r.validV2);
  return {
    cases:p.length,
    better:p.filter(r=>r.v2Boards<r.referencePanels).length,
    equal:p.filter(r=>r.v2Boards===r.referencePanels).length,
    worse:p.filter(r=>r.v2Boards>r.referencePanels).length,
    netBoards:p.reduce((s,r)=>s+(r.referencePanels-r.v2Boards),0),
  };
}

if(MODE==="shard"){
  const corpus=loadCorpus();
  const rows=[];
  let parseInvalid=0,eligibleTotal=0,assignedEligible=0;
  for(let i=0;i<corpus.length;i++){
    let p;try{p=problem(corpus[i]);}catch{parseInvalid++;continue;}
    const g=repetitionGate(p.lines.map((l,j)=>({...l,ref:j})));
    if(!g.eligible)continue;
    eligibleTotal++;
    if((eligibleTotal-1)%SHARD_TOTAL!==SHARD_INDEX)continue;
    assignedEligible++;
    const id=identity(corpus[i],i),cfg1=config(p),cfg2=config(p),expected=p.pieces;

    // Alternate order by canonical index to reduce systematic warm/order bias.
    let a,b;
    if(i%2===0){
      a=timed(()=>runFrozenV10(p.lines,cfg1));
      b=timed(()=>runMasterStructuralShortCircuitV2(p.lines,cfg2));
    }else{
      b=timed(()=>runMasterStructuralShortCircuitV2(p.lines,cfg2));
      a=timed(()=>runFrozenV10(p.lines,cfg1));
    }

    const p1=a.value?.plan,p2=b.value?.plan;
    const v1=Boolean(a.ok&&p1&&validarPlanIndustrial(p1,expected)?.ok);
    const v2=Boolean(b.ok&&p2&&validarPlanIndustrial(p2,expected)?.ok);
    const b1=p1?.resumen?.placas??Infinity,b2=p2?.resumen?.placas??Infinity;
    const boardCmp=cmp(b2,b1);
    const qualityCmp=v1&&v2&&boardCmp===0?compararCalidad(quality(p2,cfg2),quality(p1,cfg1)):null;
    const sm=b.value?.structuralMaster||{};
    rows.push({
      ...id,canonicalIndex:i,sourceFormat:p.sourceFormat,referencePanels:p.referencePanels,
      structuralFp:p.structuralFp,pieces:p.pieces,typeCount:p.types,gcd:g.gcd,
      segmentV1:segment(Number.isFinite(b1)?b1:null),
      validV1:v1,validV2:v2,v1Boards:Number.isFinite(b1)?b1:null,v2Boards:Number.isFinite(b2)?b2:null,
      boardCmp,qualityCmp,
      structuralAttempted:Boolean(sm.attempted),shortCircuit:Boolean(sm.shortCircuit),
      structuralBoards:sm.boards??null,structuralLB:sm.lb??null,structuralTests:sm.tests??0,structuralMs:sm.ms??0,
      v1WallMs:a.wallMs,v2WallMs:b.wallMs,v1CpuMs:a.cpuMs,v2CpuMs:b.cpuMs,
      errorV1:a.error,errorV2:b.error
    });
  }
  const out={schema:"motor-beta-v2-historical-shard-v1",shard:SHARD_INDEX,shardTotal:SHARD_TOTAL,corpusCases:corpus.length,parseInvalid,eligibleTotal,assignedEligible,rows};
  fs.writeFileSync(path.join(__dirname,`motor-beta-v2-historical-shard-${SHARD_INDEX}.json`),JSON.stringify(out)+"\n");
  console.log("HIST_V2_SHARD "+JSON.stringify({shard:SHARD_INDEX,eligibleTotal,assignedEligible,summary:summarize(rows)}));
}else if(MODE==="report"){
  const files=fs.readdirSync(__dirname).filter(x=>/^motor-beta-v2-historical-shard-\d+\.json$/.test(x));
  if(files.length!==SHARD_TOTAL)throw new Error(`expected ${SHARD_TOTAL} shards got ${files.length}`);
  const data=files.map(f=>JSON.parse(fs.readFileSync(path.join(__dirname,f),"utf8")));
  const rows=data.flatMap(x=>x.rows||[]).sort((a,b)=>a.canonicalIndex-b.canonicalIndex);
  const eligibleTotal=data[0]?.eligibleTotal??rows.length;
  const overall=summarize(rows);
  const bySegment={};
  for(const s of ["furniture-1-10","project-11-30","batch-gt30","unknown"])bySegment[s]=summarize(rows.filter(r=>r.segmentV1===s));
  const failures=rows.filter(r=>!r.validV1||!r.validV2||r.boardCmp>0||(r.boardCmp===0&&r.qualityCmp<0));
  const wins=rows.filter(r=>r.boardCmp<0);
  const result={
    schema:"motor-beta-v2-historical-result-v1",
    status:failures.length===0?"QUALITY_PASS":"FAIL",
    corpusCases:data[0]?.corpusCases??null,
    parseInvalid:data[0]?.parseInvalid??null,
    eligibleTotal,overall,bySegment,
    projectLepton:projectLeptonSummary(rows),
    failures,wins,
    note:"Timing is sharded one-shot with alternating arm order. Use as broad telemetry, not the sole promotion performance metric."
  };
  fs.writeFileSync(path.join(__dirname,"MOTOR_BETA_V2_HISTORICAL_RESULT.json"),JSON.stringify(result,null,2)+"\n");
  console.log("HIST_V2_RESULT "+JSON.stringify({status:result.status,eligibleTotal,overall,bySegment,projectLepton:result.projectLepton,wins:wins.length,failures:failures.length}));
  if(failures.length)process.exitCode=2;
}else throw new Error("mode shard|report");
})().catch(e=>{console.error(e);process.exitCode=2;});

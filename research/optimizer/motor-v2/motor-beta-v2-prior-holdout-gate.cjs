"use strict";
(async()=>{
const fs=require("node:fs");
const path=require("node:path");
const zlib=require("node:zlib");
const {pathToFileURL}=require("node:url");

const ROOT=path.resolve(__dirname,"../../..");
const FIX=path.join(ROOT,"research/optimizer/motor-v2/fixtures/HOLDOUT1_V2_ELIGIBLE.json.gz.b64");
const SHARD_INDEX=Number(process.env.SHARD_INDEX||0);
const SHARD_TOTAL=Number(process.env.SHARD_TOTAL||16);
const MODE=process.argv[2]||"shard";

process.env.OPTIMIZER_RUST_BEAM_RANK_CACHE_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_LEAN_BEAM_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_GREEDY_PLAN_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_LARGE_ROUND_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_SIMPLE_CHOOSE_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_MASTER_ROUND_REUSE_EXPERIMENTAL="0";
process.env.OPTIMIZER_MASTER_UNIQUE_MASKS_LE4_EXPERIMENTAL="1";

const wrapper=await import(pathToFileURL(path.join(ROOT,"research/optimizer/motor-v2/master-structural-shortcircuit-v2.mjs")).href);
const {
  runMasterStructuralShortCircuitV2,runFrozenV10,validarPlanIndustrial,
  calidadPlanPlacas,compararCalidad
}=wrapper;

function loadFixture(){
  const b64=fs.readFileSync(FIX,"utf8").trim();
  return JSON.parse(zlib.gunzipSync(Buffer.from(b64,"base64")).toString("utf8"));
}
function lines(c){return c.types.map((t,i)=>({base:+t.w,altura:+t.h,cant:+t.q,veta:false,canRotate:true,ref:String(i),detalle:`H1-${c.id}-${i}`,cantos:null}));}
function config(c){
  return {
    placaBase:+c.board[0],placaAltura:+c.board[1],refiladoX:0,refiladoY:0,sierra:+c.saw,
    etapas:4,materialConVeta:false,descontarCanto:false,cantoEspesor:0,restoMin:250,restoMax:400,
    usarOneBoard:true,usarMaster:true,usarMultiSlice:true,usarCompactacion:true,usarRustPatternGenerator:true,
    usarCache:false,maxPiezasCache:0,rondasPatrones:40,msMaster:8000,maxNodosMaster:1600000,watchdogMasterMs:12000,
    usarCotaBarataPostCompactacion:true,usarDffFs0PostCompactacion:true,usarMascarasUnicasMasterLe4:true,
    minPiezasMultiSliceExperimental:200,maxPiezasMultiSliceExperimental:500,masterIndustrialRulesV3Experimental:true
  };
}
function timed(fn){
  const t=process.hrtime.bigint(),c0=process.cpuUsage();
  try{
    const value=fn(),d=process.cpuUsage(c0);
    return {ok:true,value,wallMs:Number(process.hrtime.bigint()-t)/1e6,cpuMs:(d.user+d.system)/1000,error:null};
  }catch(e){
    const d=process.cpuUsage(c0);
    return {ok:false,value:null,wallMs:Number(process.hrtime.bigint()-t)/1e6,cpuMs:(d.user+d.system)/1000,error:String(e?.stack||e)};
  }
}
const cmp=(a,b)=>a<b?-1:a>b?1:0;
const quality=(p,cfg)=>calidadPlanPlacas(p?.placas||[],p?.opts||cfg);
const segment=b=>b<=10?"furniture-1-10":b<=30?"project-11-30":"batch-gt30";
function quant(xs,p){const a=xs.filter(Number.isFinite).slice().sort((a,b)=>a-b);if(!a.length)return null;const pos=(a.length-1)*p,l=Math.floor(pos),h=Math.ceil(pos);return l===h?a[l]:a[l]+(a[h]-a[l])*(pos-l);}
function summarize(rows){
  const valid=rows.filter(r=>r.validV1&&r.validV2),same=valid.filter(r=>r.boardCmp===0),wins=valid.filter(r=>r.boardCmp<0),losses=valid.filter(r=>r.boardCmp>0);
  const sum=xs=>xs.reduce((s,x)=>s+(Number.isFinite(x)?x:0),0);
  const a=sum(valid.map(r=>r.v1WallMs)),b=sum(valid.map(r=>r.v2WallMs));
  return {
    cases:rows.length,valid:valid.length,invalid:rows.length-valid.length,
    attempted:valid.filter(r=>r.structuralAttempted).length,shortCircuit:valid.filter(r=>r.shortCircuit).length,
    boardWins:wins.length,boardLosses:losses.length,
    boardsSaved:wins.reduce((s,r)=>s+r.v1Boards-r.v2Boards,0),
    boardsLost:losses.reduce((s,r)=>s+r.v2Boards-r.v1Boards,0),
    remnantWorse:same.filter(r=>r.qualityCmp<0).length,
    remnantEqual:same.filter(r=>r.qualityCmp===0).length,
    remnantBetter:same.filter(r=>r.qualityCmp>0).length,
    wall:{v1TotalMs:a,v2TotalMs:b,savingPct:a?100*(1-b/a):null,
      v1P50:quant(valid.map(r=>r.v1WallMs),.5),v2P50:quant(valid.map(r=>r.v2WallMs),.5),
      v1P95:quant(valid.map(r=>r.v1WallMs),.95),v2P95:quant(valid.map(r=>r.v2WallMs),.95),
      v1P99:quant(valid.map(r=>r.v1WallMs),.99),v2P99:quant(valid.map(r=>r.v2WallMs),.99)},
    lepton:{better:valid.filter(r=>r.v2Boards<r.leptonBoards).length,equal:valid.filter(r=>r.v2Boards===r.leptonBoards).length,worse:valid.filter(r=>r.v2Boards>r.leptonBoards).length,
      netBoards:valid.reduce((s,r)=>s+r.leptonBoards-r.v2Boards,0)}
  };
}

if(MODE==="shard"){
  const all=loadFixture();
  const cases=all.filter((_,i)=>i%SHARD_TOTAL===SHARD_INDEX);
  const rows=[];
  for(let ix=0;ix<cases.length;ix++){
    const c=cases[ix],L=lines(c),C1=config(c),C2=config(c),expected=L.reduce((s,x)=>s+x.cant,0);
    let a,b;
    // Alternate arm order by stable order id parity.
    if((+c.id||0)%2===0){
      a=timed(()=>runFrozenV10(L,C1)); b=timed(()=>runMasterStructuralShortCircuitV2(L,C2));
    }else{
      b=timed(()=>runMasterStructuralShortCircuitV2(L,C2)); a=timed(()=>runFrozenV10(L,C1));
    }
    const p1=a.value?.plan,p2=b.value?.plan;
    const v1=Boolean(a.ok&&p1&&validarPlanIndustrial(p1,expected)?.ok),v2=Boolean(b.ok&&p2&&validarPlanIndustrial(p2,expected)?.ok);
    const b1=p1?.resumen?.placas??Infinity,b2=p2?.resumen?.placas??Infinity,boardCmp=cmp(b2,b1);
    const qualityCmp=v1&&v2&&boardCmp===0?compararCalidad(quality(p2,C2),quality(p1,C1)):null;
    const sm=b.value?.structuralMaster||{};
    rows.push({
      id:c.id,pieces:expected,typeCount:L.length,gcd:c.gcd,leptonBoards:+c.lepton,segment:segment(+c.lepton),
      validV1:v1,validV2:v2,v1Boards:Number.isFinite(b1)?b1:null,v2Boards:Number.isFinite(b2)?b2:null,
      boardCmp,qualityCmp,structuralAttempted:Boolean(sm.attempted),shortCircuit:Boolean(sm.shortCircuit),
      structuralBoards:sm.boards??null,structuralLB:sm.lb??null,structuralTests:sm.tests??0,structuralMs:sm.ms??0,
      v1WallMs:a.wallMs,v2WallMs:b.wallMs,v1CpuMs:a.cpuMs,v2CpuMs:b.cpuMs,errorV1:a.error,errorV2:b.error
    });
  }
  fs.writeFileSync(path.join(__dirname,`motor-beta-v2-prior-holdout-shard-${SHARD_INDEX}.json`),JSON.stringify({shard:SHARD_INDEX,shardTotal:SHARD_TOTAL,eligibleTotal:all.length,rows})+"\n");
  console.log("PRIOR_HOLDOUT_SHARD "+JSON.stringify({shard:SHARD_INDEX,cases:rows.length,summary:summarize(rows)}));
}else if(MODE==="report"){
  const files=fs.readdirSync(__dirname).filter(x=>/^motor-beta-v2-prior-holdout-shard-\d+\.json$/.test(x));
  if(files.length!==SHARD_TOTAL)throw new Error(`expected ${SHARD_TOTAL} shards got ${files.length}`);
  const rows=files.flatMap(f=>JSON.parse(fs.readFileSync(path.join(__dirname,f),"utf8")).rows||[]).sort((a,b)=>a.id-b.id);
  const overall=summarize(rows),bySegment={};
  for(const s of ["furniture-1-10","project-11-30","batch-gt30"])bySegment[s]=summarize(rows.filter(r=>r.segment===s));
  const failures=rows.filter(r=>!r.validV1||!r.validV2||r.boardCmp>0||(r.boardCmp===0&&r.qualityCmp<0));
  const wins=rows.filter(r=>r.boardCmp<0);
  const out={
    schema:"motor-beta-v2-prior-holdout-result-v1",
    status:failures.length?"FAIL":"QUALITY_PASS",
    rawXml:13842,validCanonical:13839,excludedMixedBoardFormats:3,eligibleTotal:rows.length,
    normalizedEligibleSha256:"73166ff726b9aa631fc05191fc30dbb8b6cfe4a10f7da56a85292a80055b4421",
    overall,bySegment,failures,wins,
    note:"External project XML geometry envelope only; no app-level canRotate claim. Timing is one-shot sharded with alternating arm order."
  };
  fs.writeFileSync(path.join(__dirname,"MOTOR_BETA_V2_PRIOR_HOLDOUT_RESULT.json"),JSON.stringify(out,null,2)+"\n");
  console.log("PRIOR_HOLDOUT_RESULT "+JSON.stringify({status:out.status,overall,bySegment,wins:wins.length,failures:failures.length}));
  if(failures.length)process.exitCode=2;
}else throw new Error("mode");
})().catch(e=>{console.error(e);process.exitCode=2;});

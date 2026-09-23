"use strict";

const fs=require("node:fs");
const path=require("node:path");
const zlib=require("node:zlib");

const ROOT=path.resolve(__dirname,"../../..");
const FIX=path.join(ROOT,"research/optimizer/holdout-v2-fixture");
const SHARD_INDEX=Number(process.env.SHARD_INDEX||0);
const SHARD_TOTAL=Number(process.env.SHARD_TOTAL||5);
const MODE=process.argv[2]||"shard";
const CAPS=(process.env.AUTO_CHECKPOINT_CAPS||"500,1000,2000,4000,8000,12000")
  .split(",").map(Number).filter(x=>Number.isFinite(x)&&x>0);

const MASTER_IDS=new Set([
5440200,5521519,5486683,5504346,5526822,5434851,5449324,5434892,5532387,5449237,
5436342,5531188,5524764,5530912,5441042,5493322,5449630,5461664,5461490,5486436,
5503143,5482541,5441129,5502830,5526845,5442562,5514476,5432432,5449625,5504203,
5491085,5451086,5474506,5479071,5487953,5452518,5487382,5487973,5492016,5515640,
5507478,5532153,5444375,5503134,5455574,5447933,5515343,5531829,5526837,5448188
]);

process.env.OPTIMIZER_RUST_BEAM_RANK_CACHE_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_LEAN_BEAM_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_GREEDY_PLAN_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_LARGE_ROUND_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_SIMPLE_CHOOSE_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_MASTER_ROUND_REUSE_EXPERIMENTAL="0";
process.env.OPTIMIZER_MASTER_UNIQUE_MASKS_LE4_EXPERIMENTAL="1";

const {optimizarV10,nuevasMetricas,validarPlanIndustrial}=require(path.join(ROOT,"src/lib/optimizer/legacy/v10.cjs"));
const {calidadPlanPlacas,compararCalidad}=require(path.join(ROOT,"src/lib/optimizer/legacy/motor.cjs"));

function decodeFixture(){
  const b64=[0,1,2,3].map(i=>fs.readFileSync(path.join(FIX,`part-0${i}.b64`),"utf8").trim()).join("");
  const b=zlib.brotliDecompressSync(Buffer.from(b64,"base64")); let p=5;
  if(b.subarray(0,5).toString()!=="MDFV1")throw new Error("bad fixture");
  function v(){let n=0,s=0;for(;;){const x=b[p++];n+=(x&127)*2**s;if(!(x&128))return n;s+=7;}}
  const n=v(),out=[];let last=0;
  for(let k=0;k<n;k++){const id=last+v();last=id;const width=v()/10,height=v()/10,saw=v()/10,leptonBoards=v(),tc=v(),types=[];
    for(let j=0;j<tc;j++)types.push({w:v()/10,h:v()/10,q:v()});
    if(MASTER_IDS.has(id))out.push({id,width,height,saw,leptonBoards,types});
  }
  return out;
}
function lines(c){return c.types.map((t,i)=>({base:t.w,altura:t.h,cant:t.q,veta:false,canRotate:true,ref:String(i),detalle:`CAL-${c.id}-${i}`,cantos:null}));}
function config(c,mode,cap){
  const x={placaBase:c.width,placaAltura:c.height,refiladoX:0,refiladoY:0,sierra:c.saw,etapas:4,
    materialConVeta:false,descontarCanto:false,cantoEspesor:0,restoMin:250,restoMax:400,
    usarOneBoard:true,usarMaster:true,usarMultiSlice:true,usarCompactacion:true,usarRustPatternGenerator:true,
    usarCache:false,maxPiezasCache:0,rondasPatrones:40,msMaster:8000,maxNodosMaster:1600000,watchdogMasterMs:12000,
    usarCotaBarataPostCompactacion:true,usarDffFs0PostCompactacion:true,usarMascarasUnicasMasterLe4:true,
    minPiezasMultiSliceExperimental:200,maxPiezasMultiSliceExperimental:500,
    masterIndustrialRulesV3Experimental:true,masterStructuralV2:true};
  if(mode==="auto"){x.autoEffortController=true;x.autoCheckpointMaxNodes=cap;}
  if(mode==="advanced")x.masterForceFull40=true;
  return x;
}
function timed(fn){const t=process.hrtime.bigint(),c0=process.cpuUsage();try{const value=fn(),d=process.cpuUsage(c0);return {ok:true,value,wallMs:Number(process.hrtime.bigint()-t)/1e6,cpuMs:(d.user+d.system)/1000};}catch(e){const d=process.cpuUsage(c0);return {ok:false,value:null,wallMs:Number(process.hrtime.bigint()-t)/1e6,cpuMs:(d.user+d.system)/1000,error:String(e?.stack||e)};}}
const quality=(p,c)=>calidadPlanPlacas(p?.placas||[],p?.opts||c);
const cmp=(a,b)=>a<b?-1:a>b?1:0;

if(MODE==="shard"){
  const cases=decodeFixture().sort((a,b)=>a.id-b.id).filter((_,i)=>i%SHARD_TOTAL===SHARD_INDEX);
  const rows=[];
  for(const c of cases){
    const L=lines(c),expected=L.reduce((s,x)=>s+x.cant,0),advC=config(c,"advanced");
    const adv=timed(()=>optimizarV10(L,advC,nuevasMetricas()));
    const advP=adv.value?.plan,advValid=Boolean(adv.ok&&advP&&validarPlanIndustrial(advP,expected)?.ok);
    const advBoards=advP?.resumen?.placas??Infinity,advQ=advValid?quality(advP,advC):null;
    for(const cap of CAPS){
      const autoC=config(c,"auto",cap);
      const a=timed(()=>optimizarV10(L,autoC,nuevasMetricas()));
      const p=a.value?.plan,valid=Boolean(a.ok&&p&&validarPlanIndustrial(p,expected)?.ok);
      const boards=p?.resumen?.placas??Infinity;
      const ec=a.value?.metricas?.effortController||{};
      const blocks=Array.isArray(ec.blocks)?ec.blocks:[];
      const firstSolved=blocks.find(b=>b?.solved===true);
      rows.push({id:c.id,cap,validAdvanced:advValid,validAuto:valid,
        advancedBoards:Number.isFinite(advBoards)?advBoards:null,autoBoards:Number.isFinite(boards)?boards:null,
        boardCmp:cmp(boards,advBoards),
        qualityCmp:valid&&advValid&&boards===advBoards?compararCalidad(quality(p,autoC),advQ):null,
        autoWallMs:a.wallMs,autoCpuMs:a.cpuMs,advancedWallMs:adv.wallMs,advancedCpuMs:adv.cpuMs,
        rounds:ec.roundsExecuted??0,stopReason:ec.stopReason??null,
        firstSolveNodes:firstSolved?.solverNodes??null,firstSolveTargetReached:firstSolved?.solverTargetReached??false,
        error:a.error||null});
    }
  }
  const file=path.join(__dirname,`checkpoint-calibration-shard-${SHARD_INDEX}.json`);
  fs.writeFileSync(file,JSON.stringify({shard:SHARD_INDEX,shardTotal:SHARD_TOTAL,caps:CAPS,rows})+"\n");
  console.log("AUTO_CHECKPOINT_CAL_SHARD "+JSON.stringify({shard:SHARD_INDEX,cases:cases.length,rows:rows.length}));
}else if(MODE==="report"){
  const files=fs.readdirSync(__dirname).filter(x=>/^checkpoint-calibration-shard-\d+\.json$/.test(x));
  if(files.length!==SHARD_TOTAL)throw new Error(`expected ${SHARD_TOTAL} shards got ${files.length}`);
  const rows=files.flatMap(f=>JSON.parse(fs.readFileSync(path.join(__dirname,f),"utf8")).rows||[]);
  const summary=[];
  for(const cap of CAPS){
    const xs=rows.filter(r=>r.cap===cap);
    const valid=xs.filter(r=>r.validAuto&&r.validAdvanced);
    const same=valid.filter(r=>r.boardCmp===0);
    const wall=valid.reduce((s,r)=>s+r.autoWallMs,0),advWall=valid.reduce((s,r)=>s+r.advancedWallMs,0);
    const cpu=valid.reduce((s,r)=>s+r.autoCpuMs,0),advCpu=valid.reduce((s,r)=>s+r.advancedCpuMs,0);
    summary.push({cap,cases:xs.length,invalid:xs.length-valid.length,
      boardLosses:valid.filter(r=>r.boardCmp>0).length,
      remnantWorse:same.filter(r=>r.qualityCmp<0).length,
      earlyStops:valid.filter(r=>r.rounds<40).length,
      safeLbStops:valid.filter(r=>r.stopReason==="safe-lb").length,
      structuralStops:valid.filter(r=>r.stopReason==="structural-safe-lb").length,
      firstSolveTargetReached:valid.filter(r=>r.firstSolveTargetReached).length,
      firstSolveNodesMax:Math.max(0,...valid.map(r=>Number(r.firstSolveNodes)||0)),
      wallMs:wall,advancedWallMs:advWall,wallSavingPct:advWall?100*(1-wall/advWall):null,
      cpuMs:cpu,advancedCpuMs:advCpu,cpuSavingPct:advCpu?100*(1-cpu/advCpu):null});
  }
  const safe=summary.filter(x=>x.invalid===0&&x.boardLosses===0&&x.remnantWorse===0);
  const best=safe.slice().sort((a,b)=>b.cpuSavingPct-a.cpuSavingPct||b.wallSavingPct-a.wallSavingPct)[0]||null;
  const out={schema:"optimizer-auto-checkpoint-calibration-v1",status:best?"PASS":"FAIL",summary,best};
  fs.writeFileSync(path.join(__dirname,"AUTO_CHECKPOINT_CALIBRATION_RESULT.json"),JSON.stringify(out,null,2)+"\n");
  console.log("AUTO_CHECKPOINT_CAL_RESULT "+JSON.stringify(out));
  if(!best)process.exitCode=2;
}else throw new Error("mode shard|report");

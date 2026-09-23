"use strict";

const fs=require("node:fs");
const path=require("node:path");
const zlib=require("node:zlib");

const ROOT=path.resolve(__dirname,"../../..");
const FIX=path.join(ROOT,"research/optimizer/holdout-v2-fixture");
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

const {optimizarV10,nuevasMetricas,validarPlanIndustrial}=require(path.join(ROOT,"src/lib/optimizer/legacy/v10.cjs"));
const {calidadPlanPlacas,compararCalidad}=require(path.join(ROOT,"src/lib/optimizer/legacy/motor.cjs"));
const {repetitionGate}=require(path.join(ROOT,"src/lib/optimizer/experimental/structural-repetition-rescue-v2.cjs"));

function decodeFixture(){
  const b64=[0,1,2,3].map(i=>fs.readFileSync(path.join(FIX,`part-0${i}.b64`),"utf8").trim()).join("");
  const b=zlib.brotliDecompressSync(Buffer.from(b64,"base64"));
  let p=5;
  if(b.subarray(0,5).toString()!=="MDFV1")throw new Error("bad fixture");
  function v(){let n=0,s=0;for(;;){const x=b[p++];n+=(x&127)*2**s;if(!(x&128))return n;s+=7;}}
  const n=v(),out=[];let last=0;
  for(let k=0;k<n;k++){
    const id=last+v();last=id;
    const width=v()/10,height=v()/10,saw=v()/10,leptonBoards=v(),tc=v(),types=[];
    for(let j=0;j<tc;j++)types.push({w:v()/10,h:v()/10,q:v()});
    out.push({id,width,height,saw,leptonBoards,types});
  }
  return out;
}
function lines(c){
  return c.types.map((t,i)=>({
    base:t.w,altura:t.h,cant:t.q,veta:false,canRotate:true,
    ref:String(i),detalle:`PROD-V2-${c.id}-${i}`,cantos:null
  }));
}
function config(c,enabled){
  return {
    placaBase:c.width,placaAltura:c.height,refiladoX:0,refiladoY:0,sierra:c.saw,etapas:4,
    materialConVeta:false,descontarCanto:false,cantoEspesor:0,restoMin:250,restoMax:400,
    usarOneBoard:true,usarMaster:true,usarMultiSlice:true,usarCompactacion:true,
    usarRustPatternGenerator:true,usarCache:false,maxPiezasCache:0,
    rondasPatrones:40,msMaster:8000,maxNodosMaster:1600000,watchdogMasterMs:12000,
    usarCotaBarataPostCompactacion:true,usarDffFs0PostCompactacion:true,
    usarMascarasUnicasMasterLe4:true,minPiezasMultiSliceExperimental:200,
    maxPiezasMultiSliceExperimental:500,masterIndustrialRulesV3Experimental:true,
    masterStructuralV2:enabled
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
const quality=(p,c)=>calidadPlanPlacas(p?.placas||[],p?.opts||c);
function quant(xs,p){const a=xs.filter(Number.isFinite).slice().sort((x,y)=>x-y);if(!a.length)return null;const pos=(a.length-1)*p,l=Math.floor(pos),h=Math.ceil(pos);return l===h?a[l]:a[l]+(a[h]-a[l])*(pos-l);}
function summarize(rows){
  const valid=rows.filter(r=>r.validV1&&r.validV2),same=valid.filter(r=>r.boardCmp===0),wins=valid.filter(r=>r.boardCmp<0),losses=valid.filter(r=>r.boardCmp>0);
  const sum=xs=>xs.reduce((s,x)=>s+(Number.isFinite(x)?x:0),0);
  const a=sum(valid.map(r=>r.v1WallMs)),b=sum(valid.map(r=>r.v2WallMs));
  return {
    cases:rows.length,valid:valid.length,invalid:rows.length-valid.length,
    shortCircuit:valid.filter(r=>r.shortCircuit).length,
    boardWins:wins.length,boardLosses:losses.length,
    boardsSaved:wins.reduce((s,r)=>s+r.v1Boards-r.v2Boards,0),
    remnantWorse:same.filter(r=>r.qualityCmp<0).length,
    remnantEqual:same.filter(r=>r.qualityCmp===0).length,
    remnantBetter:same.filter(r=>r.qualityCmp>0).length,
    wall:{v1TotalMs:a,v2TotalMs:b,savingPct:a?100*(1-b/a):null,
      v1P50:quant(valid.map(r=>r.v1WallMs),.5),v2P50:quant(valid.map(r=>r.v2WallMs),.5),
      v1P95:quant(valid.map(r=>r.v1WallMs),.95),v2P95:quant(valid.map(r=>r.v2WallMs),.95),
      v1P99:quant(valid.map(r=>r.v1WallMs),.99),v2P99:quant(valid.map(r=>r.v2WallMs),.99)}
  };
}

if(MODE==="shard"){
  const all=decodeFixture();
  const eligible=all.filter(c=>repetitionGate(lines(c).map((l,i)=>({...l,ref:i}))).eligible);
  const cases=eligible.filter((_,i)=>i%SHARD_TOTAL===SHARD_INDEX);
  const rows=[];
  for(const c of cases){
    const L=lines(c),expected=L.reduce((s,x)=>s+x.cant,0),C1=config(c,false),C2=config(c,true);
    let a,b;
    if(c.id%2===0){
      a=timed(()=>optimizarV10(L,C1,nuevasMetricas()));
      b=timed(()=>optimizarV10(L,C2,nuevasMetricas()));
    }else{
      b=timed(()=>optimizarV10(L,C2,nuevasMetricas()));
      a=timed(()=>optimizarV10(L,C1,nuevasMetricas()));
    }
    const p1=a.value?.plan,p2=b.value?.plan;
    const v1=Boolean(a.ok&&p1&&validarPlanIndustrial(p1,expected)?.ok);
    const v2=Boolean(b.ok&&p2&&validarPlanIndustrial(p2,expected)?.ok);
    const n1=p1?.resumen?.placas??Infinity,n2=p2?.resumen?.placas??Infinity,boardCmp=cmp(n2,n1);
    const qualityCmp=v1&&v2&&boardCmp===0?compararCalidad(quality(p2,C2),quality(p1,C1)):null;
    rows.push({
      id:c.id,leptonBoards:c.leptonBoards,pieces:expected,typeCount:L.length,
      validV1:v1,validV2:v2,v1Boards:Number.isFinite(n1)?n1:null,v2Boards:Number.isFinite(n2)?n2:null,
      boardCmp,qualityCmp,shortCircuit:Boolean(p2?.opts?.masterStructuralV2)&&n2<n1,
      v1WallMs:a.wallMs,v2WallMs:b.wallMs,v1CpuMs:a.cpuMs,v2CpuMs:b.cpuMs,errorV1:a.error,errorV2:b.error
    });
  }
  fs.writeFileSync(path.join(__dirname,`motor-beta-v2-runtime-shard-${SHARD_INDEX}.json`),JSON.stringify({shard:SHARD_INDEX,shardTotal:SHARD_TOTAL,eligibleTotal:eligible.length,rows})+"\n");
  console.log("MOTOR_V2_RUNTIME_SHARD "+JSON.stringify({shard:SHARD_INDEX,eligibleTotal:eligible.length,summary:summarize(rows)}));
}else if(MODE==="report"){
  const files=fs.readdirSync(__dirname).filter(x=>/^motor-beta-v2-runtime-shard-\d+\.json$/.test(x));
  if(files.length!==SHARD_TOTAL)throw new Error(`expected ${SHARD_TOTAL} shards got ${files.length}`);
  const data=files.map(f=>JSON.parse(fs.readFileSync(path.join(__dirname,f),"utf8")));
  const rows=data.flatMap(x=>x.rows||[]).sort((a,b)=>a.id-b.id);
  const summary=summarize(rows);
  const failures=rows.filter(r=>!r.validV1||!r.validV2||r.boardCmp>0||(r.boardCmp===0&&r.qualityCmp<0));
  const wins=rows.filter(r=>r.boardCmp<0);
  const expectedWins=new Map([[5432432,[4,3]],[5504203,[90,75]]]);
  const missingExpected=[...expectedWins].filter(([id,[v1,v2]])=>!wins.some(r=>r.id===id&&r.v1Boards===v1&&r.v2Boards===v2));
  const status=failures.length===0&&wins.length>=2&&summary.boardsSaved>=16&&missingExpected.length===0?"PASS":"FAIL";
  const out={schema:"motor-beta-v2-production-runtime-gate-v1",status,eligibleTotal:data[0]?.eligibleTotal??rows.length,summary,failures,wins,missingExpected};
  fs.writeFileSync(path.join(__dirname,"MOTOR_BETA_V2_RUNTIME_GATE_RESULT.json"),JSON.stringify(out,null,2)+"\n");
  console.log("MOTOR_V2_RUNTIME_RESULT "+JSON.stringify({status,summary,wins:wins.length,failures:failures.length,missingExpected}));
  if(status!=="PASS")process.exitCode=2;
}else throw new Error("mode shard|report");

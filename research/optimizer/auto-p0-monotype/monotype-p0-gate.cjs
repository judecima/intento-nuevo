"use strict";

const fs=require("node:fs");
const path=require("node:path");
const zlib=require("node:zlib");

const ROOT=path.resolve(__dirname,"../../..");
const FIX=path.join(ROOT,"research/optimizer/holdout-v2-fixture");
const IDS=new Set([5434851,5479071,5487382,5515343,5532153]);

process.env.OPTIMIZER_RUST_BEAM_RANK_CACHE_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_LEAN_BEAM_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_GREEDY_PLAN_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_LARGE_ROUND_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_SIMPLE_CHOOSE_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_MASTER_ROUND_REUSE_EXPERIMENTAL="0";
process.env.OPTIMIZER_MASTER_UNIQUE_MASKS_LE4_EXPERIMENTAL="1";

const {optimizarV10,nuevasMetricas,validarPlanIndustrial}=require(path.join(ROOT,"src/lib/optimizer/legacy/v10.cjs"));
const {optimizar,calidadPlanPlacas,compararCalidad}=require(path.join(ROOT,"src/lib/optimizer/legacy/motor.cjs"));
const {patronesMonotipo}=require(path.join(ROOT,"src/lib/optimizer/legacy/patrones.cjs"));
const {resolverCobertura}=require(path.join(ROOT,"src/lib/optimizer/legacy/cobertura.cjs"));
const {materializar}=require(path.join(ROOT,"src/lib/optimizer/legacy/materializar.cjs"));

function decodeFixture(){
  const b64=[0,1,2,3].map(i=>fs.readFileSync(path.join(FIX,`part-0${i}.b64`),"utf8").trim()).join("");
  const b=zlib.brotliDecompressSync(Buffer.from(b64,"base64"));let p=5;
  if(b.subarray(0,5).toString()!=="MDFV1")throw new Error("bad fixture");
  function v(){let n=0,s=0;for(;;){const x=b[p++];n+=(x&127)*2**s;if(!(x&128))return n;s+=7;}}
  const n=v(),out=[];let last=0;
  for(let k=0;k<n;k++){const id=last+v();last=id;const width=v()/10,height=v()/10,saw=v()/10,leptonBoards=v(),tc=v(),types=[];
    for(let j=0;j<tc;j++)types.push({w:v()/10,h:v()/10,q:v()});
    if(IDS.has(id))out.push({id,width,height,saw,leptonBoards,types});
  }
  return out.sort((a,b)=>a.id-b.id);
}
function lines(c){return c.types.map((t,i)=>({base:t.w,altura:t.h,cant:t.q,veta:false,canRotate:true,ref:String(i),detalle:`P0-${c.id}-${i}`,cantos:null}));}
function config(c,mode){
  const x={placaBase:c.width,placaAltura:c.height,refiladoX:0,refiladoY:0,sierra:c.saw,etapas:4,
    materialConVeta:false,descontarCanto:false,cantoEspesor:0,restoMin:250,restoMax:400,
    usarOneBoard:true,usarMaster:true,usarMultiSlice:true,usarCompactacion:true,usarRustPatternGenerator:true,
    usarCache:false,maxPiezasCache:0,rondasPatrones:40,msMaster:8000,maxNodosMaster:1600000,watchdogMasterMs:12000,
    usarCotaBarataPostCompactacion:true,usarDffFs0PostCompactacion:true,usarMascarasUnicasMasterLe4:true,
    minPiezasMultiSliceExperimental:200,maxPiezasMultiSliceExperimental:500,
    masterIndustrialRulesV3Experimental:true,masterStructuralV2:true};
  if(mode==="auto")x.autoEffortController=true;
  if(mode==="advanced")x.masterForceFull40=true;
  return x;
}
function timed(fn){const t=process.hrtime.bigint(),c0=process.cpuUsage();try{const value=fn(),d=process.cpuUsage(c0);return {ok:true,value,wallMs:Number(process.hrtime.bigint()-t)/1e6,cpuMs:(d.user+d.system)/1000,error:null};}catch(e){const d=process.cpuUsage(c0);return {ok:false,value:null,wallMs:Number(process.hrtime.bigint()-t)/1e6,cpuMs:(d.user+d.system)/1000,error:String(e?.stack||e)};}}
function patternFromBoard(board){
  const n=(board?.colocadas||[]).length;if(!n)return null;
  return {uso:new Map([[0,n]]),area:(board.colocadas||[]).reduce((s,c)=>s+c.base*c.altura,0),placa:board};
}
function p0(lineas,C,opts,safeLB){
  const expected=lineas[0].cant;
  const mono=patronesMonotipo(lineas,C);
  if(mono.length!==1)return {ok:false,reason:"NO_MONO"};
  const full=mono[0],capacity=full.uso.get(0)||0;
  if(capacity<=0)return {ok:false,reason:"NO_CAPACITY"};
  const remainder=expected%capacity;
  const pool=[full];
  if(remainder){
    const partial=optimizar([{...lineas[0],ref:0,cant:remainder}],{
      ...C,pases:1,restartsPorPlaca:1,usarRescue:false,usarMaster:false,
      usarMultiSlice:false,usarCompactacion:false,multiVariantes:false
    });
    if(partial?.resumen?.placas!==1||!partial?.placas?.[0])return {ok:false,reason:"PARTIAL_NOT_ONE_BOARD",capacity,remainder};
    const p=patternFromBoard(partial.placas[0]);if(!p)return {ok:false,reason:"PARTIAL_PATTERN",capacity,remainder};
    pool.push(p);
  }
  const area=(C.placaBase-(C.refiladoX||0))*(C.placaAltura-(C.refiladoY||0));
  const solver=resolverCobertura(pool,[expected],area,Number.MAX_SAFE_INTEGER,500,{maxNodos:128,watchdogMs:1000,targetBoards:safeLB});
  const sol=solver?.resolver([lineas[0].base*lineas[0].altura]);
  if(!sol?.plan)return {ok:false,reason:"NO_COVERAGE",capacity,remainder,nodes:sol?.nodos??null};
  const plan=materializar(sol.plan,lineas,opts);
  const valid=Boolean(plan&&validarPlanIndustrial(plan,expected)?.ok);
  return {ok:valid,reason:valid?"OK":"INVALID",plan,boards:plan?.resumen?.placas??sol.placas,capacity,remainder,nodes:sol.nodos,targetReached:sol.targetReached};
}
const quality=p=>calidadPlanPlacas(p?.placas||[],p?.opts||{});

const rows=[];
for(const c of decodeFixture()){
  const L=lines(c),expected=L[0].cant,Ca=config(c,"advanced"),Cu=config(c,"auto");
  const adv=timed(()=>optimizarV10(L,Ca,nuevasMetricas()));
  const ap=adv.value?.plan,validAdv=Boolean(adv.ok&&ap&&validarPlanIndustrial(ap,expected)?.ok);
  const safeLB=adv.value?.cota??null;
  const current=timed(()=>optimizarV10(L,Cu,nuevasMetricas()));
  const cp=current.value?.plan,validCurrent=Boolean(current.ok&&cp&&validarPlanIndustrial(cp,expected)?.ok);
  const probe=timed(()=>p0(L,Cu,ap?.opts||Cu,safeLB));
  const pp=probe.value?.plan,validP0=Boolean(probe.ok&&probe.value?.ok&&pp&&validarPlanIndustrial(pp,expected)?.ok);
  const boardCmp=validP0&&validAdv?(pp.resumen?.placas??Infinity)-(ap.resumen?.placas??Infinity):null;
  const qualityCmp=validP0&&validAdv&&boardCmp===0?compararCalidad(quality(pp),quality(ap)):null;
  rows.push({id:c.id,pieces:expected,leptonBoards:c.leptonBoards,safeLB,
    advancedBoards:ap?.resumen?.placas??null,currentAutoBoards:cp?.resumen?.placas??null,p0Boards:pp?.resumen?.placas??probe.value?.boards??null,
    validAdvanced:validAdv,validCurrent,validP0,boardCmp,qualityCmp,
    capacity:probe.value?.capacity??null,remainder:probe.value?.remainder??null,p0Nodes:probe.value?.nodes??null,p0Reason:probe.value?.reason??null,
    advancedWallMs:adv.wallMs,currentAutoWallMs:current.wallMs,p0WallMs:probe.wallMs,
    advancedCpuMs:adv.cpuMs,currentAutoCpuMs:current.cpuMs,p0CpuMs:probe.cpuMs,
    p0CanCertify:Boolean(validP0&&probe.value?.boards<=safeLB),errorP0:probe.error});
}
const cert=rows.filter(r=>r.p0CanCertify);
const bad=cert.filter(r=>r.boardCmp>0||r.qualityCmp<0||!r.validP0);
const out={schema:"optimizer-auto-p0-monotype-v1",status:bad.length===0?"PASS":"FAIL",cases:rows.length,
  certifications:cert.length,failures:bad.length,
  currentAutoWallMs:rows.reduce((s,r)=>s+r.currentAutoWallMs,0),
  p0ProbeWallMs:rows.reduce((s,r)=>s+r.p0WallMs,0),
  rows};
fs.writeFileSync(path.join(__dirname,"AUTO_P0_MONOTYPE_RESULT.json"),JSON.stringify(out,null,2)+"\n");
console.log("AUTO_P0_MONOTYPE_RESULT "+JSON.stringify({status:out.status,cases:out.cases,certifications:out.certifications,failures:out.failures,currentAutoWallMs:out.currentAutoWallMs,p0ProbeWallMs:out.p0ProbeWallMs,rows:rows.map(r=>({id:r.id,lb:r.safeLB,adv:r.advancedBoards,p0:r.p0Boards,cert:r.p0CanCertify,q:r.qualityCmp,cap:r.capacity,rem:r.remainder,p0ms:r.p0WallMs,autom:r.currentAutoWallMs}))}));
if(out.status!=="PASS")process.exitCode=2;

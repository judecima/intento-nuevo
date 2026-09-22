import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { buildGuideRowCandidate } from "./complete-candidate.mjs";

const require=createRequire(import.meta.url);
const ROOT=path.resolve(new URL("../../../../",import.meta.url).pathname);
const HERE=path.dirname(new URL(import.meta.url).pathname);
const CORPUS=process.env.HISTORICAL_CANONICAL_PATH||"/tmp/historical/canonical_cases.json";
const V3=process.env.HISTORICAL_V3_PATH||"/tmp/v3/master-industrial-v3-e2e-results.json";
const MODE=process.argv[2]||"shard";
const SHARD_INDEX=Number(process.env.SHARD_INDEX||0);
const SHARD_TOTAL=Number(process.env.SHARD_TOTAL||1);

process.env.OPTIMIZER_RUST_BEAM_RANK_CACHE_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_LEAN_BEAM_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_GREEDY_PLAN_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_LARGE_ROUND_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_SIMPLE_CHOOSE_EXPERIMENTAL="1";
process.env.OPTIMIZER_RUST_MASTER_ROUND_REUSE_EXPERIMENTAL="0";
process.env.OPTIMIZER_MASTER_UNIQUE_MASKS_LE4_EXPERIMENTAL="1";

const {validarPlanIndustrial}=require(path.join(ROOT,"src/lib/optimizer/legacy/v10.cjs"));

if(MODE==="shard")shard();
else if(MODE==="report")report();
else throw new Error("mode shard|report");

function orderNumber(value){
  const m=String(value||"").match(/\d+/g);
  if(!m)return null;
  const s=m.at(-1);
  return Number(s.length>7?s.slice(-7):s);
}
function lines(c){
  return (c.pieces||[]).map((p,i)=>({
    base:+p.base,altura:+p.altura,cant:+p.cant,
    veta:Boolean(c.directional),canRotate:!Boolean(c.directional),
    ref:String(i),detalle:String(i),cantos:null,
  }));
}
function config(c){
  return {
    placaBase:+c.stock_width,placaAltura:+c.stock_height,
    refiladoX:0,refiladoY:0,sierra:+c.saw,etapas:4,
    materialConVeta:Boolean(c.directional),
    descontarCanto:false,cantoEspesor:0,restoMin:250,restoMax:400,
    usarOneBoard:true,usarMaster:true,usarMultiSlice:true,usarCompactacion:true,
    usarRustPatternGenerator:true,usarCache:false,maxPiezasCache:0,
    rondasPatrones:40,msMaster:8000,maxNodosMaster:1600000,watchdogMasterMs:12000,
    usarCotaBarataPostCompactacion:true,usarDffFs0PostCompactacion:true,
    usarMascarasUnicasMasterLe4:true,
    minPiezasMultiSliceExperimental:200,maxPiezasMultiSliceExperimental:500,
    masterIndustrialRulesV3Experimental:true,
  };
}
function exactDemandOk(plan,ls){
  const expected=ls.reduce((s,l)=>s+Number(l.cant||0),0);
  let actual=0;
  for(const b of plan?.placas||[])actual+=(b.colocadas||[]).length;
  return actual===expected;
}
function timed(fn){
  const t0=process.hrtime.bigint(),c0=process.cpuUsage();
  try{
    const value=fn(),d=process.cpuUsage(c0);
    return {ok:true,value,wallMs:Number(process.hrtime.bigint()-t0)/1e6,cpuMs:(d.user+d.system)/1000,error:null};
  }catch(e){
    const d=process.cpuUsage(c0);
    return {ok:false,value:null,wallMs:Number(process.hrtime.bigint()-t0)/1e6,cpuMs:(d.user+d.system)/1000,error:String(e?.stack||e)};
  }
}
function load(){
  const corpus=JSON.parse(fs.readFileSync(CORPUS,"utf8"));
  const v3=JSON.parse(fs.readFileSync(V3,"utf8"));
  const byIndex=new Map((v3.rows||[]).map(r=>[Number(r.canonicalIndex),r]));
  const selected=[];
  for(let i=0;i<corpus.length;i++){
    const c=corpus[i],r=byIndex.get(i);
    if(!r||c?.source_format!=="project"||!r?.cand?.ok)continue;
    const boards=Number(r.cand.boards),lb=Number(r.cand.cota);
    if(!(Number.isFinite(boards)&&Number.isFinite(lb)&&boards>lb))continue;
    selected.push({index:i,c,r});
  }
  return selected;
}

function shard(){
  const selected=load(),rows=[];
  const counts={universe:selected.length,assigned:0,errors:0,invalid:0,wins:0,boardsSaved:0,reachesLb:0,reachesLepton:0,beatsLepton:0,equal:0,worseIgnored:0};
  for(let j=SHARD_INDEX;j<selected.length;j+=SHARD_TOTAL){
    counts.assigned++;
    const {index,c,r}=selected[j];
    const ls=lines(c),C=config(c),expected=ls.reduce((s,l)=>s+l.cant,0);
    const run=timed(()=>buildGuideRowCandidate(ls,C));
    const p=run.value?.plan||null;
    const order=orderNumber(c.case_id)||orderNumber(c.source_path);
    if(!run.ok||!p){
      counts.errors++;
      rows.push({index,order,class:"ERROR",error:run.error,h2Ms:run.wallMs});
      continue;
    }
    if(!validarPlanIndustrial(p,expected)?.ok||!exactDemandOk(p,ls)){
      counts.invalid++;
      rows.push({index,order,class:"INVALID",h2Ms:run.wallMs});
      continue;
    }
    const base=Number(r.cand.boards),lb=Number(r.cand.cota),h2=Number(p.resumen.placas),lepton=Number(c.reference_panels);
    let cls;
    if(h2<base){
      cls="WIN";counts.wins++;counts.boardsSaved+=base-h2;
      if(h2<=lb)counts.reachesLb++;
      if(Number.isFinite(lepton)){
        if(h2<lepton)counts.beatsLepton++;
        if(h2<=lepton)counts.reachesLepton++;
      }
    }else if(h2===base){cls="EQUAL";counts.equal++;}
    else{cls="WORSE_IGNORED";counts.worseIgnored++;}
    rows.push({
      index,order,class,
      category:r.category,
      pieces:r.pieces,typeCount:r.typeCount,
      structuralFp:c.structural_fp,
      v3Boards:base,lowerBound:lb,leptonBoards:Number.isFinite(lepton)?lepton:null,
      h2Boards:h2,h2Ms:run.wallMs,h2CpuMs:run.cpuMs,
      naturalStates:run.value?.telemetry?.residual?.naturalStates??null,
      rawStates:run.value?.telemetry?.residual?.rawStates??null,
    });
  }
  fs.writeFileSync(path.join(HERE,`h2-rescue-1399-shard-${SHARD_INDEX}.json`),JSON.stringify({counts,rows},null,2)+"\n");
  console.log("H2_1399_SHARD "+JSON.stringify({shard:SHARD_INDEX,counts}));
}
function quant(xs,p){
  const a=xs.filter(Number.isFinite).slice().sort((x,y)=>x-y);
  if(!a.length)return null;
  const z=(a.length-1)*p,l=Math.floor(z),h=Math.ceil(z);
  return l===h?a[l]:a[l]+(a[h]-a[l])*(z-l);
}
function report(){
  const files=fs.readdirSync(HERE).filter(x=>/^h2-rescue-1399-shard-\d+\.json$/.test(x));
  const shards=files.map(f=>JSON.parse(fs.readFileSync(path.join(HERE,f),"utf8")));
  const rows=shards.flatMap(x=>x.rows||[]);
  const counts={};
  for(const s of shards)for(const [k,v] of Object.entries(s.counts||{}))counts[k]=(counts[k]||0)+Number(v||0);
  // universe is repeated per shard; preserve one value.
  counts.universe=shards[0]?.counts?.universe??rows.length;
  const wins=rows.filter(r=>r.class==="WIN");
  const byCategory={};
  for(const cat of ["A-high-types","B-mid-repeat","C-full40-incremental"]){
    const a=rows.filter(r=>r.category===cat),w=a.filter(r=>r.class==="WIN");
    byCategory[cat]={
      cases:a.length,wins:w.length,
      boardsSaved:w.reduce((s,r)=>s+(r.v3Boards-r.h2Boards),0),
      reachesLb:w.filter(r=>r.h2Boards<=r.lowerBound).length,
    };
  }
  const out={
    counts,
    uniqueWinStructures:new Set(wins.map(r=>r.structuralFp)).size,
    byCategory,
    timing:{
      totalMs:rows.reduce((s,r)=>s+(Number(r.h2Ms)||0),0),
      p50:quant(rows.map(r=>r.h2Ms),.5),
      p95:quant(rows.map(r=>r.h2Ms),.95),
      p99:quant(rows.map(r=>r.h2Ms),.99),
    },
    topWins:wins.slice().sort((a,b)=>(b.v3Boards-b.h2Boards)-(a.v3Boards-a.h2Boards)||b.h2Ms-a.h2Ms).slice(0,100),
    rows,
  };
  fs.writeFileSync(path.join(HERE,"h2-rescue-1399-results.json"),JSON.stringify(out,null,2)+"\n");
  console.log("H2_1399_SUMMARY "+JSON.stringify({
    counts:out.counts,
    uniqueWinStructures:out.uniqueWinStructures,
    byCategory:out.byCategory,
    timing:out.timing,
  }));
  console.log("H2_1399_TOP_WINS "+JSON.stringify(out.topWins.slice(0,30)));
  if(counts.errors||counts.invalid)process.exitCode=2;
}

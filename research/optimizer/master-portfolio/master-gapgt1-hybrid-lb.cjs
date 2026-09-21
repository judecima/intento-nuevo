"use strict";

const fs=require("node:fs");
const path=require("node:path");

const ROOT=path.resolve(__dirname,"../../..");
const CANONICAL=path.join(ROOT,"experiencia/canonical_cases.json");
const MANIFEST=path.join(ROOT,"research/optimizer/master-portfolio/MASTER_ACTIVE_323_MANIFEST_2026-09-18.json");
const OUT_DIR=path.join(ROOT,"research/optimizer/master-portfolio/out");
const OUT=path.join(OUT_DIR,"MASTER_GAPGT1_HYBRID_LB_2026-09-21.json");

const {computeHybridLowerBound}=require(path.join(ROOT,"src/lib/optimizer/experimental/hybrid-lower-bound.cjs"));

function num(v,f=0){const n=Number(v);return Number.isFinite(n)?n:f;}
function boolTrue(v){return v===true||v===1||v==="1"||v==="true"||v==="TRUE";}
function basename(v){return typeof v==="string"?v.replaceAll("\\","/").split("/").pop():null;}
function qty(p){for(const k of ["quantity","qty","count","cant","num","q","qMin"]){const n=Number(p?.[k]);if(Number.isFinite(n)&&n>0)return n;}return 1;}
function dims(p){return {w:num(p?.width??p?.base??p?.l??p?.L),h:num(p?.height??p?.altura??p?.w??p?.W)};}
function features(row){
  const ps=Array.isArray(row.pieces)?row.pieces:[];
  return {file:basename(row.source_path||((row.case_id||"")+".xml")),pieceCount:num(row.piece_count,ps.reduce((s,p)=>s+qty(p),0)),typeCount:num(row.piece_types,ps.length)};
}
function gate(m){
  const gap=num(m.preMasterBoards)-num(m.lowerBound);
  const mult=num(m.typeCount)?num(m.pieces)/num(m.typeCount):0;
  return gap>1||mult>=4.75;
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
    placaBase:num(row.stock_width,2600),placaAltura:num(row.stock_height,1830),
    refiladoX:0,refiladoY:0,sierra:num(row.saw,4.5),etapas:4,
    materialConVeta:fmt==="order"?boolTrue(row.directional):false,
    descontarCanto:false,cantoEspesor:0,restoMin:250,restoMax:400
  };
}

function main(){
  const manifest=JSON.parse(fs.readFileSync(MANIFEST,"utf8"));
  const raw=JSON.parse(fs.readFileSync(CANONICAL,"utf8"));
  const all=Array.isArray(raw)?raw:raw.cases||[];
  const byFile=new Map(all.map(r=>[features(r).file,r]));

  const eligible=(manifest.cases||[])
    .filter(gate)
    .filter(m=>num(m.preMasterBoards)-num(m.lowerBound)>1)
    .filter(m=>num(m.typeCount)>4)
    .sort((a,b)=>(num(b.generationMs)+num(b.solveMs))-(num(a.generationMs)+num(a.solveMs)));

  const records=[],unavailable=[];
  for(const m of eligible){
    let row=byFile.get(basename(m.file));
    if(!row)row=all.find(r=>String(r.case_id||r.source_path||"").includes(String(m.order)));
    if(!row){unavailable.push({order:m.order,reason:"missing"});continue;}
    const f=features(row);
    if(f.pieceCount!==num(m.pieces)||f.typeCount!==num(m.typeCount)){
      unavailable.push({order:m.order,reason:"snapshot",historical:{pieces:num(m.pieces),types:num(m.typeCount)},current:f});
      continue;
    }
    const lines=toLines(row),opts=toConfig(row);
    const target=num(m.finalBoards);
    const cheap=computeHybridLowerBound(lines,opts,target,{useRaster:false,claude:{usarRaster:false}});
    const full=computeHybridLowerBound(lines,opts,target,{useRaster:true});
    records.push({
      order:m.order,pieces:f.pieceCount,typeCount:f.typeCount,
      historical:{preMasterBoards:num(m.preMasterBoards),oldLowerBound:num(m.lowerBound),finalBoards:target,masterWin:Boolean(m.masterWin)},
      cheap:{lb:num(cheap.cheapLowerBound||cheap.lowerBound),reason:cheap.reason,ms:num(cheap.timingsMs?.total),certifies:(num(cheap.cheapLowerBound||cheap.lowerBound)>=target)},
      full:{lb:num(full.lowerBound),reason:full.reason,ms:num(full.timingsMs?.total),certifies:(num(full.lowerBound)>=target),rasterRan:!!full.rasterRan},
      strengthensCheap:num(cheap.cheapLowerBound||cheap.lowerBound)>num(m.lowerBound),
      strengthensFull:num(full.lowerBound)>num(m.lowerBound)
    });
    console.log("LB_CASE",JSON.stringify(records[records.length-1]));
  }

  const summary={
    schema:"master-gapgt1-hybrid-lb-v1",generatedAt:new Date().toISOString(),
    counts:{
      eligible:eligible.length,exact:records.length,unavailable:unavailable.length,
      cheapStrengthened:records.filter(r=>r.strengthensCheap).length,
      fullStrengthened:records.filter(r=>r.strengthensFull).length,
      cheapCertifiesHistoricalFinal:records.filter(r=>r.cheap.certifies).map(r=>r.order),
      fullCertifiesHistoricalFinal:records.filter(r=>r.full.certifies).map(r=>r.order)
    },
    records,unavailable
  };
  fs.mkdirSync(OUT_DIR,{recursive:true});
  fs.writeFileSync(OUT,JSON.stringify(summary,null,2)+"\n");
  console.log("LB_SUMMARY",JSON.stringify(summary.counts));
}
main();

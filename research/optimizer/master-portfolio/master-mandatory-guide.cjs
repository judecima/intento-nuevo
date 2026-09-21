"use strict";

const fs=require("node:fs");
const path=require("node:path");
const ROOT=path.resolve(__dirname,"../../..");
const CANONICAL=path.join(ROOT,"experiencia/canonical_cases.json");
const MANIFEST=path.join(ROOT,"research/optimizer/master-portfolio/MASTER_ACTIVE_323_MANIFEST_2026-09-18.json");
const OUT_DIR=path.join(ROOT,"research/optimizer/master-portfolio/out");
const OUT=path.join(OUT_DIR,"MASTER_MANDATORY_GUIDE_2026-09-21.json");

const THRESHOLD=Number(process.env.MASTER_GATE_MULT||4.75);

function num(v,f=0){const n=Number(v);return Number.isFinite(n)?n:f;}
function basename(v){return typeof v==="string"?v.replaceAll("\\","/").split("/").pop():null;}
function qty(p){for(const k of ["quantity","qty","count","cant","num","q","qMin"]){const n=Number(p?.[k]);if(Number.isFinite(n)&&n>0)return n;}return 1;}
function dims(p){return {w:num(p?.width??p?.base??p?.l??p?.L),h:num(p?.height??p?.altura??p?.w??p?.W)};}
function features(row){
  const ps=Array.isArray(row.pieces)?row.pieces:[];
  return {
    file:basename(row.source_path||((row.case_id||"")+".xml")),
    pieceCount:num(row.piece_count,ps.reduce((s,p)=>s+qty(p),0)),
    typeCount:num(row.piece_types,ps.length),
  };
}
function gate(m){
  const gap=num(m.preMasterBoards)-num(m.lowerBound);
  const mult=num(m.typeCount)>0?num(m.pieces)/num(m.typeCount):0;
  return gap>1||mult>=THRESHOLD;
}
function schedule(typeCount,rounds=40,seed=7){
  let s=seed>>>0;
  const R=()=>{s=(Math.imul(s,1103515245)+12345)>>>0;return (s&0x7fffffff)/0x7fffffff;};
  const out=[];
  for(let r=0;r<rounds;r++){
    const mask=r===0?[...Array(typeCount).keys()]:[...Array(typeCount).keys()].filter(()=>R()>0.45);
    out.push(mask);
  }
  return out;
}

function main(){
  const manifest=JSON.parse(fs.readFileSync(MANIFEST,"utf8"));
  const raw=JSON.parse(fs.readFileSync(CANONICAL,"utf8"));
  const rows=Array.isArray(raw)?raw:raw.cases||[];
  const byFile=new Map(rows.map(r=>[features(r).file,r]));
  const records=[];
  const mismatches=[];

  for(const m of (manifest.cases||[]).filter(gate)){
    let row=byFile.get(basename(m.file));
    if(!row) row=rows.find(r=>String(r.case_id||r.source_path||"").includes(String(m.order)));
    if(!row){mismatches.push({order:m.order,reason:"missing"});continue;}
    const f=features(row);
    if(f.pieceCount!==num(m.pieces)||f.typeCount!==num(m.typeCount)){
      mismatches.push({order:m.order,reason:"snapshot",historical:{pieces:num(m.pieces),types:num(m.typeCount)},current:{pieces:f.pieceCount,types:f.typeCount}});
      continue;
    }
    const W=num(row.stock_width),H=num(row.stock_height),boardArea=W*H;
    if(!(boardArea>0)){mismatches.push({order:m.order,reason:"stock"});continue;}
    const K=num(m.preMasterBoards)-1;
    if(K<1) continue;

    const mandatory=[];
    (row.pieces||[]).forEach((p,i)=>{
      const d=dims(p),a=d.w*d.h,q=qty(p);
      if(!(a>0&&q>0)) return;
      // Safe optimistic upper bound: ignores kerf, guillotine structure, grain and fragmentation.
      // If the demand still cannot fit on K-1 boards at this optimistic capacity,
      // every improving solution of <=K boards must place this type on every board.
      const U=Math.floor(boardArea/a);
      if(U>0 && q>(K-1)*U){
        mandatory.push({typeIndex:i,quantity:q,optimisticPerBoard:U,slack:q-(K-1)*U});
      }
    });

    const sched=schedule(f.typeCount);
    const nonEmpty=sched.map((mask,round)=>({mask,round})).filter(x=>x.mask.length>0);
    const skipped=mandatory.length
      ? nonEmpty.filter(x=>mandatory.some(mm=>!x.mask.includes(mm.typeIndex)))
      : [];
    const kept=nonEmpty.length-skipped.length;
    const historicalMasterMs=num(m.generationMs)+num(m.monotypeMs)+num(m.solveMs);
    const projectedGenerationSavedMs=num(m.generationMs)*(nonEmpty.length?skipped.length/nonEmpty.length:0);
    records.push({
      order:m.order,file:f.file,pieces:f.pieceCount,typeCount:f.typeCount,
      gap:num(m.preMasterBoards)-num(m.lowerBound),preMasterBoards:num(m.preMasterBoards),
      targetMaxBoards:K,masterWin:Boolean(m.masterWin),
      generationMs:num(m.generationMs),solveMs:num(m.solveMs),historicalMasterMs,
      mandatory,nonEmptyRounds:nonEmpty.length,skippedRounds:skipped.map(x=>x.round),
      keptRounds:kept,skipPct:nonEmpty.length?skipped.length/nonEmpty.length:0,
      projectedGenerationSavedMs,
    });
  }

  const hit=records.filter(r=>r.mandatory.length>0);
  const sum=(xs,fn)=>xs.reduce((s,x)=>s+num(fn(x)),0);
  const totalGen=sum(records,r=>r.generationMs);
  const hitGen=sum(hit,r=>r.generationMs);
  const projected=sum(hit,r=>r.projectedGenerationSavedMs);
  const winners=records.filter(r=>r.masterWin);
  const summary={
    schema:"master-mandatory-guide-v1",
    generatedAt:new Date().toISOString(),
    proof:"For target K=preMasterBoards-1, if q_i>(K-1)*U_i with U_i=floor(boardArea/pieceArea), then every solution using <=K boards must include type i on every board. Any round mask omitting i cannot generate a board belonging to an accepted Master improvement.",
    counts:{
      gateV2Survivors:(manifest.cases||[]).filter(gate).length,
      exactMatched:records.length,
      mismatches:mismatches.length,
      withMandatoryType:hit.length,
      winners:winners.map(r=>r.order),
      winnersWithMandatory:winners.filter(r=>r.mandatory.length>0).map(r=>r.order),
    },
    potential:{
      totalMatchedGenerationMs:totalGen,
      generationMsInMandatoryCases:hitGen,
      projectedGenerationSavedMsLinearBySkippedRoundShare:projected,
      projectedPctMatchedGeneration:totalGen?projected/totalGen:null,
      note:"projection only; actual round cost is non-uniform and must be benchmarked before runtime promotion",
    },
    top:hit.slice().sort((a,b)=>b.projectedGenerationSavedMs-a.projectedGenerationSavedMs).slice(0,20),
    mismatches,
    records,
  };
  fs.mkdirSync(OUT_DIR,{recursive:true});
  fs.writeFileSync(OUT,JSON.stringify(summary,null,2)+"\n","utf8");
  console.log("MANDATORY_GUIDE_SUMMARY",JSON.stringify({counts:summary.counts,potential:summary.potential,top:summary.top.slice(0,10).map(r=>({order:r.order,mandatory:r.mandatory.length,rounds:`${r.keptRounds}/${r.nonEmptyRounds}`,projectedSavedMs:r.projectedGenerationSavedMs,win:r.masterWin}))}));
}
main();

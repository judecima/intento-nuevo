"use strict";
const fs=require("node:fs");
const path=require("node:path");
const DIR=__dirname;
const frozenPath=path.join(DIR,"master-win-frozen-manifest.json");
const shards=fs.readdirSync(DIR).filter(x=>/^master-win-mining-shard-\d+\.json$/.test(x)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));
if(shards.length!==32)throw new Error("expected 32 mining shards, got "+shards.length);
if(!fs.existsSync(frozenPath))throw new Error("missing frozen manifest");
const frozen=JSON.parse(fs.readFileSync(frozenPath,"utf8"));
const frozenByIndex=new Map((frozen.frozenAllWins||[]).map(w=>[Number(w.canonicalIndex),w]));
const candidates=shards.flatMap(f=>JSON.parse(fs.readFileSync(path.join(DIR,f),"utf8")).candidates||[])
  .filter(r=>r.masterActivated===true)
  .sort((a,b)=>Number(a.canonicalIndex)-Number(b.canonicalIndex));
const rows=candidates.map(r=>{
  const w=frozenByIndex.get(Number(r.canonicalIndex))||null;
  const split=w?(w.isTrainingCase?"train-win":"holdout-win"):"active-nonwin";
  return {...r,split,reproducedWin:Boolean(w),benchmarkReference:w?.benchmarkReference||null};
});
const counts={
  active:rows.length,
  trainWins:rows.filter(r=>r.split==="train-win").length,
  holdoutWins:rows.filter(r=>r.split==="holdout-win").length,
  activeNonWins:rows.filter(r=>r.split==="active-nonwin").length
};
if(counts.active!==1697)throw new Error("expected 1697 active cases, got "+counts.active);
if(counts.trainWins!==1||counts.holdoutWins!==46)throw new Error("unexpected frozen split "+JSON.stringify(counts));
const out={schema:"perfv1-master-active-checkpoint-manifest-v1",generatedAt:new Date().toISOString(),sourceMiningRun:35662373127,sourceFreezeRun:35663298999,counts,rows};
fs.writeFileSync(path.join(DIR,"master-active-checkpoint-manifest.json"),JSON.stringify(out,null,2)+"\n");
console.log("MASTER_ACTIVE_CHECKPOINT_MANIFEST "+JSON.stringify(counts));
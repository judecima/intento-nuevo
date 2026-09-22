"use strict";
const fs=require("node:fs"),path=require("node:path");
const DIR=__dirname;
const shards=fs.readdirSync(DIR).filter(x=>/^master-win-mining-shard-\d+\.json$/.test(x));
if(shards.length!==32)throw new Error("expected 32 mining shards got "+shards.length);
const all=shards.flatMap(f=>JSON.parse(fs.readFileSync(path.join(DIR,f),"utf8")).candidates||[]);
const rows=all.filter(r=>r.masterActivated===true)
  .sort((a,b)=>Number(a.canonicalIndex)-Number(b.canonicalIndex));
const wins=rows.filter(r=>Number(r.masterWins||0)>0);
const out={
  schema:"master-active-all-manifest-v1",
  generatedAt:new Date().toISOString(),
  counts:{cases:rows.length,wins:wins.length,nonWins:rows.length-wins.length},
  masterMsTotal:rows.reduce((s,r)=>s+Number(r.masterMs||0),0),
  rows
};
fs.writeFileSync(path.join(DIR,"master-active-all-manifest.json"),JSON.stringify(out,null,2)+"\n");
console.log("MASTER_ACTIVE_ALL_MANIFEST "+JSON.stringify({counts:out.counts,masterMsTotal:out.masterMsTotal}));

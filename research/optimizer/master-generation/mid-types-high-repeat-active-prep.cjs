"use strict";
const fs=require("node:fs"),path=require("node:path");
const DIR=__dirname;
const shards=fs.readdirSync(DIR).filter(x=>/^master-win-mining-shard-\d+\.json$/.test(x));
if(shards.length!==32)throw new Error("expected 32 mining shards got "+shards.length);
const all=shards.flatMap(f=>JSON.parse(fs.readFileSync(path.join(DIR,f),"utf8")).candidates||[]);
const rows=all.filter(r=>{
  const types=Number(r.typeCount),pieces=Number(r.pieces);
  return r.masterActivated===true && types>=20 && types<=40 && pieces/types>=4;
}).sort((a,b)=>Number(a.canonicalIndex)-Number(b.canonicalIndex));
const wins=rows.filter(r=>Number(r.masterWins||0)>0);
const cpu=rows.reduce((s,r)=>s+Number(r.masterMs||0),0);
const out={schema:"mid-types-high-repeat-active-manifest-v1",generatedAt:new Date().toISOString(),rule:{minTypes:20,maxTypes:40,minPiecesPerType:4},counts:{cases:rows.length,wins:wins.length,nonWins:rows.length-wins.length},masterMsTotal:cpu,rows};
fs.writeFileSync(path.join(DIR,"mid-types-high-repeat-active-manifest.json"),JSON.stringify(out,null,2)+"\n");
console.log("MID_REPEAT_ACTIVE_MANIFEST "+JSON.stringify({counts:out.counts,masterMsTotal:out.masterMsTotal}));
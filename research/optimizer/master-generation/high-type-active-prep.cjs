"use strict";
const fs=require("node:fs"),path=require("node:path");
const DIR=__dirname;
const shards=fs.readdirSync(DIR).filter(x=>/^master-win-mining-shard-\d+\.json$/.test(x));
if(shards.length!==32)throw new Error("expected 32 mining shards got "+shards.length);
const candidates=shards.flatMap(f=>JSON.parse(fs.readFileSync(path.join(DIR,f),"utf8")).candidates||[])
 .filter(r=>r.masterActivated===true&&Number(r.typeCount)>40)
 .sort((a,b)=>Number(a.canonicalIndex)-Number(b.canonicalIndex));
const wins=candidates.filter(r=>Number(r.masterWins||0)>0);
const out={schema:"high-type-active-manifest-v1",generatedAt:new Date().toISOString(),counts:{cases:candidates.length,wins:wins.length,nonWins:candidates.length-wins.length},rows:candidates};
if(out.counts.cases!==405||out.counts.wins!==4)throw new Error("unexpected cohort "+JSON.stringify(out.counts));
fs.writeFileSync(path.join(DIR,"high-type-active-manifest.json"),JSON.stringify(out,null,2)+"\n");
console.log("HIGH_TYPE_ACTIVE_MANIFEST "+JSON.stringify(out.counts));
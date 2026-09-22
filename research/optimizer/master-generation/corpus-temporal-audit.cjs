"use strict";
const fs=require("node:fs");
const path=require("node:path");
const ROOT=path.resolve(__dirname,"../../..");
const raw=JSON.parse(fs.readFileSync(path.join(ROOT,"experiencia/canonical_cases.json"),"utf8"));
const entries=Array.isArray(raw)?raw:(raw.cases||raw.records||raw.canonical_cases||raw.canonicalCases||raw.data||[]);
function root(e){return e?.case??e?.canonical??e?.optimization_case??e?.optimizationCase??e;}
function orderNumber(v){const runs=String(v||"").replace(/\.xml$/i,"").match(/\d+/g);if(!runs)return null;const last=runs.at(-1);return Number(last.length>7?last.slice(-7):last);}
function candidateStrings(e){const r=root(e);return [e?.file,e?.file_name,e?.fileName,e?.source_file,e?.sourceFile,e?.case_id,e?.caseId,e?.name,e?.id,r?.file,r?.file_name,r?.fileName,r?.source_file,r?.sourceFile,r?.case_id,r?.caseId,r?.name,r?.id].filter(v=>typeof v==="string"||Number.isFinite(Number(v)));}
function order(e){for(const s of candidateStrings(e)){const n=orderNumber(s);if(Number.isFinite(n))return n;}return null;}
const keyCounts=new Map(), samples=new Map();
function addKey(prefix,obj){
 if(!obj||typeof obj!=="object"||Array.isArray(obj))return;
 for(const [k,v] of Object.entries(obj)){
   const key=prefix?prefix+"."+k:k;
   keyCounts.set(key,(keyCounts.get(key)||0)+1);
   if(!samples.has(key)&&v!=null&&typeof v!=="object")samples.set(key,String(v).slice(0,160));
 }
}
for(const e of entries){addKey("",e);addKey("root",root(e));}
const dateish=[...keyCounts.entries()].filter(([k])=>/(date|fecha|time|created|updated|timestamp|dia|mes|year|anio|año)/i.test(k)).map(([key,count])=>({key,count,sample:samples.get(key)||null})).sort((a,b)=>b.count-a.count);
const orders=entries.map((e,i)=>({i,order:order(e)})).filter(x=>Number.isFinite(x.order));
let ascPairs=0,descPairs=0,equalPairs=0;
for(let i=1;i<orders.length;i++){if(orders[i].order>orders[i-1].order)ascPairs++;else if(orders[i].order<orders[i-1].order)descPairs++;else equalPairs++;}
const sorted=[...orders].sort((a,b)=>a.order-b.order);
let displacement=0,maxDisp=0;
const rank=new Map(sorted.map((x,i)=>[x.i,i]));
for(const x of orders){const d=Math.abs(rank.get(x.i)-x.i);displacement+=d;maxDisp=Math.max(maxDisp,d);}
const out={
 entries:entries.length,
 orderCount:orders.length,
 orderMin:Math.min(...orders.map(x=>x.order)),
 orderMax:Math.max(...orders.map(x=>x.order)),
 adjacency:{ascPairs,descPairs,equalPairs,ascPct:100*ascPairs/Math.max(1,orders.length-1),descPct:100*descPairs/Math.max(1,orders.length-1)},
 ordering:{meanAbsoluteRankDisplacement:displacement/Math.max(1,orders.length),maxAbsoluteRankDisplacement:maxDisp},
 firstOrders:orders.slice(0,30),
 lastOrders:orders.slice(-30),
 dateish
};
console.log("CORPUS_TEMPORAL_AUDIT "+JSON.stringify(out));
fs.writeFileSync(path.join(__dirname,"corpus-temporal-audit.json"),JSON.stringify(out,null,2)+"\n");

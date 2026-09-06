#!/usr/bin/env node
/**
 * Compara checkpoint V20 existente vs V21b family-seeded Master en la misma máquina.
 * Excluye cache hits y acepta que el baseline viejo no tenga campos V21.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
if (typeof args.baseline !== "string" || typeof args.candidate !== "string") {
  console.error("uso: node scripts/v21-benchmark-compare.mjs --baseline <v20.jsonl> --candidate <v21.jsonl> [--maxRatio 0.7280675]");
  process.exit(2);
}
const maxRatio = Number(args.maxRatio ?? 0.7280675);
if (!(maxRatio > 0 && maxRatio <= 1)) { console.error("--maxRatio debe estar entre 0 y 1"); process.exit(2); }

const baselineAll = readJsonl(args.baseline).filter((row) => row?.file);
const baselineRows = baselineAll.filter((row) => row.cacheHit !== true && row.engineCacheHit !== true);
const candidateRows = readJsonl(args.candidate).filter((row) => row?.file && row.cacheHit !== true && row.engineCacheHit !== true);
const candidateByFile = new Map(candidateRows.map((row) => [row.file, row]));
const mismatches = [];
let baselineTotalMs=0, candidateTotalMs=0, baselineMasterMs=0, candidateMasterMs=0, matched=0, betterBoards=0;

for (const old of baselineRows) {
  const now = candidateByFile.get(old.file);
  if (!now) { mismatches.push({file:old.file,issue:"missing-candidate"}); continue; }
  matched += 1;
  if (old.ok !== true || now.ok !== true) {
    mismatches.push({file:old.file,issue:"execution-error",baselineOk:old.ok,candidateOk:now.ok,candidateError:now.error??null});
    continue;
  }
  if (old.validationOk !== true || now.validationOk !== true) mismatches.push({file:old.file,issue:"validation",baseline:old.validationOk,candidate:now.validationOk});
  if (+now.boards > +old.boards) mismatches.push({file:old.file,issue:"board-regression",baseline:old.boards,candidate:now.boards});
  if (+now.boards < +old.boards) betterBoards += 1;

  if (old.env?.staged !== false || old.env?.cheapPostBaseline !== true) mismatches.push({file:old.file,issue:"wrong-baseline-env",env:old.env??null});
  const oldMasterFlag = old.env?.v21FamilyMaster ?? false;
  const oldPrepassFlag = old.env?.v21CertifiedPrepass ?? old.env?.v21FamilyPatterns ?? false;
  if (oldMasterFlag !== false || oldPrepassFlag !== false) mismatches.push({file:old.file,issue:"baseline-v21-not-off",env:old.env??null});

  if (now.env?.staged !== false || now.env?.cheapPostBaseline !== true || now.env?.v21FamilyMaster !== true || now.env?.v21CertifiedPrepass !== false) {
    mismatches.push({file:old.file,issue:"wrong-candidate-env",env:now.env??null});
  }
  if ((+now.cheap?.errors||0)!==0 || (+now.cheap?.violation||0)!==0) mismatches.push({file:old.file,issue:"cheap-safety",cheap:now.cheap??null});

  const oldMs=Number(old.totalMs), nowMs=Number(now.totalMs);
  if (!Number.isFinite(oldMs)||oldMs<0||!Number.isFinite(nowMs)||nowMs<0) mismatches.push({file:old.file,issue:"invalid-totalMs",baseline:old.totalMs,candidate:now.totalMs});
  else { baselineTotalMs += oldMs; candidateTotalMs += nowMs; }
  baselineMasterMs += masterMs(old);
  candidateMasterMs += masterMs(now);
}

if (matched !== baselineRows.length || candidateRows.length !== baselineRows.length) mismatches.push({issue:"row-count",baselineComparable:baselineRows.length,baselineAll:baselineAll.length,candidate:candidateRows.length,matched});

const ratio = baselineTotalMs>0 ? candidateTotalMs/baselineTotalMs : null;
const reductionPct = ratio===null ? null : (1-ratio)*100;
const masterRatio = baselineMasterMs>0 ? candidateMasterMs/baselineMasterMs : null;
const masterReductionPct = masterRatio===null ? null : (1-masterRatio)*100;
const correctnessOk = mismatches.length===0;
const performanceOk = ratio!==null && ratio<=maxRatio;
const summary = {
  baselineRowsAll: baselineAll.length,
  cases: baselineRows.length,
  excludedBaselineCacheHits: baselineAll.length-baselineRows.length,
  candidateRows:candidateRows.length,
  matched,
  correctnessOk,
  performanceOk,
  baselineTotalMs,
  candidateTotalMs,
  ratio,
  reductionPct,
  requiredReductionPct:(1-maxRatio)*100,
  historicalEquivalentMs: ratio===null?null:ratio*12_361_491,
  historicalTargetMs:9_000_000,
  baselineMasterMs,
  candidateMasterMs,
  masterRatio,
  masterReductionPct,
  diagnosticMasterTargetReductionPct:36.74,
  betterBoards,
  mismatches:mismatches.length,
  pass:correctnessOk&&performanceOk,
};
console.log(JSON.stringify(summary,null,2));
if(mismatches.length) console.log(JSON.stringify(mismatches.slice(0,100),null,2));
if(!correctnessOk){console.error("V21 FAIL CORRECTNESS");process.exit(1)}
if(!performanceOk){console.error("V21 FAIL PERFORMANCE");process.exit(3)}
console.log("V21 PASS");

function masterMs(row){ return +(row.master?.ms ?? row.metricasV10?.master?.ms ?? 0) || 0; }
function readJsonl(path){ return readFileSync(resolve(path),"utf8").split(/\r?\n/).filter(Boolean).map((line,index)=>{try{return JSON.parse(line)}catch(error){throw new Error(`${path}:${index+1}: ${error.message}`)}}); }
function parseArgs(argv){ const out={}; for(let i=0;i<argv.length;i+=1){const token=argv[i];if(!token.startsWith("--"))continue;const key=token.slice(2);const next=argv[i+1];if(next===undefined||next.startsWith("--"))out[key]=true;else{out[key]=next;i+=1}}return out; }

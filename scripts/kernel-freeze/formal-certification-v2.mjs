#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT=fileURLToPath(import.meta.url), REPO=resolve(dirname(SCRIPT),"../..");
const CANDIDATE="4063963260abb10c8d68d0e553942899c925cc2f";
const COHORT_HASH="36d005421ae79b01867e0bba377c1bf526801bcd4dcfa2b0180e12cf354458f3";
const P=join(REPO,"research/optimizer/freeze");
const args=parseArgs(process.argv.slice(2)), mode=args._[0]??"preflight";
if(mode!=="preflight") throw new Error("formal execution remains disabled until production deterministic budgets are calibrated and versioned; this v2 checkpoint only certifies static provenance/policy readiness");

const policy=read(join(P,"KERNEL_V1_FORMAL_CERTIFICATION_POLICY.json"));
const trace=read(join(P,"KERNEL_V1_FREEZE_TRACEABILITY.json"));
const recon=read(join(P,"KERNEL_V1_RESTO_RECONCILIATION.json"));
const audit=read(join(P,"KERNEL_V1_RESTO_ARCHIVE_AUDIT_2026-09-07.json"));
const contract=read(join(P,"KERNEL_V1_CORRECTNESS_CONTRACT.json"));
const embedded=read(join(REPO,"experiencia/canonical_cases.json"));

const resto=embedded.filter(r=>partition(r?.source_path)==="resto");
const restoIds=[...new Set(resto.map(identity).filter(Boolean))].sort(cmp);
const mixed=(audit?.currentParser?.rejections??[]).filter(e=>e.code==="mixed-board-formats");
if(mixed.length!==13) throw new Error(`expected 13 mixed-board identities, got ${mixed.length}`);
const mixedFiles=mixed.map(e=>resolveStem(restoIds,String(e.stem)));
const mixedSet=new Set(mixedFiles);
const records=resto.filter(r=>!mixedSet.has(identity(r)));
const ids=[...new Set(records.map(identity).filter(Boolean))].sort(cmp);
const identitySetSha256=hashList(ids);
const runtimeMatchesCandidate=spawnSync("git",["diff","--quiet",CANDIDATE,"--","src/lib/optimizer"],{cwd:REPO}).status===0;

const traceabilityComplete=
  policy?.kernelCandidate===CANDIDATE && trace?.kernelCandidate===CANDIDATE &&
  recon?.status==="RECOVERED" && recon?.auditSummary?.archiveXml===8669 && recon?.auditSummary?.uniqueNames===8669 &&
  records.length===8650 && ids.length===8650 && identitySetSha256===COHORT_HASH &&
  contract?.recoveredPredicate?.status==="RECOVERED" && contract?.recoveredPredicate?.id==="HISTORICAL_VALIDITY_V1";
const correctnessPredicateReady=
  policy?.correctnessPredicate?.status==="RESOLVED" && policy?.correctnessPredicate?.id==="HISTORICAL_VALIDITY_V1";
const values=policy?.deterministicBudgets?.values??{};
const budgetKeys=["OPTIMIZER_MAX_BEAM_EXPANSIONS","OPTIMIZER_BEAM_WATCHDOG_MS","OPTIMIZER_MAX_MASTER_NODES","OPTIMIZER_MASTER_WATCHDOG_MS","OPTIMIZER_MAX_RESCUE_ATTEMPTS","OPTIMIZER_RESCUE_WATCHDOG_MS"];
const deterministicBudgetsReady=policy?.deterministicBudgets?.status==="RESOLVED"&&budgetKeys.every(k=>Number.isSafeInteger(values[k])&&values[k]>0);
const formalCertificationReady=traceabilityComplete&&runtimeMatchesCandidate&&correctnessPredicateReady&&deterministicBudgetsReady&&policy?.formalCertificationReady===true;
const blockingReasons=[];
if(!traceabilityComplete) blockingReasons.push("traceability/correctness-contract preflight failed");
if(!runtimeMatchesCandidate) blockingReasons.push("runtime differs from Kernel V1 candidate");
if(!correctnessPredicateReady) blockingReasons.push("historical correctness predicate is not resolved");
if(!deterministicBudgetsReady) blockingReasons.push("production deterministic budgets/watchdogs are not calibrated and versioned");

const report={
  schemaVersion:"kernel-v1-formal-certification-preflight-v2",
  generatedAt:new Date().toISOString(),
  kernelCandidate:CANDIDATE,
  status: formalCertificationReady?"READY_FOR_FORMAL_CERTIFICATION":traceabilityComplete&&runtimeMatchesCandidate&&correctnessPredicateReady?"TRACEABILITY_AND_CORRECTNESS_CONTRACT_COMPLETE_BUDGET_CALIBRATION_PENDING":"BLOCKED",
  traceabilityComplete,
  runtimeMatchesCandidate,
  cohort:{records:records.length,distinctXml:ids.length,identitySetSha256,mixedBoardExcluded:mixedFiles.length},
  policy:{correctnessPredicateReady,correctnessPredicateId:policy?.correctnessPredicate?.id??null,deterministicBudgetsReady,formalCertificationReady,blockingReasons},
  executionContract:{
    strategy:"v10",
    correctness:"HISTORICAL_VALIDITY_V1",
    referencePanelsRole:"quality comparison only; not an acceptance gate",
    physicalCorpusRequiredForExecution:true,
    note:"The previous formal runner must not be used for long execution from experiencia/canonical_cases.json because that file is a provenance projection, not a runtime CanonicalOptimizationCase. Physical-XML execution binding is intentionally required before calibration/certification."
  }
};
const out=resolve(args.report??join(P,"KERNEL_V1_FORMAL_CERTIFICATION_PREFLIGHT.json")); mkdirSync(dirname(out),{recursive:true}); writeFileSync(out,JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({status:report.status,cohort:`${records.length}/${ids.length}`,identitySetSha256,correctnessPredicateReady,deterministicBudgetsReady,formalCertificationReady,blockingReasons}));
if(!traceabilityComplete||!runtimeMatchesCandidate||!correctnessPredicateReady) process.exitCode=1;

function read(p){return JSON.parse(readFileSync(p,"utf8"));}
function partition(p){const a=String(p??"").replace(/\\/g,"/").split("/").filter(Boolean),i=a.lastIndexOf("xml_experience");return i>=0?(a[i+1]??"(root)"):"(outside)";}
function identity(r){const p=String(r?.source_path??"").replace(/\\/g,"/");return p?basename(p):null;}
function resolveStem(names,stem){const m=names.filter(n=>{const c=n.replace(/\.xml$/i,"");return c===stem||(/^\d+$/.test(stem)&&(c.startsWith(`${stem}__`)||c.endsWith(stem)));});if(m.length!==1)throw new Error(`stem ${stem} resolved to ${m.length}`);return m[0];}
function hashList(a){return createHash("sha256").update(a.join("\n")+"\n").digest("hex");}
function cmp(a,b){return String(a)<String(b)?-1:String(a)>String(b)?1:0;}
function parseArgs(a){const o={_:[]};for(let i=0;i<a.length;i++){const t=a[i];if(!t.startsWith("--")){o._.push(t);continue;}const k=t.slice(2),n=a[i+1];if(n!=null&&!n.startsWith("--")){o[k]=n;i++;}else o[k]=true;}return o;}

#!/usr/bin/env node

import { build } from "esbuild";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { cpus, hostname, platform, release, totalmem } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const sourceDir = resolve(args.output);
const replayDir = resolve(args.replayOutput ?? join(sourceDir, "runtime-attribution"));
const metaPath = join(sourceDir, "FULL_RUNTIME_VALIDATION_META.json");
const rowsPath = join(sourceDir, "FULL_RUNTIME_VALIDATION_ROWS.jsonl");

if (!existsSync(metaPath) || !existsSync(rowsPath)) throw new Error("Faltan META o ROWS del holdout Auto completo.");
mkdirSync(replayDir, { recursive: true });

const sourceMeta = JSON.parse(readFileSync(metaPath, "utf8"));
if (sourceMeta.complete !== true) throw new Error("El holdout Auto no esta completo.");
const sourceRows = readJsonl(rowsPath);
const currentGit = gitCommand(["rev-parse", "HEAD"]) || null;
assertRuntimeCompatible(sourceMeta.git?.head ?? null, currentGit);
sanitizeOptimizerEnvironment();

const selection = selectReplayCohort(sourceRows, args.controlSize);
const selected = Number.isFinite(args.limit) ? selection.slice(0, args.limit) : selection;
const fileMap = buildFileMap(sourceMeta.inputs || []);
for (const item of selected) {
  if (!fileMap.has(item.caseKey)) throw new Error("No encuentro XML para " + item.caseKey + ". Revisa los roots guardados en META.");
}

const bundlePath = join(REPO, "node_modules", ".cache", "runtime-attribution", "optimizer.mjs");
mkdirSync(dirname(bundlePath), { recursive: true });
const anchor = pathToFileURL(join(REPO, "src", "lib", "optimizer", "experience", "revalidate.ts")).href;
await build({
  entryPoints: [join(REPO, "src", "lib", "optimizer", "index.ts")],
  bundle: true, platform: "node", format: "esm", target: "node22", outfile: bundlePath,
  define: { "import.meta.url": JSON.stringify(anchor) }, logLevel: "warning",
});
const optimizer = await import(pathToFileURL(bundlePath).href + "?v=" + Date.now());

const resultPath = join(replayDir, "RUNTIME_ATTRIBUTION_ROWS.jsonl");
const summaryPath = join(replayDir, "RUNTIME_ATTRIBUTION_SUMMARY.json");
const metaOutPath = join(replayDir, "RUNTIME_ATTRIBUTION_META.json");
const existing = existsSync(resultPath) ? readJsonl(resultPath) : [];
const done = new Set(existing.map((row) => row.caseKey));
const all = existing.slice();

writeJson(metaOutPath, {
  schema: "optimizer-runtime-attribution-meta-v1", createdAt: new Date().toISOString(),
  sourceValidationGit: sourceMeta.git?.head ?? null, replayGit: currentGit,
  sourceRows: sourceRows.length, selectedCases: selection.length, requestedCases: selected.length,
  controlSize: args.controlSize,
  environment: { node: process.version, platform: platform(), release: release(), hostname: hostname(),
    cpuModel: cpus()[0]?.model ?? null, cpuCount: cpus().length, totalMemoryBytes: totalmem() },
  note: "No activa OPTIMIZER_STEP0_TELEMETRY; persiste telemetria ya producida por V10 para no alterar rutas limitadas por tiempo.",
});

let session = 0;
for (const item of selected) {
  if (done.has(item.caseKey)) continue;
  const path = fileMap.get(item.caseKey);
  const started = performance.now();
  let out;
  try {
    const xml = readFileSync(path, "utf8");
    const parsed = optimizer.parseCanonicalXml(xml, { fileName: item.fileName, defaultKerf: 4.5, defaultMinRemnant: 250, defaultMinCommercialRemnantLongSide: 400 });
    const input = optimizer.benchmarkInputFromCanonicalCase(parsed.case, { strategy: "v10", profile: "balanced" });
    input.projectId = "runtime-attribution-" + safeId(item.caseKey);
    const arm = timed(() => optimizer.optimizeProject(input, { motorVersion: "v2", effortMode: "auto", patternGenerator: "rust" }));

    if (!arm.ok || !arm.result) {
      out = failureRow(item, arm, started, "candidate_runtime_error");
    } else if (arm.result.metrics.patternGenerator !== "rust") {
      out = failureRow(item, arm, started, "rust_not_active");
    } else {
      const replayBoards = arm.result.metrics.boardCount;
      const sourceBoards = item.sourceRow.candidate?.boards ?? null;
      const boardsCmp = Number.isFinite(sourceBoards) ? cmp(replayBoards, sourceBoards) : null;
      const replayRemnant = remnantQuality(arm.result);
      const sourceRemnant = item.sourceRow.candidate?.remnant ?? null;
      const remnantCmp = boardsCmp === 0 && sourceRemnant ? compareRemnantObjects(replayRemnant, sourceRemnant) : null;
      out = {
        schema: "optimizer-runtime-attribution-row-v1",
        status: arm.result.validation.ok === true ? (boardsCmp === 0 || boardsCmp === null ? "OK" : "DRIFT") : "FAIL",
        failures: arm.result.validation.ok === true ? [] : ["candidate_invalid"],
        caseKey: item.caseKey, caseId: item.caseId, fileName: item.fileName,
        selectionReasons: item.reasons, typeCount: parsed.stats.pieceTypes, pieceCount: parsed.stats.pieceQuantity,
        leptonBoards: item.sourceRow.leptonBoards ?? null,
        sourceCandidate: { boards: sourceBoards, cpuMs: item.sourceRow.candidate?.cpuMs ?? null, wallMs: item.sourceRow.candidate?.wallMs ?? null,
          remnant: sourceRemnant, stopReason: item.sourceRow.auto?.stopReason ?? null, roundsExecuted: item.sourceRow.auto?.roundsExecuted ?? null,
          safeLowerBound: item.sourceRow.auto?.safeLowerBound ?? null, preMasterBoards: item.sourceRow.auto?.preMasterBoards ?? null },
        replayCandidate: armRow(arm),
        comparison: { boardDrift: boardsCmp, remnantDrift: remnantCmp, recoveredSourceFailure: item.sourceRow.status === "FAIL" },
        telemetry: extractTelemetry(arm.result), rowWallMs: +(performance.now() - started).toFixed(3),
      };
    }
  } catch (error) {
    out = { schema: "optimizer-runtime-attribution-row-v1", status: "FAIL", failures: ["exception"],
      caseKey: item.caseKey, caseId: item.caseId, fileName: item.fileName, selectionReasons: item.reasons,
      error: String(error?.stack || error), rowWallMs: +(performance.now() - started).toFixed(3) };
  }
  appendFileSync(resultPath, JSON.stringify(out) + "\n");
  all.push(out); done.add(item.caseKey); session++;
  if (session === 1 || session % args.progressEvery === 0 || session === selected.length || out.status === "FAIL") {
    writeJson(summaryPath, summarize(all, selection.length));
    console.log("[" + done.size + "/" + selection.length + "] FAIL=" + all.filter((r) => r.status === "FAIL").length + " DRIFT=" + all.filter((r) => r.status === "DRIFT").length);
  }
}
writeJson(summaryPath, summarize(all, selection.length));
console.log("\nRuntime attribution:"); console.log(resultPath); console.log(summaryPath); console.log(metaOutPath);

function selectReplayCohort(rows, controlSize) {
  const selected = new Map();
  const valid = rows.filter((row) => row.candidate?.valid && Number.isFinite(row.candidate?.cpuMs));
  const cpu = valid.map((row) => row.candidate.cpuMs);
  const p95 = quantile(cpu, 0.95), p99 = quantile(cpu, 0.99);
  const add = (row, reason) => {
    if (!row?.caseKey) return;
    const entry = selected.get(row.caseKey) ?? { caseKey: row.caseKey, caseId: row.caseId, fileName: row.fileName, sourceRow: row, reasons: [] };
    if (!entry.reasons.includes(reason)) entry.reasons.push(reason);
    selected.set(row.caseKey, entry);
  };
  for (const row of rows) {
    if (row.status === "FAIL") add(row, "SOURCE_FAILURE");
    if (row.comparisons?.candidateVsLepton > 0) add(row, "WORSE_THAN_LEPTON");
    if (row.auto?.enteredMaster === true && Number.isFinite(row.auto?.preMasterBoards) && Number.isFinite(row.candidate?.boards) && row.candidate.boards < row.auto.preMasterBoards) add(row, "MASTER_REDUCED_BOARDS");
    if (Number.isFinite(row.candidate?.cpuMs) && row.candidate.cpuMs >= p99) add(row, "P99_CPU");
    if (row.auto?.enteredMaster !== true && Number.isFinite(row.candidate?.cpuMs) && row.candidate.cpuMs >= p95) add(row, "P95_NO_MASTER");
  }
  const controls = valid.filter((row) => !selected.has(row.caseKey)).sort((a,b) => stableRank(a.caseKey).localeCompare(stableRank(b.caseKey))).slice(0, Math.max(0, controlSize));
  for (const row of controls) add(row, "CONTROL");
  return [...selected.values()].sort((a,b) => a.caseKey.localeCompare(b.caseKey));
}

function extractTelemetry(result) {
  const m = result.raw?.metricasV10 ?? null, effort = m?.effortController ?? null;
  return {
    v10Total: m?.total ? { casos: finiteOrNull(m.total.casos), ms: finiteOrNull(m.total.ms) } : null,
    stages: { compactacion: stageMetric(m?.compactacion), multislice: stageMetric(m?.multislice), oneboard: stageMetric(m?.oneboard), master: stageMetric(m?.master) },
    lowerBound: m?.lowerBound ? { ...m.lowerBound } : null,
    remnantPolish: m?.remnantPolish ? { ...m.remnantPolish } : null,
    effortController: effort ? { mode: effort.mode ?? null, enteredMaster: effort.enteredMaster === true,
      preMasterBoards: finiteOrNull(effort.preMasterBoards), safeLowerBound: finiteOrNull(effort.safeLowerBound),
      roundsExecuted: finiteOrNull(effort.roundsExecuted), stopReason: effort.stopReason ?? null,
      finalBoards: finiteOrNull(effort.finalBoards), generationCpuMs: finiteOrNull(effort.generationCpuMs),
      blocks: Array.isArray(effort.blocks) ? effort.blocks.map(normalizeBlock) : [] } : null,
  };
}

function normalizeBlock(block) {
  return { blockIndex: finiteOrNull(block?.blockIndex), requestedRounds: Array.isArray(block?.requestedRounds) ? block.requestedRounds.slice() : [],
    newlyExecuted: Array.isArray(block?.newlyExecuted) ? block.newlyExecuted.slice() : [], executedRounds: finiteOrNull(block?.executedRounds),
    solved: block?.solved === true, poolSize: finiteOrNull(block?.poolSize), candidateCount: finiteOrNull(block?.candidateCount),
    generationDeltaCpuMs: finiteOrNull(block?.generationDeltaCpuMs), generationCpuMs: finiteOrNull(block?.generationCpuMs),
    solverNodes: finiteOrNull(block?.solverNodes), solverExhausted: block?.solverExhausted === true, solverTargetReached: block?.solverTargetReached === true,
    solverNodeCap: finiteOrNull(block?.solverNodeCap), candidateBoards: finiteOrNull(block?.candidateBoards), incumbentBoards: finiteOrNull(block?.incumbentBoards),
    safeLowerBound: finiteOrNull(block?.safeLowerBound), wallMs: finiteOrNull(block?.wallMs), structuralShortCircuit: block?.structuralShortCircuit === true };
}

function stageMetric(value) {
  return value ? { activaciones: finiteOrNull(value.activaciones), ganancias: finiteOrNull(value.ganancias), placasAhorradas: finiteOrNull(value.placasAhorradas),
    invalidos: finiteOrNull(value.invalidos), ms: finiteOrNull(value.ms), peorMs: finiteOrNull(value.peorMs) } : null;
}

function summarize(rows, expectedCases) {
  const ok = rows.filter((row) => row.status === "OK" || row.status === "DRIFT");
  const generation = ok.map((row) => row.telemetry?.effortController?.generationCpuMs).filter(Number.isFinite);
  const masterWall = ok.map((row) => row.telemetry?.stages?.master?.ms).filter(Number.isFinite);
  const totalV10 = ok.map((row) => row.telemetry?.v10Total?.ms).filter(Number.isFinite);
  const nodes = ok.flatMap((row) => row.telemetry?.effortController?.blocks ?? []).map((block) => block.solverNodes).filter(Number.isFinite);
  return { schema: "optimizer-runtime-attribution-summary-v1", generatedAt: new Date().toISOString(), expectedCases, processedCases: rows.length,
    complete: rows.length >= expectedCases, ok: rows.filter((row) => row.status === "OK").length, drift: rows.filter((row) => row.status === "DRIFT").length,
    failures: rows.filter((row) => row.status === "FAIL").length,
    recoveredSourceFailures: rows.filter((row) => row.comparison?.recoveredSourceFailure && row.status !== "FAIL").length,
    selectionReasons: countReasons(rows),
    telemetryCoverage: { withV10: ok.filter((row) => row.telemetry?.v10Total).length,
      withMasterBlocks: ok.filter((row) => (row.telemetry?.effortController?.blocks?.length ?? 0) > 0).length },
    totals: { replayCandidateCpuMs: sum(ok.map((row) => row.replayCandidate?.cpuMs)), replayCandidateWallMs: sum(ok.map((row) => row.replayCandidate?.wallMs)),
      v10WallMs: sum(totalV10), masterWallMs: sum(masterWall), masterGenerationCpuMs: sum(generation), solverNodes: sum(nodes) },
    distributions: { generationCpuMs: timingLite(generation), masterWallMs: timingLite(masterWall), v10WallMs: timingLite(totalV10), solverNodes: timingLite(nodes) } };
}

function failureRow(item, arm, started, reason) {
  return { schema: "optimizer-runtime-attribution-row-v1", status: "FAIL", failures: [reason], caseKey: item.caseKey, caseId: item.caseId,
    fileName: item.fileName, selectionReasons: item.reasons, sourceError: item.sourceRow.error ?? item.sourceRow.candidate?.error ?? null,
    replayCandidate: armRow(arm), error: arm?.error ?? reason, rowWallMs: +(performance.now() - started).toFixed(3) };
}

function armRow(arm) {
  if (!arm?.ok || !arm.result) return { ok:false, valid:false, error:arm?.error ?? "unknown", wallMs:arm?.wallMs ?? null, cpuMs:arm?.cpuMs ?? null };
  return { ok:true, valid:arm.result.validation.ok === true, algorithmVersion:arm.result.algorithmVersion, boards:arm.result.metrics.boardCount,
    pieces:arm.result.metrics.pieceCount, wallMs:arm.wallMs, cpuMs:arm.cpuMs, engineMs:arm.result.metrics.engineMs ?? null,
    patternGenerator:arm.result.metrics.patternGenerator ?? null, effortMode:arm.result.metrics.effortMode ?? null,
    lowerBound:arm.result.raw?.cotaV10 ?? null, remnant:remnantQuality(arm.result) };
}

function timed(fn) {
  const cpu0=process.cpuUsage(), wall0=performance.now();
  try { const result=fn(), cpu=process.cpuUsage(cpu0); return {ok:true,result,wallMs:+(performance.now()-wall0).toFixed(3),cpuMs:+((cpu.user+cpu.system)/1000).toFixed(3),error:null}; }
  catch(error){ const cpu=process.cpuUsage(cpu0); return {ok:false,result:null,wallMs:+(performance.now()-wall0).toFixed(3),cpuMs:+((cpu.user+cpu.system)/1000).toFixed(3),error:String(error?.stack||error)}; }
}

function remnantQuality(result){ return {largestM2:result.metrics.largestCommercialRemnantM2,secondM2:result.metrics.secondLargestCommercialRemnantM2,fragments:result.metrics.commercialRemnantCount,totalM2:result.metrics.commercialRemnantAreaM2}; }
function compareRemnantObjects(a,b){ const e=1e-9;if(a.largestM2>b.largestM2+e)return 1;if(b.largestM2>a.largestM2+e)return-1;if(a.secondM2>b.secondM2+e)return 1;if(b.secondM2>a.secondM2+e)return-1;if(a.fragments!==b.fragments)return a.fragments<b.fragments?1:-1;if(a.totalM2>b.totalM2+e)return 1;if(b.totalM2>a.totalM2+e)return-1;return 0; }

function buildFileMap(inputs){ const map=new Map();inputs.forEach((item,index)=>{const root=item.root;if(!root||!existsSync(root))throw new Error("No existe root guardado en META: "+root);for(const path of walkXml(root)){const rel=relative(root,path).replaceAll("\\","/");map.set(index+":"+rel,path);}});return map; }
function walkXml(root){const out=[],stack=[root];while(stack.length){const current=stack.pop();for(const entry of readdirSync(current,{withFileTypes:true})){if(entry.name===".extracted-ok")continue;const full=join(current,entry.name);if(entry.isDirectory())stack.push(full);else if(entry.isFile()&&entry.name.toLowerCase().endsWith(".xml"))out.push(full);}}return out;}

function sanitizeOptimizerEnvironment(){for(const key of Object.keys(process.env)){if(key.startsWith("OPTIMIZER_")&&(key.endsWith("_EXPERIMENTAL")||key==="OPTIMIZER_V10_STAGED_EXPERIMENTAL"||key==="OPTIMIZER_MAX_BEAM_EXPANSIONS"||key==="OPTIMIZER_BEAM_WATCHDOG_MS"||key==="OPTIMIZER_MAX_MASTER_NODES"||key==="OPTIMIZER_MASTER_WATCHDOG_MS"||key==="OPTIMIZER_MAX_RESCUE_ATTEMPTS"||key==="OPTIMIZER_RESCUE_WATCHDOG_MS"||key==="OPTIMIZER_STEP0_TELEMETRY"))delete process.env[key];}process.env.OPTIMIZER_V2_REMNANT_POLISH="1";}

function assertRuntimeCompatible(sourceGit,replayGit){if(!sourceGit||!replayGit||sourceGit===replayGit)return;const allowed=new Set(["scripts/validate-production-runtime-full.mjs","scripts/validate-production-runtime-v1-review.mjs","scripts/prepare-production-runtime-v1-selection.mjs","scripts/replay-production-runtime-attribution.mjs","package.json",".github/workflows/optimizer-saas-hardening.yml","research/optimizer/RUNTIME_ATTRIBUTION_MILESTONE_2026-09-24.md"]);const diff=gitCommand(["diff","--name-only",sourceGit+".."+replayGit]);const paths=diff.split(/\r?\n/).filter(Boolean);if(!paths.length||paths.every((path)=>allowed.has(path)))return;throw new Error("El replay cambiaria el runtime respecto del holdout "+sourceGit+". Archivos distintos: "+paths.join(", "));}

function parseArgs(argv){const out={output:join(REPO,"validation-full"),replayOutput:null,controlSize:50,limit:Infinity,progressEvery:10};for(let i=0;i<argv.length;i++){if(argv[i]==="--output")out.output=argv[++i];else if(argv[i]==="--replay-output")out.replayOutput=argv[++i];else if(argv[i]==="--control-size")out.controlSize=Math.max(0,Number(argv[++i])||0);else if(argv[i]==="--limit")out.limit=Math.max(1,Number(argv[++i])||1);else if(argv[i]==="--progress-every")out.progressEvery=Math.max(1,Number(argv[++i])||10);else throw new Error("Argumento desconocido: "+argv[i]);}return out;}
function readJsonl(path){return readFileSync(path,"utf8").split(/\r?\n/).filter(Boolean).map((line)=>JSON.parse(line));}
function writeJson(path,value){writeFileSync(path,JSON.stringify(value,null,2)+"\n");}
function gitCommand(args){const r=spawnSync("git",args,{cwd:REPO,encoding:"utf8"});return r.status===0?String(r.stdout||"").trim():"";}
function stableRank(value){return createHash("sha256").update(String(value),"utf8").digest("hex");}
function safeId(value){return String(value).replace(/[^a-zA-Z0-9._-]+/g,"_").slice(0,120);}
function finiteOrNull(value){const n=Number(value);return Number.isFinite(n)?n:null;}
function quantile(values,q){if(!values.length)return null;const a=values.slice().sort((x,y)=>x-y),pos=(a.length-1)*q,lo=Math.floor(pos),hi=Math.ceil(pos);return lo===hi?a[lo]:a[lo]+(a[hi]-a[lo])*(pos-lo);}
function timingLite(values){const a=values.filter(Number.isFinite);return{cases:a.length,total:sum(a),p50:quantile(a,.5),p95:quantile(a,.95),p99:quantile(a,.99),max:a.length?Math.max(...a):null};}
function countReasons(rows){const out={};for(const row of rows)for(const reason of row.selectionReasons??[])out[reason]=(out[reason]??0)+1;return out;}
function sum(values){return values.filter(Number.isFinite).reduce((a,b)=>a+b,0);}
function cmp(a,b){return a<b?-1:a>b?1:0;}

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const REPO = path.resolve(__dirname, "../../..");
const OUT = __dirname;
const CORPUS = path.join(REPO, "experiencia/canonical_cases.json");
const TARGETS = [
  ["4048571__JORGE_Tortoroglio4048571.xml", 2439],
  ["4059795__diego_primo4059795.xml", 950],
  ["4059352__victor_moneta4059352.xml", 430],
];
const mode = process.argv[2] || "all";
const fileArg = process.argv[3] || null;

if (mode === "all") parent();
else if (mode === "case") child(fileArg);
else throw new Error("mode all|case");

function load() {
  const raw = JSON.parse(fs.readFileSync(CORPUS, "utf8"));
  return Array.isArray(raw) ? raw : (raw.cases || raw.records || raw.canonical_cases || raw.canonicalCases || raw.data || []);
}
function root(e) { return e?.case ?? e?.canonical ?? e?.optimization_case ?? e?.optimizationCase ?? e; }
function orderNumber(v) {
  const runs = String(v || "").replace(/\.xml$/i, "").match(/\d+/g);
  if (!runs) return Infinity;
  const last = runs.at(-1);
  return Number(last.length > 7 ? last.slice(-7) : last);
}
function strings(e) {
  const r = root(e);
  return [
    e?.file,e?.file_name,e?.fileName,e?.source_file,e?.sourceFile,e?.case_id,e?.caseId,e?.name,e?.id,
    r?.file,r?.file_name,r?.fileName,r?.source_file,r?.sourceFile,r?.case_id,r?.caseId,r?.name,r?.id,
  ].filter(v => typeof v === "string");
}
function countPieces(e) {
  const r = root(e);
  if (!Array.isArray(r?.pieces)) return null;
  return r.pieces.reduce((s,p) => s + Number(p.quantity ?? p.cant ?? 1), 0);
}
function resolve(file, pieces) {
  const order = orderNumber(file);
  const cs = load().filter(e => strings(e).some(s => orderNumber(s) === order));
  const ex = cs.filter(e => countPieces(e) === pieces);
  if (ex.length !== 1) throw new Error(file + ": exact match candidates=" + cs.length + " exact=" + ex.length);
  return ex[0];
}
function num(...xs) {
  for (const x of xs) {
    const n = Number(x);
    if (Number.isFinite(n)) return n;
  }
  return null;
}
function problem(e, file) {
  const r = root(e);
  const width = num(r.panel?.width,r.stock_width,r.stockWidth,r.board_width,r.boardWidth);
  const height = num(r.panel?.height,r.stock_height,r.stockHeight,r.board_height,r.boardHeight);
  const saw = num(r.kerf,r.saw,r.sierra,4.5);
  const trimX = num(r.trim?.x,r.trim_x,r.trimX,r.refiladoX,0);
  const trimY = num(r.trim?.y,r.trim_y,r.trimY,r.refiladoY,0);
  const directional = r.material?.hasGrain === true ||
    Boolean(r.directional ?? r.directional_input ?? r.materialConVeta ?? r.has_grain) ||
    r.pieces.some(p => p.grain === true || p.veta === true || p.rotationAllowed === false);
  const pieces = r.pieces.map((p,i) => ({
    base:num(p.base,p.width), altura:num(p.altura,p.height), cant:num(p.cant,p.quantity,1),
    veta:Boolean(p.veta ?? p.grain ?? (p.rotationAllowed === false)),
    ref:p.ref ?? p.reference ?? i, detalle:p.detalle ?? p.description ?? "",
  }));
  return { file,width,height,saw,trimX,trimY,directional,pieces };
}
function boardDigest(b) {
  return {
    p:(b?.colocadas||[]).map(p => [p?.pieza?.ref,p.base,p.altura,p.x,p.y,Boolean(p.rotada),p.nivel??0]),
    c:(b?.cortes||[]).map(c => [c.x1,c.y1,c.x2,c.y2,c.nivel??0,Boolean(c.terminal)]),
    r:(b?.restos||[]).map(r => [r.x,r.y,r.w,r.h]),
  };
}
function patternDigest(pool) {
  const norm = pool.map(p => ({
    uso:[...p.uso.entries()].sort((a,b) => a[0]-b[0]),
    area:p.area,
    placa:boardDigest(p.placa),
  }));
  return crypto.createHash("sha256").update(JSON.stringify(norm)).digest("hex");
}
function config(p) {
  return {
    placaBase:p.width, placaAltura:p.height, refiladoX:p.trimX, refiladoY:p.trimY,
    sierra:p.saw, etapas:4, materialConVeta:Boolean(p.directional),
    descontarCanto:false, cantoEspesor:0, restoMin:250, restoMax:400,
    usarRustPatternGenerator:true, rondasPatrones:40, usarMascarasUnicasMasterLe4:true,
  };
}
function delta(after, before) {
  const out = {};
  for (const key of ["packCalls","packNanos","chooseCalls","chooseNanos","candidateEvals","repsVisited","fillCalls"]) {
    out[key] = Number(after[key] || 0) - Number(before[key] || 0);
  }
  return out;
}
function add(a, b) {
  for (const key of Object.keys(a)) a[key] += Number(b[key] || 0);
  return a;
}
function zero() {
  return {packCalls:0,packNanos:0,chooseCalls:0,chooseNanos:0,candidateEvals:0,repsVisited:0,fillCalls:0};
}

function child(file) {
  const target = TARGETS.find(x => x[0] === file);
  if (!target) throw new Error("unknown target " + file);

  delete process.env.OPTIMIZER_RUST_BEAM_DERIVED_METRICS_EXPERIMENTAL;
  process.env.OPTIMIZER_RUST_BEAM_RANK_CACHE_EXPERIMENTAL = "1";
  process.env.OPTIMIZER_RUST_LEAN_BEAM_EXPERIMENTAL = "1";
  process.env.OPTIMIZER_RUST_GREEDY_PLAN_EXPERIMENTAL = "1";
  process.env.OPTIMIZER_RUST_LARGE_ROUND_EXPERIMENTAL = "1";
  delete process.env.OPTIMIZER_RUST_LEAN_GREEDY_LARGE_EXPERIMENTAL;

  const rustPacker = require(path.join(REPO, "src/lib/optimizer/legacy/rust/rust-packer.cjs"));
  const original = {};
  const events = [];
  const names = [
    "packBoardLegacyRustBatch",
    "packBoardLegacyRustGreedyBest",
    "packBoardLegacyRustGreedyPlan",
    "packBoardLegacyRustGreedyRound",
    "packBoardLegacyRustBeamCandidates",
    "packBoardLegacyRustBeamCandidatesLite",
    "packBoardLegacyRustCore",
  ];

  for (const name of names) {
    if (typeof rustPacker[name] !== "function") continue;
    original[name] = rustPacker[name];
    let ordinal = 0;
    rustPacker[name] = function(...args) {
      const before = rustPacker.legacyPackerProfileSnapshot();
      const started = process.hrtime.bigint();
      let ok = false;
      try {
        const value = original[name](...args);
        ok = true;
        return value;
      } finally {
        const wallMs = Number(process.hrtime.bigint() - started) / 1e6;
        const after = rustPacker.legacyPackerProfileSnapshot();
        const d = delta(after, before);
        events.push({
          caller:name,
          ordinal:ordinal++,
          ok,
          wallMs,
          ...d,
          chooseMs:d.chooseNanos/1e6,
          packMs:d.packNanos/1e6,
          avgCandidatesPerChoose:d.chooseCalls ? d.candidateEvals/d.chooseCalls : 0,
          avgRepsPerChoose:d.chooseCalls ? d.repsVisited/d.chooseCalls : 0,
        });
      }
    };
  }

  // rust-hybrid destructures rust-packer exports at require time, so require it
  // only after the wrappers above are installed.
  const { generarPatrones } = require(path.join(REPO, "src/lib/optimizer/legacy/patrones.cjs"));
  const p = problem(resolve(file, target[1]), file);
  const cfg = config(p);

  rustPacker.legacyPackerProfileReset(true);
  const t0 = process.hrtime.bigint();
  const pool = generarPatrones(p.pieces, cfg, 40, 7);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const profile = rustPacker.legacyPackerProfileSnapshot();
  rustPacker.legacyPackerProfileReset(false);

  const byCaller = {};
  for (const event of events) {
    const row = byCaller[event.caller] ??= {invocations:0,wallMs:0,...zero()};
    row.invocations++;
    row.wallMs += event.wallMs;
    add(row, event);
  }
  for (const row of Object.values(byCaller)) {
    row.chooseMs = row.chooseNanos/1e6;
    row.packMs = row.packNanos/1e6;
    row.choosePct = profile.chooseNanos ? 100*row.chooseNanos/profile.chooseNanos : 0;
    row.candidatePct = profile.candidateEvals ? 100*row.candidateEvals/profile.candidateEvals : 0;
  }

  const attributed = events.reduce((a,e) => add(a,e), zero());
  const unattributed = delta(profile, attributed);
  const roundEvents = events.filter(e => e.caller === "packBoardLegacyRustGreedyRound");
  const row = {
    file,
    pieces:target[1],
    ms,
    poolSize:pool.length,
    digest:patternDigest(pool),
    profile,
    byCaller,
    unattributed,
    greedyRoundCount:roundEvents.length,
    greedyRounds:roundEvents,
  };
  process.stdout.write("RESULT " + JSON.stringify(row) + "\n");
}

function run(file) {
  const env = {...process.env,RUST_LEGACY_DEBUG_ERRORS:"1",OPTIMIZER_RUST_MASTER_ROUND_REUSE_EXPERIMENTAL:"0"};
  const r = spawnSync(process.execPath,[__filename,"case",file],{cwd:REPO,env,encoding:"utf8",maxBuffer:100*1024*1024});
  if (r.status !== 0) throw new Error(file + " failed\n" + r.stdout + "\n" + r.stderr);
  const line = r.stdout.split(/\r?\n/).find(x => x.startsWith("RESULT "));
  if (!line) throw new Error("missing RESULT " + file);
  return JSON.parse(line.slice(7));
}

function parent() {
  const rows = [];
  for (const [file] of TARGETS) {
    const row = run(file);
    rows.push(row);
    const g = row.byCaller.packBoardLegacyRustGreedyRound;
    console.log(
      file +
      " rounds=" + row.greedyRoundCount +
      " totalChoose=" + row.profile.chooseCalls +
      " greedyRoundChoose=" + (g?.chooseCalls || 0) +
      " share=" + (g?.choosePct || 0).toFixed(2) + "%"
    );
  }

  const summary = {
    totalChooseCalls:0,totalChooseNanos:0,totalCandidateEvals:0,totalPackCalls:0,
    greedyRoundChooseCalls:0,greedyRoundChooseNanos:0,greedyRoundCandidateEvals:0,
    greedyRoundInvocations:0,
  };
  for (const row of rows) {
    summary.totalChooseCalls += row.profile.chooseCalls;
    summary.totalChooseNanos += row.profile.chooseNanos;
    summary.totalCandidateEvals += row.profile.candidateEvals;
    summary.totalPackCalls += row.profile.packCalls;
    const g = row.byCaller.packBoardLegacyRustGreedyRound;
    if (g) {
      summary.greedyRoundChooseCalls += g.chooseCalls;
      summary.greedyRoundChooseNanos += g.chooseNanos;
      summary.greedyRoundCandidateEvals += g.candidateEvals;
      summary.greedyRoundInvocations += g.invocations;
    }
  }
  summary.greedyRoundChoosePct = summary.totalChooseNanos ? 100*summary.greedyRoundChooseNanos/summary.totalChooseNanos : 0;
  summary.greedyRoundCallPct = summary.totalChooseCalls ? 100*summary.greedyRoundChooseCalls/summary.totalChooseCalls : 0;
  summary.greedyRoundCandidatePct = summary.totalCandidateEvals ? 100*summary.greedyRoundCandidateEvals/summary.totalCandidateEvals : 0;

  const result = {schema:"master40-choose-caller-profile-v1",rounds:40,rows,summary};
  fs.writeFileSync(path.join(OUT,"choose-caller-profile-results.json"),JSON.stringify(result,null,2)+"\n");
  console.log("MASTER40_CHOOSE_CALLER_PROFILE " + JSON.stringify(result));
}

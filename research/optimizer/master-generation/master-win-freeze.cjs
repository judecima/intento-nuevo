"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const REPO = path.resolve(__dirname, "../../..");
const OUT = __dirname;
const CORPUS = path.join(REPO, "experiencia/canonical_cases.json");
const INPUT = path.join(OUT, "master-win-mining-results.json");
const SHARD_INDEX = Number(process.env.SHARD_INDEX || 0);
const SHARD_TOTAL = Number(process.env.SHARD_TOTAL || 1);
const MODE = process.argv[2] || "shard";

const FULL_SOLVE_MS = 8000;
const FULL_NODES = 1600000;
const FULL_WATCHDOG_MS = 12000;

process.env.OPTIMIZER_RUST_BEAM_RANK_CACHE_EXPERIMENTAL = "1";
process.env.OPTIMIZER_RUST_LEAN_BEAM_EXPERIMENTAL = "1";
process.env.OPTIMIZER_RUST_GREEDY_PLAN_EXPERIMENTAL = "1";
process.env.OPTIMIZER_RUST_LARGE_ROUND_EXPERIMENTAL = "1";
process.env.OPTIMIZER_RUST_SIMPLE_CHOOSE_EXPERIMENTAL = "1";
process.env.OPTIMIZER_RUST_MASTER_ROUND_REUSE_EXPERIMENTAL = "0";
process.env.OPTIMIZER_MASTER_UNIQUE_MASKS_LE4_EXPERIMENTAL = "1";
delete process.env.OPTIMIZER_RUST_BEAM_DERIVED_METRICS_EXPERIMENTAL;

const { generarPatronesLegacyRustHybrid } =
  require(path.join(REPO, "src/lib/optimizer/legacy/rust/rust-patrones.cjs"));
const { patronesMonotipo } =
  require(path.join(REPO, "src/lib/optimizer/legacy/patrones.cjs"));
const { resolverCobertura } =
  require(path.join(REPO, "src/lib/optimizer/legacy/cobertura.cjs"));
const { materializar } =
  require(path.join(REPO, "src/lib/optimizer/legacy/materializar.cjs"));
const { validarPlanIndustrial } =
  require(path.join(REPO, "src/lib/optimizer/legacy/v10.cjs"));
const { calidadPlanPlacas, compararCalidad } =
  require(path.join(REPO, "src/lib/optimizer/legacy/motor.cjs"));

if (MODE === "shard") shard();
else if (MODE === "report") report();
else throw new Error("mode must be shard|report");

function loadCorpus() {
  const raw = JSON.parse(fs.readFileSync(CORPUS, "utf8"));
  return Array.isArray(raw)
    ? raw
    : (raw.cases || raw.records || raw.canonical_cases || raw.canonicalCases || raw.data || []);
}

function root(e) {
  return e?.case ?? e?.canonical ?? e?.optimization_case ?? e?.optimizationCase ?? e;
}

function num(...xs) {
  for (const x of xs) {
    const n = Number(x);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function problem(e) {
  const r = root(e);
  if (!Array.isArray(r?.pieces) || r.pieces.length === 0) throw new Error("missing pieces");
  const width = num(r.panel?.width, r.stock_width, r.stockWidth, r.board_width, r.boardWidth);
  const height = num(r.panel?.height, r.stock_height, r.stockHeight, r.board_height, r.boardHeight);
  const saw = num(r.kerf, r.saw, r.sierra, 4.5);
  const trimX = num(r.trim?.x, r.trim_x, r.trimX, r.refiladoX, 0);
  const trimY = num(r.trim?.y, r.trim_y, r.trimY, r.refiladoY, 0);
  const directional =
    r.material?.hasGrain === true ||
    Boolean(r.directional ?? r.directional_input ?? r.materialConVeta ?? r.has_grain) ||
    r.pieces.some((p) => p.grain === true || p.veta === true || p.rotationAllowed === false);
  const lines = r.pieces.map((p, i) => ({
    base: num(p.base, p.width),
    altura: num(p.altura, p.height),
    cant: num(p.cant, p.quantity, 1),
    veta: Boolean(p.veta ?? p.grain ?? (p.rotationAllowed === false)),
    ref: p.ref ?? p.reference ?? i,
    detalle: p.detalle ?? p.description ?? "",
  }));
  const pieces = lines.reduce((sum, line) => sum + line.cant, 0);
  return { width, height, saw, trimX, trimY, directional, lines, pieces };
}

function config(p) {
  return {
    placaBase: p.width,
    placaAltura: p.height,
    refiladoX: p.trimX,
    refiladoY: p.trimY,
    sierra: p.saw,
    etapas: 4,
    materialConVeta: Boolean(p.directional),
    descontarCanto: false,
    cantoEspesor: 0,
    restoMin: 250,
    restoMax: 400,
    usarRustPatternGenerator: true,
    usarCache: false,
    maxPiezasCache: 0,
    rondasPatrones: 40,
    msMaster: FULL_SOLVE_MS,
    usarMascarasUnicasMasterLe4: true,
  };
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function boardDigest(board) {
  return {
    placements: (board?.colocadas || []).map((p) => [
      p?.pieza?.ref, p.base, p.altura, p.x, p.y, Boolean(p.rotada), p.nivel ?? 0,
    ]),
    cuts: (board?.cortes || []).map((c) => [
      c.x1, c.y1, c.x2, c.y2, c.nivel ?? 0, Boolean(c.terminal),
    ]),
    remnants: (board?.restos || []).map((r) => [r.x, r.y, r.w, r.h]),
  };
}

function patternPoolDigest(pool) {
  return digest(pool.map((pattern) => ({
    usage: [...pattern.uso.entries()].sort((a, b) => a[0] - b[0]),
    area: pattern.area,
    board: boardDigest(pattern.placa),
  })));
}

function planDigest(plan) {
  return plan ? digest((plan.placas || []).map(boardDigest)) : null;
}

function runBaselineFull40(p, preMasterBoards) {
  const cfg = config(p);
  const genStart = process.hrtime.bigint();
  const generated = generarPatronesLegacyRustHybrid(p.lines, cfg, 40, 7);
  const generationMs = Number(process.hrtime.bigint() - genStart) / 1e6;
  const monotype = patronesMonotipo(p.lines, cfg);
  const pool = generated.concat(monotype);
  const poolDigest = patternPoolDigest(generated);
  const solverPoolDigest = patternPoolDigest(pool);
  const area = (cfg.placaBase - cfg.refiladoX) * (cfg.placaAltura - cfg.refiladoY);

  const solveStart = process.hrtime.bigint();
  const handle = resolverCobertura(
    pool,
    p.lines.map((line) => line.cant),
    area,
    preMasterBoards,
    FULL_SOLVE_MS,
    { maxNodos: FULL_NODES, watchdogMs: FULL_WATCHDOG_MS },
  );
  const solution = handle
    ? handle.resolver(p.lines.map((line) => line.base * line.altura))
    : null;
  const solveMs = Number(process.hrtime.bigint() - solveStart) / 1e6;

  const opts = {
    ...cfg,
    anchoUtil: cfg.placaBase - cfg.refiladoX,
    altoUtil: cfg.placaAltura - cfg.refiladoY,
  };
  let plan = null;
  let validation = null;
  let quality = null;
  if (solution?.plan) {
    plan = materializar(solution.plan, p.lines, opts);
    validation = plan ? validarPlanIndustrial(plan, p.pieces) : null;
    quality = plan ? calidadPlanPlacas(plan.placas || [], plan.opts || opts) : null;
  }

  return {
    boards: plan?.resumen?.placas ?? solution?.placas ?? preMasterBoards,
    improved: Boolean(plan && validation?.ok && (plan.resumen?.placas ?? Infinity) < preMasterBoards),
    valid: Boolean(plan && validation?.ok),
    poolDigest,
    solverPoolDigest,
    planDigest: planDigest(plan),
    quality,
    generationMs: +generationMs.toFixed(3),
    solveMs: +solveMs.toFixed(3),
    nodes: solution?.nodos ?? null,
    generatedPatterns: generated.length,
    monotypePatterns: monotype.length,
    maskPolicy: cfg._patternMaskPolicy || null,
  };
}

function sameQuality(a, b) {
  if (!a || !b) return a === b;
  return compararCalidad(a, b) === 0;
}

function freezeOne(win, corpus) {
  const index = Number(win.canonicalIndex);
  const entry = corpus[index];
  if (!entry) {
    return { ...win, reproduced: false, freezeReason: "canonical-index-missing" };
  }

  const p = problem(entry);
  if (p.pieces !== Number(win.pieces)) {
    return { ...win, reproduced: false, freezeReason: "piece-count-mismatch" };
  }

  const pre = Number(win.preMasterBoards);
  const run1 = runBaselineFull40(p, pre);
  const run2 = runBaselineFull40(p, pre);

  const samePool =
    run1.poolDigest === run2.poolDigest &&
    run1.solverPoolDigest === run2.solverPoolDigest;
  const samePlan = run1.planDigest !== null && run1.planDigest === run2.planDigest;
  const sameBoards = run1.boards === run2.boards;
  const samePhysicalQuality = sameQuality(run1.quality, run2.quality);
  const bothImprove = run1.improved && run2.improved;
  const reproduced =
    bothImprove &&
    samePool &&
    samePlan &&
    sameBoards &&
    samePhysicalQuality;

  let freezeReason = "reproduced";
  if (!bothImprove) freezeReason = "full40-did-not-improve-twice";
  else if (!samePool) freezeReason = "pool-digest-not-reproducible";
  else if (!sameBoards) freezeReason = "board-count-not-reproducible";
  else if (!samePlan) freezeReason = "physical-plan-not-reproducible";
  else if (!samePhysicalQuality) freezeReason = "quality-not-reproducible";

  return {
    ...win,
    reproduced,
    freezeReason,
    benchmarkReference: reproduced
      ? {
          boards: run1.boards,
          poolDigest: run1.poolDigest,
          solverPoolDigest: run1.solverPoolDigest,
          planDigest: run1.planDigest,
          quality: run1.quality,
          solveContract: {
            incumbent: pre,
            milliseconds: FULL_SOLVE_MS,
            maxNodes: FULL_NODES,
            watchdogMs: FULL_WATCHDOG_MS,
            rounds: 40,
            seed: 7,
            generator: "generarPatronesLegacyRustHybrid-one-shot",
            uniqueMaskPolicy: "first-unique-mask-le4-when-applicable",
          },
        }
      : null,
    reproduction: { run1, run2 },
  };
}

function shard() {
  if (!fs.existsSync(INPUT)) throw new Error("missing " + INPUT);
  const mining = JSON.parse(fs.readFileSync(INPUT, "utf8"));
  const corpus = loadCorpus();
  const wins = mining.allWins || [];
  const rows = [];

  for (let i = SHARD_INDEX; i < wins.length; i += SHARD_TOTAL) {
    const frozen = freezeOne(wins[i], corpus);
    rows.push(frozen);
    console.log(
      "FREEZE_WIN " +
      JSON.stringify({
        order: frozen.order,
        reproduced: frozen.reproduced,
        reason: frozen.freezeReason,
        pre: frozen.preMasterBoards,
        reference: frozen.benchmarkReference?.boards ?? null,
      }),
    );
  }

  const payload = {
    schema: "perfv1-master-win-freeze-shard-v1",
    generatedAt: new Date().toISOString(),
    shard: SHARD_INDEX,
    shardTotal: SHARD_TOTAL,
    inputWins: wins.length,
    solveContract: {
      milliseconds: FULL_SOLVE_MS,
      maxNodes: FULL_NODES,
      watchdogMs: FULL_WATCHDOG_MS,
      rounds: 40,
      seed: 7,
    },
    rows,
  };
  const out = path.join(OUT, "master-win-freeze-shard-" + SHARD_INDEX + ".json");
  fs.writeFileSync(out, JSON.stringify(payload, null, 2) + "\n");
  console.log("MASTER_WIN_FREEZE_SHARD " + JSON.stringify({
    shard: SHARD_INDEX,
    tested: rows.length,
    reproduced: rows.filter((r) => r.reproduced).length,
  }));
}

function report() {
  const expected = Number(process.env.SHARD_TOTAL || 8);
  const files = fs.readdirSync(OUT)
    .filter((name) => /^master-win-freeze-shard-\d+\.json$/.test(name))
    .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
  if (files.length !== expected) throw new Error("expected " + expected + " shards, got " + files.length);

  const rows = files
    .flatMap((file) => JSON.parse(fs.readFileSync(path.join(OUT, file), "utf8")).rows || [])
    .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));

  const reproduced = rows.filter((r) => r.reproduced);
  const reproducedHoldout = reproduced.filter((r) => !r.isTrainingCase);
  const reproducedNovelHoldout = reproducedHoldout.filter((r) => !r.historicalWinner);
  const rejected = rows.filter((r) => !r.reproduced);

  const result = {
    schema: "perfv1-master-win-frozen-manifest-v1",
    generatedAt: new Date().toISOString(),
    sourceMiningSchema: "perfv1-master-win-mining-v1",
    solveContract: {
      milliseconds: FULL_SOLVE_MS,
      maxNodes: FULL_NODES,
      watchdogMs: FULL_WATCHDOG_MS,
      rounds: 40,
      seed: 7,
      generator: "generarPatronesLegacyRustHybrid-one-shot",
    },
    counts: {
      detectedWins: rows.length,
      reproducedWins: reproduced.length,
      reproducedTrainingWins: reproduced.filter((r) => r.isTrainingCase).length,
      reproducedHoldoutWins: reproducedHoldout.length,
      reproducedNovelHoldoutWins: reproducedNovelHoldout.length,
      rejectedWins: rejected.length,
      target20Reached: reproducedHoldout.length >= 20,
      target30Reached: reproducedHoldout.length >= 30,
    },
    frozenHoldoutWins: reproducedHoldout,
    frozenNovelHoldoutWins: reproducedNovelHoldout,
    frozenAllWins: reproduced,
    rejected,
  };

  const out = path.join(OUT, "master-win-frozen-manifest.json");
  fs.writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
  console.log("MASTER_WIN_FROZEN " + JSON.stringify({
    counts: result.counts,
    orders: reproducedHoldout.map((r) => r.order),
    rejected: rejected.map((r) => ({ order: r.order, reason: r.freezeReason })),
  }));
}

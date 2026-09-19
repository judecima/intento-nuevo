"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const REPO = path.resolve(__dirname, "../../..");
const OUT_DIR = __dirname;
const COHORT_PATH = path.join(OUT_DIR, "tail-e2e-cohort.json");
const CONTROL_PATH = path.join(OUT_DIR, "tail-e2e-control.json");
const CANDIDATE_PATH = path.join(OUT_DIR, "tail-e2e-candidate.json");
const RESULT_PATH = path.join(OUT_DIR, "tail-e2e-results.json");

const V10_PATH = path.join(REPO, "experiencia/v5/baseline-v10-5000-2000-r1.json");
const FAST1_PATH = path.join(REPO, "experiencia/v5/baseline-baseline-5000-2000-r1.json");
const FAST2_PATH = path.join(REPO, "experiencia/v5/baseline-baseline-5000-2000-r2.json");
const CANONICAL_PATH = path.join(REPO, "experiencia/canonical_cases.json");

const TEST_START = 1600;
const TEST_END = 2000;
const TARGET_ROUTE_FRACTION = 0.20;
const MIN_MAPPING_RATE = 0.90;

const mode = process.argv[2] || "all";

if (mode === "all") {
  prepare();
  runChild("control");
  runChild("candidate");
  report();
} else if (mode === "prepare") {
  prepare();
} else if (mode === "control" || mode === "candidate") {
  runMode(mode);
} else if (mode === "report") {
  report();
} else {
  throw new Error("mode must be all|prepare|control|candidate|report");
}

function runChild(childMode) {
  const r = spawnSync(process.execPath, [__filename, childMode], {
    cwd: REPO,
    stdio: "inherit",
    env: {
      ...process.env,
      OPTIMIZER_RUST_MASTER_ROUND_REUSE_EXPERIMENTAL: "0",
      OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL: "0",
      OPTIMIZER_POST_COMPACT_CHEAP_LB_EXPERIMENTAL: "0",
      OPTIMIZER_DFF_FS0_LB_EXPERIMENTAL: "0",
      OPTIMIZER_MASTER_UNIQUE_MASKS_LE4_EXPERIMENTAL: "0",
      RUST_LEGACY_DEBUG_ERRORS: "1",
    },
  });
  if (r.status !== 0) throw new Error(childMode + " child failed with status " + r.status);
}

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function quantile(values, p) {
  const xs = values.slice().sort((a, b) => a - b);
  if (!xs.length) return 0;
  const pos = (xs.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? xs[lo] : xs[lo] + (xs[hi] - xs[lo]) * (pos - lo);
}

function pieceBucket(n) {
  if (n <= 20) return "p0_20";
  if (n <= 50) return "p21_50";
  if (n <= 100) return "p51_100";
  if (n <= 200) return "p101_200";
  if (n <= 500) return "p201_500";
  return "p500p";
}

function boardBucket(n) {
  if (n <= 1) return "b1";
  if (n <= 4) return "b2_4";
  if (n <= 9) return "b5_9";
  if (n <= 19) return "b10_19";
  return "b20p";
}

function familyKey(row) {
  return pieceBucket(row.pieces) + "|" + boardBucket(row.fastBoards);
}

function fitRouter(train, targetFraction) {
  const fallback = quantile(train.map((x) => x.v10Ms), 0.95);
  const groups = new Map();
  for (const row of train) {
    const key = familyKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row.v10Ms);
  }
  const familyScores = new Map();
  for (const [key, values] of groups) {
    const shrink = Math.min(1, values.length / 8);
    const local = quantile(values, 0.80);
    familyScores.set(key, shrink * local + (1 - shrink) * fallback);
  }
  const ranked = train
    .map((row) => ({ ...row, score: familyScores.get(familyKey(row)) ?? fallback }))
    .sort((a, b) => b.score - a.score || b.fastMs - a.fastMs || a.order - b.order);
  const selected = Math.max(1, Math.ceil(train.length * targetFraction));
  const boundary = ranked[selected - 1];
  return {
    familyScores,
    fallback,
    boundaryScore: boundary.score,
    boundaryFastMs: boundary.fastMs,
  };
}

function predictsTail(row, model) {
  const score = model.familyScores.get(familyKey(row)) ?? model.fallback;
  if (score > model.boundaryScore) return true;
  if (score < model.boundaryScore) return false;
  return row.fastMs >= model.boundaryFastMs;
}

function historicalRows() {
  const v10 = loadJson(V10_PATH);
  const f1 = loadJson(FAST1_PATH);
  const f2 = loadJson(FAST2_PATH);
  const map1 = new Map(f1.records.filter((r) => r.ok).map((r) => [r.file, r]));
  const map2 = new Map(f2.records.filter((r) => r.ok).map((r) => [r.file, r]));
  return v10.records
    .filter((r) => r.ok && map1.has(r.file) && map2.has(r.file))
    .map((r) => {
      const a = map1.get(r.file);
      const b = map2.get(r.file);
      const fast = a.totalMs <= b.totalMs ? a : b;
      return {
        file: r.file,
        order: r.order,
        pieces: r.pieces,
        fastMs: fast.totalMs,
        fastBoards: fast.boards,
        v10Ms: r.totalMs,
        v10Boards: r.boards,
      };
    })
    .sort((a, b) => a.order - b.order);
}

function unwrapCorpus(raw) {
  if (Array.isArray(raw)) return raw;
  for (const key of ["cases", "records", "canonical_cases", "canonicalCases", "data"]) {
    if (Array.isArray(raw?.[key])) return raw[key];
  }
  throw new Error("Unsupported canonical corpus top-level shape: " + Object.keys(raw || {}).join(","));
}

function rootOf(entry) {
  return entry?.case ?? entry?.canonical ?? entry?.optimization_case ?? entry?.optimizationCase ?? entry;
}

function stringsForEntry(entry) {
  const root = rootOf(entry);
  const values = [
    entry?.file,
    entry?.file_name,
    entry?.fileName,
    entry?.source_file,
    entry?.sourceFile,
    entry?.case_id,
    entry?.caseId,
    entry?.name,
    entry?.id,
    root?.file,
    root?.file_name,
    root?.fileName,
    root?.source_file,
    root?.sourceFile,
    root?.case_id,
    root?.caseId,
    root?.name,
    root?.id,
  ];
  return values.filter((v) => typeof v === "string" && v.length > 0);
}

function normalizeId(value) {
  return String(value || "")
    .replace(/\.xml$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function orderNumber(value) {
  const stem = String(value || "").replace(/\.xml$/i, "");
  const runs = stem.match(/\d+/g);
  if (!runs) return Number.POSITIVE_INFINITY;
  const last = runs[runs.length - 1];
  return Number(last.length > 7 ? last.slice(-7) : last);
}

function buildCorpusIndex(entries) {
  const byId = new Map();
  const byOrder = new Map();
  for (const entry of entries) {
    const names = stringsForEntry(entry);
    for (const name of names) {
      const id = normalizeId(name);
      if (id && !byId.has(id)) byId.set(id, entry);
      const order = orderNumber(name);
      if (Number.isFinite(order)) {
        if (!byOrder.has(order)) byOrder.set(order, []);
        if (!byOrder.get(order).includes(entry)) byOrder.get(order).push(entry);
      }
    }
    const explicitOrder = Number(entry?.order ?? rootOf(entry)?.order);
    if (Number.isFinite(explicitOrder)) {
      if (!byOrder.has(explicitOrder)) byOrder.set(explicitOrder, []);
      if (!byOrder.get(explicitOrder).includes(entry)) byOrder.get(explicitOrder).push(entry);
    }
  }
  return { byId, byOrder };
}

function resolveCorpusEntry(hist, index) {
  const exact = index.byId.get(normalizeId(hist.file));
  if (exact) return exact;
  const candidates = index.byOrder.get(hist.order) || [];
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    const wanted = normalizeId(hist.file);
    const scored = candidates
      .map((entry) => {
        const names = stringsForEntry(entry).map(normalizeId);
        const score = names.reduce((best, name) => {
          if (name === wanted) return 1000;
          if (name.includes(wanted) || wanted.includes(name)) return Math.max(best, 500);
          return best;
        }, 0);
        return { entry, score };
      })
      .sort((a, b) => b.score - a.score);
    if (scored[0]?.score > 0) return scored[0].entry;
  }
  return null;
}

function firstNumber(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function toProblem(entry, hist) {
  const root = rootOf(entry);
  const canonical = root?.panel && Array.isArray(root?.pieces);
  const stockWidth = canonical
    ? firstNumber(root.panel?.width)
    : firstNumber(root.stock_width, root.stockWidth, root.board_width, root.boardWidth, root.panel?.width);
  const stockHeight = canonical
    ? firstNumber(root.panel?.height)
    : firstNumber(root.stock_height, root.stockHeight, root.board_height, root.boardHeight, root.panel?.height);
  const saw = canonical
    ? firstNumber(root.kerf, 4.5)
    : firstNumber(root.saw, root.kerf, root.sierra, 4.5);
  const trimX = canonical ? firstNumber(root.trim?.x, 0) : firstNumber(root.trim_x, root.trimX, root.refiladoX, 0);
  const trimY = canonical ? firstNumber(root.trim?.y, 0) : firstNumber(root.trim_y, root.trimY, root.refiladoY, 0);
  const directional = canonical
    ? root.material?.hasGrain === true || root.pieces.some((p) => p.grain === true || p.rotationAllowed === false)
    : Boolean(
        root.directional ??
        root.directional_input ??
        root.materialConVeta ??
        root.has_grain ??
        root.material?.hasGrain
      );

  if (!(stockWidth > 0) || !(stockHeight > 0) || !Array.isArray(root.pieces) || root.pieces.length === 0) {
    throw new Error("Unsupported canonical entry for " + hist.file);
  }

  const pieces = root.pieces.map((p, index) => ({
    base: firstNumber(p.base, p.width),
    altura: firstNumber(p.altura, p.height),
    cant: firstNumber(p.cant, p.quantity, 1),
    veta: Boolean(p.veta ?? p.grain ?? (p.rotationAllowed === false)),
    ref: p.ref ?? p.reference ?? index,
    detalle: p.detalle ?? p.description ?? "",
  }));

  if (pieces.some((p) => !(p.base > 0) || !(p.altura > 0) || !(p.cant > 0))) {
    throw new Error("Invalid piece geometry for " + hist.file);
  }

  return {
    file: hist.file,
    order: hist.order,
    piecesHistorical: hist.pieces,
    fastMsHistorical: hist.fastMs,
    fastBoardsHistorical: hist.fastBoards,
    v10MsHistorical: hist.v10Ms,
    v10BoardsHistorical: hist.v10Boards,
    stock_width: stockWidth,
    stock_height: stockHeight,
    saw,
    trim_x: trimX,
    trim_y: trimY,
    directional,
    reference_panels: firstNumber(root.reference_panels, root.referencePanels, hist.v10Boards),
    pieces,
  };
}

function prepare() {
  const rows = historicalRows();
  if (rows.length < TEST_END) throw new Error("Need 2000 paired historical rows; got " + rows.length);
  const train = rows.slice(0, TEST_START);
  const test = rows.slice(TEST_START, TEST_END);
  const model = fitRouter(train, TARGET_ROUTE_FRACTION);

  const rawCorpus = loadJson(CANONICAL_PATH);
  const corpusEntries = unwrapCorpus(rawCorpus);
  const index = buildCorpusIndex(corpusEntries);

  const mapped = [];
  const misses = [];
  for (const row of test) {
    const entry = resolveCorpusEntry(row, index);
    if (!entry) {
      misses.push({ file: row.file, order: row.order, reason: "not-found" });
      continue;
    }
    try {
      mapped.push({
        ...toProblem(entry, row),
        routed: predictsTail(row, model),
        family: familyKey(row),
      });
    } catch (error) {
      misses.push({ file: row.file, order: row.order, reason: String(error.message || error) });
    }
  }

  const mappingRate = mapped.length / test.length;
  const cohort = {
    schema: "optimizer-tail-e2e-cohort-v1",
    generatedAt: new Date().toISOString(),
    sourceSha: process.env.GITHUB_SHA || null,
    trainRange: [0, TEST_START],
    testRange: [TEST_START, TEST_END],
    historicalPairedRows: rows.length,
    canonicalEntries: corpusEntries.length,
    testCases: test.length,
    mappedCases: mapped.length,
    mappingRate,
    routedCases: mapped.filter((x) => x.routed).length,
    targetRouteFraction: TARGET_ROUTE_FRACTION,
    model: {
      fallback: model.fallback,
      boundaryScore: model.boundaryScore,
      boundaryFastMs: model.boundaryFastMs,
    },
    misses,
    cases: mapped,
  };

  fs.writeFileSync(COHORT_PATH, JSON.stringify(cohort, null, 2) + "\n");
  console.log("TAIL_E2E_PREPARE " + JSON.stringify({
    paired: rows.length,
    test: test.length,
    mapped: mapped.length,
    mappingRate: +(100 * mappingRate).toFixed(2),
    routed: cohort.routedCases,
    routedPct: +(100 * cohort.routedCases / Math.max(1, mapped.length)).toFixed(2),
    canonicalEntries: corpusEntries.length,
    misses: misses.length,
  }));

  if (mappingRate < MIN_MAPPING_RATE) {
    throw new Error("Canonical mapping rate too low: " + (100 * mappingRate).toFixed(2) + "%");
  }
}

function digestBoard(board) {
  return {
    placements: (board?.colocadas ?? []).map((p) => [
      p?.pieza?.ref,
      p.base,
      p.altura,
      p.x,
      p.y,
      Boolean(p.rotada),
      p.nivel ?? 0,
    ]),
    cuts: (board?.cortes ?? []).map((cut) => [
      cut.x1,
      cut.y1,
      cut.x2,
      cut.y2,
      cut.nivel ?? 0,
      Boolean(cut.terminal),
    ]),
    remnants: (board?.restos ?? []).map((r) => [r.x, r.y, r.w, r.h]),
  };
}

function planDigest(plan) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify((plan?.placas ?? []).map(digestBoard)))
    .digest("hex");
}

function configFor(c, safeStack) {
  const totalPieces = c.pieces.reduce((sum, p) => sum + p.cant, 0);
  const cacheLimit = totalPieces <= 160 ? 160 : 0;
  return {
    placaBase: c.stock_width,
    placaAltura: c.stock_height,
    refiladoX: c.trim_x || 0,
    refiladoY: c.trim_y || 0,
    sierra: c.saw || 4.5,
    etapas: 4,
    materialConVeta: Boolean(c.directional),
    descontarCanto: false,
    cantoEspesor: 0,
    restoMin: 250,
    restoMax: 400,
    usarOneBoard: true,
    usarMaster: true,
    usarMultiSlice: true,
    usarCompactacion: true,
    usarRustPatternGenerator: true,
    usarCache: cacheLimit > 0,
    maxPiezasCache: cacheLimit,
    rondasPatrones: 40,
    msMaster: 8000,
    usarCotaBarataPostCompactacion: safeStack,
    usarDffFs0PostCompactacion: safeStack,
    usarMascarasUnicasMasterLe4: safeStack,
  };
}

function runMode(runModeName) {
  const {
    optimizarV10,
    nuevasMetricas,
    validarPlanIndustrial,
  } = require(path.join(REPO, "src/lib/optimizer/legacy/v10.cjs"));
  const {
    calidadPlanPlacas,
  } = require(path.join(REPO, "src/lib/optimizer/legacy/motor.cjs"));

  const cohort = loadJson(COHORT_PATH);
  const candidateMode = runModeName === "candidate";
  const records = [];
  const startedAt = Date.now();

  process.env.OPTIMIZER_RUST_MASTER_ROUND_REUSE_EXPERIMENTAL = "0";
  process.env.OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL = "0";
  process.env.OPTIMIZER_POST_COMPACT_CHEAP_LB_EXPERIMENTAL = "0";
  process.env.OPTIMIZER_DFF_FS0_LB_EXPERIMENTAL = "0";
  process.env.OPTIMIZER_MASTER_UNIQUE_MASKS_LE4_EXPERIMENTAL = "0";

  for (let i = 0; i < cohort.cases.length; i++) {
    const c = cohort.cases[i];
    const safeStack = candidateMode && c.routed;
    const config = configFor(c, safeStack);
    const expectedPieces = c.pieces.reduce((sum, p) => sum + p.cant, 0);
    const lines = c.pieces.map((p, index) => ({
      base: p.base,
      altura: p.altura,
      cant: p.cant,
      veta: Boolean(c.directional) && Boolean(p.veta),
      ref: p.ref ?? index,
      detalle: p.detalle || "",
    }));

    const t0 = process.hrtime.bigint();
    let result = null;
    let error = null;
    try {
      result = optimizarV10(lines, config, nuevasMetricas());
    } catch (e) {
      error = String(e?.stack || e?.message || e).slice(0, 1000);
    }
    const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;

    const plan = result?.plan ?? null;
    const validation = plan ? validarPlanIndustrial(plan, expectedPieces) : { ok: false };
    const boards = plan?.resumen?.placas ?? null;
    const quality = plan
      ? calidadPlanPlacas(plan.placas, plan.opts || config)
      : null;

    records.push({
      file: c.file,
      order: c.order,
      routed: c.routed,
      family: c.family,
      safeStack,
      ok: !error && Boolean(validation?.ok),
      error,
      validationOk: Boolean(validation?.ok),
      pieces: expectedPieces,
      types: lines.length,
      boards,
      elapsedMs,
      planDigest: plan ? planDigest(plan) : null,
      quality,
      lowerBound: result?.metricas?.lowerBound ?? null,
      master: result?.metricas?.master ?? null,
      multislice: result?.metricas?.multislice ?? null,
      compactacion: result?.metricas?.compactacion ?? null,
      maskPolicy: config._patternMaskPolicy ?? null,
      rustUsed: config._rustPatternGeneratorUsed ?? null,
      rustFallback: config._rustPatternGeneratorFallback ?? null,
      historical: {
        fastMs: c.fastMsHistorical,
        fastBoards: c.fastBoardsHistorical,
        v10Ms: c.v10MsHistorical,
        v10Boards: c.v10BoardsHistorical,
      },
    });

    if ((i + 1) % 25 === 0) {
      console.log(runModeName + " " + (i + 1) + "/" + cohort.cases.length +
        " wall=" + ((Date.now() - startedAt) / 1000).toFixed(1) + "s");
    }
  }

  const payload = {
    schema: "optimizer-tail-e2e-run-v1",
    mode: runModeName,
    generatedAt: new Date().toISOString(),
    sourceSha: process.env.GITHUB_SHA || null,
    cases: records.length,
    wallClockMs: Date.now() - startedAt,
    records,
  };

  const out = runModeName === "control" ? CONTROL_PATH : CANDIDATE_PATH;
  fs.writeFileSync(out, JSON.stringify(payload, null, 2) + "\n");
  console.log("TAIL_E2E_RUN " + JSON.stringify({
    mode: runModeName,
    cases: records.length,
    ok: records.filter((r) => r.ok).length,
    wallClockMs: payload.wallClockMs,
  }));
}

function latencySummary(records) {
  const ms = records.filter((r) => r.ok).map((r) => r.elapsedMs);
  return {
    n: ms.length,
    totalMs: +ms.reduce((a, b) => a + b, 0).toFixed(2),
    avgMs: +(ms.reduce((a, b) => a + b, 0) / Math.max(1, ms.length)).toFixed(2),
    p50Ms: +quantile(ms, 0.50).toFixed(2),
    p90Ms: +quantile(ms, 0.90).toFixed(2),
    p95Ms: +quantile(ms, 0.95).toFixed(2),
    p99Ms: +quantile(ms, 0.99).toFixed(2),
    maxMs: +(ms.length ? Math.max(...ms) : 0).toFixed(2),
  };
}

function pctReduction(before, after) {
  return before > 0 ? +(100 * (before - after) / before).toFixed(2) : 0;
}

function report() {
  const { compararCalidad } = require(path.join(REPO, "src/lib/optimizer/legacy/motor.cjs"));
  const cohort = loadJson(COHORT_PATH);
  const control = loadJson(CONTROL_PATH);
  const candidate = loadJson(CANDIDATE_PATH);

  const cMap = new Map(control.records.map((r) => [r.file, r]));
  const nMap = new Map(candidate.records.map((r) => [r.file, r]));
  const pairs = cohort.cases
    .map((meta) => ({ meta, control: cMap.get(meta.file), candidate: nMap.get(meta.file) }))
    .filter((p) => p.control && p.candidate);

  const validPairs = pairs.filter((p) => p.control.ok && p.candidate.ok);
  const boardRegressions = validPairs.filter((p) => p.candidate.boards > p.control.boards);
  const boardImprovements = validPairs.filter((p) => p.candidate.boards < p.control.boards);
  const remnantRegressions = validPairs.filter((p) =>
    p.candidate.boards === p.control.boards &&
    p.control.quality &&
    p.candidate.quality &&
    compararCalidad(p.candidate.quality, p.control.quality) < 0
  );
  const digestDiffs = validPairs.filter((p) => p.candidate.planDigest !== p.control.planDigest);
  const candidateInvalid = pairs.filter((p) => !p.candidate.ok);
  const controlInvalid = pairs.filter((p) => !p.control.ok);

  const controlOk = control.records.filter((r) => r.ok);
  const candidateOk = candidate.records.filter((r) => r.ok);
  const controlLatency = latencySummary(controlOk);
  const candidateLatency = latencySummary(candidateOk);

  const routedControl = controlOk.filter((r) => r.routed);
  const routedCandidate = candidateOk.filter((r) => r.routed);
  const nonRoutedControl = controlOk.filter((r) => !r.routed);
  const nonRoutedCandidate = candidateOk.filter((r) => !r.routed);

  const currentP95 = quantile(controlOk.map((r) => r.elapsedMs), 0.95);
  const currentP99 = quantile(controlOk.map((r) => r.elapsedMs), 0.99);
  const currentTail95 = controlOk.filter((r) => r.elapsedMs >= currentP95);
  const currentTail99 = controlOk.filter((r) => r.elapsedMs >= currentP99);
  const routedSet = new Set(cohort.cases.filter((c) => c.routed).map((c) => c.file));

  const routedCpuControl = routedControl.reduce((sum, r) => sum + r.elapsedMs, 0);
  const totalCpuControl = controlOk.reduce((sum, r) => sum + r.elapsedMs, 0);

  const result = {
    schema: "optimizer-tail-e2e-confirmation-v1",
    generatedAt: new Date().toISOString(),
    sourceSha: process.env.GITHUB_SHA || null,
    methodology: {
      trainHistorical: [0, TEST_START],
      testHistorical: [TEST_START, TEST_END],
      targetRoutePct: TARGET_ROUTE_FRACTION * 100,
      actualMappedCases: cohort.mappedCases,
      mappingRatePct: +(100 * cohort.mappingRate).toFixed(2),
      routedCases: cohort.routedCases,
      routedPct: +(100 * cohort.routedCases / Math.max(1, cohort.mappedCases)).toFixed(2),
      note: "Both arms use the Performance V1 codebase. Candidate enables only the certified safe stack on routed cases; Master round reuse stays off because this gate measures V10/Balanced tail, not Balanced->Deep continuation.",
    },
    currentTailPrediction: {
      controlP95Ms: +currentP95.toFixed(2),
      controlP99Ms: +currentP99.toFixed(2),
      recallP95Pct: +(100 * currentTail95.filter((r) => routedSet.has(r.file)).length / Math.max(1, currentTail95.length)).toFixed(2),
      recallP99Pct: +(100 * currentTail99.filter((r) => routedSet.has(r.file)).length / Math.max(1, currentTail99.length)).toFixed(2),
      routedCpuSharePct: +(100 * routedCpuControl / Math.max(1, totalCpuControl)).toFixed(2),
    },
    latency: {
      control: controlLatency,
      candidate: candidateLatency,
      improvementPct: {
        total: pctReduction(controlLatency.totalMs, candidateLatency.totalMs),
        avg: pctReduction(controlLatency.avgMs, candidateLatency.avgMs),
        p50: pctReduction(controlLatency.p50Ms, candidateLatency.p50Ms),
        p90: pctReduction(controlLatency.p90Ms, candidateLatency.p90Ms),
        p95: pctReduction(controlLatency.p95Ms, candidateLatency.p95Ms),
        p99: pctReduction(controlLatency.p99Ms, candidateLatency.p99Ms),
        max: pctReduction(controlLatency.maxMs, candidateLatency.maxMs),
      },
      routed: {
        control: latencySummary(routedControl),
        candidate: latencySummary(routedCandidate),
      },
      nonRouted: {
        control: latencySummary(nonRoutedControl),
        candidate: latencySummary(nonRoutedCandidate),
      },
    },
    quality: {
      paired: pairs.length,
      validPairs: validPairs.length,
      controlInvalid: controlInvalid.length,
      candidateInvalid: candidateInvalid.length,
      boardRegressions: boardRegressions.length,
      boardImprovements: boardImprovements.length,
      remnantRegressions: remnantRegressions.length,
      digestDiffs: digestDiffs.length,
      boardRegressionFiles: boardRegressions.slice(0, 20).map((p) => p.meta.file),
      remnantRegressionFiles: remnantRegressions.slice(0, 20).map((p) => p.meta.file),
      invalidCandidateFiles: candidateInvalid.slice(0, 20).map((p) => p.meta.file),
    },
    activation: {
      routedCandidateCases: routedCandidate.length,
      postCompactCertified: routedCandidate.reduce((sum, r) => sum + Number(r.lowerBound?.postCompactCertified || 0), 0),
      postCompactRuns: routedCandidate.reduce((sum, r) => sum + Number(r.lowerBound?.postCompactRuns || 0), 0),
      dffValuePositive: routedCandidate.filter((r) => Number(r.lowerBound?.postCompactValue || 0) > 0).length,
      uniqueMaskCases: routedCandidate.filter((r) => r.maskPolicy?.policy === "first-unique-mask-le4").length,
    },
    topControlTail: controlOk
      .slice()
      .sort((a, b) => b.elapsedMs - a.elapsedMs)
      .slice(0, 20)
      .map((r) => {
        const cand = nMap.get(r.file);
        return {
          file: r.file,
          routed: r.routed,
          controlMs: +r.elapsedMs.toFixed(2),
          candidateMs: cand ? +cand.elapsedMs.toFixed(2) : null,
          speedupPct: cand ? pctReduction(r.elapsedMs, cand.elapsedMs) : null,
          boardsControl: r.boards,
          boardsCandidate: cand?.boards ?? null,
        };
      }),
  };

  fs.writeFileSync(RESULT_PATH, JSON.stringify(result, null, 2) + "\n");
  console.log("TAIL_E2E_RESULT " + JSON.stringify(result));

  if (candidateInvalid.length > 0) {
    throw new Error("Candidate invalid/error cases: " + candidateInvalid.length);
  }
  if (boardRegressions.length > 0) {
    throw new Error("Board regressions: " + boardRegressions.length);
  }
  if (remnantRegressions.length > 0) {
    throw new Error("Remnant regressions: " + remnantRegressions.length);
  }
}

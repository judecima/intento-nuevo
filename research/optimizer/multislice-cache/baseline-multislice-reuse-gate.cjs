"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const REPO = path.resolve(__dirname, "../../..");
const CANONICAL = path.join(REPO, "experiencia/canonical_cases.json");
const OUT = __dirname;

const TARGETS = [
  ["4059795__diego_primo4059795.xml", 950],
  ["4060603__JACOB_LIMON4060603.xml", 85],
  ["4061546__Fer_LIg4061546.xml", 109],
  ["4059352__victor_moneta4059352.xml", 430],
  ["4061518__Fer_LIg4061518.xml", 105],
  ["4061468__BEATRIZ ADRIANA_SILVA VARGAS4061468.xml", 98],
  ["4059224__Mega_Maderas4059224.xml", 134],
  ["4061358__BEATRIZ ADRIANA_SILVA VARGAS4061358.xml", 73],
  ["4060810__Dinorah_Contreras4060810.xml", 96],
  ["4059776__diego_primo4059776.xml", 142],
  ["4060221__JUAN_FEMATT4060221.xml", 88],
  ["4061048__LUIS ALFREDO_MARTINEZ SANCHEZ4061048.xml", 58],
  ["4060002__Adrian_SEIF4060002.xml", 88],
  ["4060963__alexandra_de la fuente hernandez4060963.xml", 73],
  ["4061112__Ana Medina_Ana Medina4061112.xml", 219],
  ["4060025__Fer_LIg4060025.xml", 143],
  ["4061529__Silvio_Barraza4061529.xml", 182],
  ["4061281__ALFREDO_CELESTINO4061281.xml", 48],
  ["4059306__ALEJANDRA_RUIZ4059306.xml", 56],
  ["4059222__Mega_Maderas4059222.xml", 79],
  ["4055118__federico_mercado4055118.xml", 238, true],
  ["4052458__Hernan_Giufrida4052458.xml", 293, true],
];

const VARIANTS = {
  control: { reuse: false },
  reuse: { reuse: true },
};

const mode = process.argv[2] || "all";

if (mode === "all") {
  for (const name of Object.keys(VARIANTS)) runChild(name);
  report();
} else if (VARIANTS[mode]) {
  runVariant(mode);
} else if (mode === "report") {
  report();
} else {
  throw new Error("mode must be all|report|" + Object.keys(VARIANTS).join("|"));
}

function runChild(name) {
  const r = spawnSync(process.execPath, [__filename, name], {
    cwd: REPO,
    stdio: "inherit",
    env: {
      ...process.env,
      OPTIMIZER_RUST_MASTER_ROUND_REUSE_EXPERIMENTAL: "0",
      OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL: "0",
      OPTIMIZER_POST_COMPACT_CHEAP_LB_EXPERIMENTAL: "0",
      OPTIMIZER_DFF_FS0_LB_EXPERIMENTAL: "0",
      OPTIMIZER_MASTER_UNIQUE_MASKS_LE4_EXPERIMENTAL: "0",
      OPTIMIZER_PACKING_CACHE_KEY_V2_EXPERIMENTAL: "1",
      OPTIMIZER_BASELINE_MULTISLICE_PACKING_REUSE_EXPERIMENTAL: name === "reuse" ? "1" : "0",
      RUST_LEGACY_DEBUG_ERRORS: "1",
    },
  });
  if (r.status !== 0) throw new Error(name + " failed with status " + r.status);
}

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function unwrapCorpus(raw) {
  if (Array.isArray(raw)) return raw;
  for (const key of ["cases", "records", "canonical_cases", "canonicalCases", "data"]) {
    if (Array.isArray(raw?.[key])) return raw[key];
  }
  throw new Error("Unsupported canonical corpus");
}

function rootOf(entry) {
  return entry?.case ?? entry?.canonical ?? entry?.optimization_case ?? entry?.optimizationCase ?? entry;
}

function orderNumber(value) {
  const stem = String(value || "").replace(/\.xml$/i, "");
  const runs = stem.match(/\d+/g);
  if (!runs) return Number.POSITIVE_INFINITY;
  const last = runs[runs.length - 1];
  return Number(last.length > 7 ? last.slice(-7) : last);
}

function stringsForEntry(entry) {
  const root = rootOf(entry);
  return [
    entry?.file, entry?.file_name, entry?.fileName, entry?.source_file, entry?.sourceFile,
    entry?.case_id, entry?.caseId, entry?.name, entry?.id,
    root?.file, root?.file_name, root?.fileName, root?.source_file, root?.sourceFile,
    root?.case_id, root?.caseId, root?.name, root?.id,
  ].filter((v) => typeof v === "string" && v.length > 0);
}

function countPieces(entry) {
  const root = rootOf(entry);
  if (!Array.isArray(root?.pieces)) return null;
  let sum = 0;
  for (const p of root.pieces) {
    const q = Number(p.quantity ?? p.cant ?? 1);
    if (!Number.isFinite(q) || q <= 0) return null;
    sum += q;
  }
  return sum;
}

function buildIndex(entries) {
  const byOrder = new Map();
  for (const entry of entries) {
    const orders = new Set();
    for (const s of stringsForEntry(entry)) {
      const n = orderNumber(s);
      if (Number.isFinite(n)) orders.add(n);
    }
    const explicit = Number(entry?.order ?? rootOf(entry)?.order);
    if (Number.isFinite(explicit)) orders.add(explicit);
    for (const order of orders) {
      if (!byOrder.has(order)) byOrder.set(order, []);
      byOrder.get(order).push(entry);
    }
  }
  return byOrder;
}

function resolveExact(byOrder, file, expectedPieces) {
  const order = orderNumber(file);
  const candidates = byOrder.get(order) || [];
  const exactPieces = candidates.filter((entry) => countPieces(entry) === expectedPieces);
  if (exactPieces.length !== 1) {
    throw new Error(
      file + ": expected unique canonical case with " + expectedPieces +
      " pieces; order candidates=" + candidates.length +
      ", exact-piece candidates=" + exactPieces.length +
      ", counts=" + candidates.map(countPieces).join(",")
    );
  }
  return exactPieces[0];
}

function firstNumber(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function toProblem(entry, file) {
  const root = rootOf(entry);
  const width = firstNumber(root.panel?.width, root.stock_width, root.stockWidth, root.board_width, root.boardWidth);
  const height = firstNumber(root.panel?.height, root.stock_height, root.stockHeight, root.board_height, root.boardHeight);
  const saw = firstNumber(root.kerf, root.saw, root.sierra, 4.5);
  const trimX = firstNumber(root.trim?.x, root.trim_x, root.trimX, root.refiladoX, 0);
  const trimY = firstNumber(root.trim?.y, root.trim_y, root.trimY, root.refiladoY, 0);
  if (!(width > 0) || !(height > 0) || !Array.isArray(root.pieces) || !root.pieces.length) {
    throw new Error(file + ": unsupported canonical geometry");
  }

  const directional =
    root.material?.hasGrain === true ||
    Boolean(root.directional ?? root.directional_input ?? root.materialConVeta ?? root.has_grain) ||
    root.pieces.some((p) => p.grain === true || p.veta === true || p.rotationAllowed === false);

  const pieces = root.pieces.map((p, index) => ({
    base: firstNumber(p.base, p.width),
    altura: firstNumber(p.altura, p.height),
    cant: firstNumber(p.cant, p.quantity, 1),
    veta: Boolean(p.veta ?? p.grain ?? (p.rotationAllowed === false)),
    ref: p.ref ?? p.reference ?? index,
    detalle: p.detalle ?? p.description ?? "",
  }));

  if (pieces.some((p) => !(p.base > 0) || !(p.altura > 0) || !(p.cant > 0))) {
    throw new Error(file + ": invalid pieces");
  }

  return {
    file,
    width,
    height,
    saw,
    trimX,
    trimY,
    directional,
    pieces,
  };
}

function boardDigest(board) {
  return {
    placements: (board?.colocadas ?? []).map((p) => [
      p?.pieza?.ref, p.base, p.altura, p.x, p.y, Boolean(p.rotada), p.nivel ?? 0,
    ]),
    cuts: (board?.cortes ?? []).map((c) => [
      c.x1, c.y1, c.x2, c.y2, c.nivel ?? 0, Boolean(c.terminal),
    ]),
    remnants: (board?.restos ?? []).map((r) => [r.x, r.y, r.w, r.h]),
  };
}

function planDigest(plan) {
  return crypto.createHash("sha256")
    .update(JSON.stringify((plan?.placas ?? []).map(boardDigest)))
    .digest("hex");
}

function configFor(problem, variant, sentinel) {
  const totalPieces = problem.pieces.reduce((s, p) => s + p.cant, 0);
  const cacheLimit = totalPieces <= 160 ? 160 : 0;
  return {
    placaBase: problem.width,
    placaAltura: problem.height,
    refiladoX: problem.trimX,
    refiladoY: problem.trimY,
    sierra: problem.saw,
    etapas: 4,
    materialConVeta: Boolean(problem.directional),
    descontarCanto: false,
    cantoEspesor: 0,
    restoMin: 250,
    restoMax: 400,
    usarOneBoard: true,
    usarMaster: true,
    usarMultiSlice: true,
    usarCompactacion: true,
    reusarPackingBaselineMultiSlice: variant.reuse,
    usarRustPatternGenerator: true,
    usarCache: cacheLimit > 0,
    maxPiezasCache: cacheLimit,
    rondasPatrones: 40,
    msMaster: 8000,
    usarCotaBarataPostCompactacion: !sentinel,
    usarDffFs0PostCompactacion: !sentinel,
    usarMascarasUnicasMasterLe4: true,
  };
}

function runVariant(name) {
  const {
    optimizarV10,
    nuevasMetricas,
    validarPlanIndustrial,
  } = require(path.join(REPO, "src/lib/optimizer/legacy/v10.cjs"));
  const { calidadPlanPlacas } = require(path.join(REPO, "src/lib/optimizer/legacy/motor.cjs"));

  const entries = unwrapCorpus(loadJson(CANONICAL));
  const byOrder = buildIndex(entries);
  const variant = VARIANTS[name];
  const rows = [];

  process.env.OPTIMIZER_RUST_MASTER_ROUND_REUSE_EXPERIMENTAL = "0";

  for (let i = 0; i < TARGETS.length; i++) {
    const [file, expectedPiecesHistorical, sentinel = false] = TARGETS[i];
    const entry = resolveExact(byOrder, file, expectedPiecesHistorical);
    const problem = toProblem(entry, file);
    const expectedPieces = problem.pieces.reduce((s, p) => s + p.cant, 0);
    if (expectedPieces !== expectedPiecesHistorical) {
      throw new Error(file + ": exact piece-count contract failed");
    }
    const config = configFor(problem, variant, sentinel);
    const lines = problem.pieces.map((p, index) => ({
      base: p.base,
      altura: p.altura,
      cant: p.cant,
      veta: Boolean(problem.directional) && Boolean(p.veta),
      ref: p.ref ?? index,
      detalle: p.detalle,
    }));

    const t0 = process.hrtime.bigint();
    let result = null;
    let error = null;
    try {
      result = optimizarV10(lines, config, nuevasMetricas());
    } catch (e) {
      error = String(e?.stack || e?.message || e).slice(0, 1200);
    }
    const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;
    const plan = result?.plan ?? null;
    const validation = plan ? validarPlanIndustrial(plan, expectedPieces) : { ok: false };
    const quality = plan ? calidadPlanPlacas(plan.placas, plan.opts || config) : null;

    rows.push({
      file,
      sentinel,
      expectedPieces,
      types: lines.length,
      ok: !error && Boolean(validation?.ok),
      error,
      validationOk: Boolean(validation?.ok),
      boards: plan?.resumen?.placas ?? null,
      elapsedMs,
      planDigest: plan ? planDigest(plan) : null,
      quality,
      lowerBound: result?.metricas?.lowerBound ?? null,
      master: result?.metricas?.master ?? null,
      multislice: result?.metricas?.multislice ?? null,
      compactacion: result?.metricas?.compactacion ?? null,
      rustFallback: config._rustPatternGeneratorFallback ?? null,
      sharedPackingHits: result?.metricas?.multislice?.sharedPackingHits ?? 0,
      sharedPackingEntries: result?.metricas?.multislice?.sharedPackingEntries ?? 0,
    });
    console.log(name + " " + (i + 1) + "/" + TARGETS.length + " " + file +
      " boards=" + rows.at(-1).boards + " ms=" + elapsedMs.toFixed(1));
  }

  const payload = {
    schema: "optimizer-baseline-multislice-reuse-v1",
    variant: name,
    generatedAt: new Date().toISOString(),
    sourceSha: process.env.GITHUB_SHA || null,
    cases: rows.length,
    rows,
  };
  fs.writeFileSync(path.join(OUT, "multislice-reuse-" + name + ".json"), JSON.stringify(payload, null, 2) + "\n");
}

function quantile(values, p) {
  const xs = values.slice().sort((a, b) => a - b);
  if (!xs.length) return 0;
  const pos = (xs.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? xs[lo] : xs[lo] + (xs[hi] - xs[lo]) * (pos - lo);
}

function latency(rows) {
  const xs = rows.filter((r) => r.ok).map((r) => r.elapsedMs);
  const total = xs.reduce((a, b) => a + b, 0);
  return {
    n: xs.length,
    totalMs: +total.toFixed(2),
    avgMs: +(total / Math.max(1, xs.length)).toFixed(2),
    p50Ms: +quantile(xs, .5).toFixed(2),
    p90Ms: +quantile(xs, .9).toFixed(2),
    p95Ms: +quantile(xs, .95).toFixed(2),
    p99Ms: +quantile(xs, .99).toFixed(2),
    maxMs: +(xs.length ? Math.max(...xs) : 0).toFixed(2),
  };
}

function reduction(a, b) {
  return a > 0 ? +(100 * (a - b) / a).toFixed(2) : 0;
}

function report() {
  const { compararCalidad } = require(path.join(REPO, "src/lib/optimizer/legacy/motor.cjs"));
  const runs = Object.fromEntries(Object.keys(VARIANTS).map((name) => [
    name,
    loadJson(path.join(OUT, "multislice-reuse-" + name + ".json")),
  ]));
  const base = runs.control.rows;
  const baseMap = new Map(base.map((r) => [r.file, r]));
  const summary = {};

  for (const [name, run] of Object.entries(runs)) {
    const l = latency(run.rows);
    const bl = latency(base);
    const regressions = [];
    const improvements = [];
    const remnantRegressions = [];
    const digestDiffs = [];
    const invalid = run.rows.filter((r) => !r.ok);

    for (const row of run.rows) {
      const b = baseMap.get(row.file);
      if (!b || !b.ok || !row.ok) continue;
      if (row.boards > b.boards) regressions.push(row.file);
      if (row.boards < b.boards) improvements.push(row.file);
      if (row.boards === b.boards && row.quality && b.quality && compararCalidad(row.quality, b.quality) < 0) {
        remnantRegressions.push(row.file);
      }
      if (row.planDigest !== b.planDigest) digestDiffs.push(row.file);
    }

    summary[name] = {
      latency: l,
      improvementPctVsControl: {
        total: reduction(bl.totalMs, l.totalMs),
        avg: reduction(bl.avgMs, l.avgMs),
        p50: reduction(bl.p50Ms, l.p50Ms),
        p90: reduction(bl.p90Ms, l.p90Ms),
        p95: reduction(bl.p95Ms, l.p95Ms),
        p99: reduction(bl.p99Ms, l.p99Ms),
        max: reduction(bl.maxMs, l.maxMs),
      },
      quality: {
        invalid: invalid.length,
        boardRegressions: regressions.length,
        boardImprovements: improvements.length,
        remnantRegressions: remnantRegressions.length,
        digestDiffs: digestDiffs.length,
        boardRegressionFiles: regressions,
        remnantRegressionFiles: remnantRegressions,
      },
      stageMs: {
        master: +run.rows.reduce((s, r) => s + Number(r.master?.ms || 0), 0).toFixed(2),
        multislice: +run.rows.reduce((s, r) => s + Number(r.multislice?.ms || 0), 0).toFixed(2),
        compactacion: +run.rows.reduce((s, r) => s + Number(r.compactacion?.ms || 0), 0).toFixed(2),
      },
    };
  }

  const perCase = base.map((b) => {
    const out = { file: b.file, controlBoards: b.boards, controlMs: +b.elapsedMs.toFixed(2) };
    for (const name of Object.keys(VARIANTS).filter((x) => x !== "control")) {
      const r = runs[name].rows.find((x) => x.file === b.file);
      out[name] = r ? {
        boards: r.boards,
        ms: +r.elapsedMs.toFixed(2),
        speedupPct: reduction(b.elapsedMs, r.elapsedMs),
      } : null;
    }
    return out;
  });

  const result = {
    schema: "optimizer-multislice-reuse-ablation-report-v1",
    generatedAt: new Date().toISOString(),
    sourceSha: process.env.GITHUB_SHA || null,
    scope: {
      cases: TARGETS.length,
      matching: "order/file + exact historical piece count; ambiguity fails closed",
      note: "Exact cross-call reuse gate. Historical MultiSlice sentinels run without post-compact LB so MultiSlice remains observable.",
    },
    summary,
    perCase,
  };

  fs.writeFileSync(path.join(OUT, "multislice-reuse-results.json"), JSON.stringify(result, null, 2) + "\n");
  console.log("MULTISLICE_REUSE " + JSON.stringify(result));
  const reuse = summary.reuse;
  if (reuse.quality.invalid > 0) throw new Error("reuse invalid="+reuse.quality.invalid);
  if (reuse.quality.boardRegressions > 0) throw new Error("reuse board regressions="+reuse.quality.boardRegressions);
  if (reuse.quality.remnantRegressions > 0) throw new Error("reuse remnant regressions="+reuse.quality.remnantRegressions);
  if (reuse.quality.digestDiffs > 0) throw new Error("reuse digest diffs="+reuse.quality.digestDiffs);
}

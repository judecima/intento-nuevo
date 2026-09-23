"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const ROOT = path.resolve(__dirname, "../../..");
const FIX = path.join(ROOT, "research/optimizer/holdout-v2-fixture");
const SHARD_INDEX = Number(process.env.SHARD_INDEX || 0);
const SHARD_TOTAL = Number(process.env.SHARD_TOTAL || 32);
const MODE = process.argv[2] || "shard";
const MAX_BOARDS = Number(process.env.AUTO_EFFORT_MAX_BOARDS || 75);

process.env.OPTIMIZER_RUST_BEAM_RANK_CACHE_EXPERIMENTAL = "1";
process.env.OPTIMIZER_RUST_LEAN_BEAM_EXPERIMENTAL = "1";
process.env.OPTIMIZER_RUST_GREEDY_PLAN_EXPERIMENTAL = "1";
process.env.OPTIMIZER_RUST_LARGE_ROUND_EXPERIMENTAL = "1";
process.env.OPTIMIZER_RUST_SIMPLE_CHOOSE_EXPERIMENTAL = "1";
process.env.OPTIMIZER_RUST_MASTER_ROUND_REUSE_EXPERIMENTAL = "0";
process.env.OPTIMIZER_MASTER_UNIQUE_MASKS_LE4_EXPERIMENTAL = "1";

const {
  optimizarV10,
  nuevasMetricas,
  validarPlanIndustrial,
} = require(path.join(ROOT, "src/lib/optimizer/legacy/v10.cjs"));
const {
  calidadPlanPlacas,
  compararCalidad,
} = require(path.join(ROOT, "src/lib/optimizer/legacy/motor.cjs"));

function decodeFixture() {
  const b64 = [0, 1, 2, 3]
    .map((i) => fs.readFileSync(path.join(FIX, `part-0${i}.b64`), "utf8").trim())
    .join("");
  const b = zlib.brotliDecompressSync(Buffer.from(b64, "base64"));
  let p = 5;
  if (b.subarray(0, 5).toString() !== "MDFV1") throw new Error("bad fixture");
  function v() {
    let n = 0, s = 0;
    for (;;) {
      const x = b[p++];
      n += (x & 127) * 2 ** s;
      if (!(x & 128)) return n;
      s += 7;
    }
  }
  const n = v(), out = [];
  let last = 0;
  for (let k = 0; k < n; k++) {
    const id = last + v();
    last = id;
    const width = v() / 10;
    const height = v() / 10;
    const saw = v() / 10;
    const leptonBoards = v();
    const tc = v(), types = [];
    for (let j = 0; j < tc; j++) types.push({ w: v() / 10, h: v() / 10, q: v() });
    out.push({ id, width, height, saw, leptonBoards, types });
  }
  return out;
}

function lines(c) {
  return c.types.map((t, i) => ({
    base: t.w,
    altura: t.h,
    cant: t.q,
    veta: false,
    canRotate: true,
    ref: String(i),
    detalle: `AUTO-${c.id}-${i}`,
    cantos: null,
  }));
}

function baseConfig(c) {
  return {
    placaBase: c.width,
    placaAltura: c.height,
    refiladoX: 0,
    refiladoY: 0,
    sierra: c.saw,
    etapas: 4,
    materialConVeta: false,
    descontarCanto: false,
    cantoEspesor: 0,
    restoMin: 250,
    restoMax: 400,
    usarOneBoard: true,
    usarMaster: true,
    usarMultiSlice: true,
    usarCompactacion: true,
    usarRustPatternGenerator: true,
    usarCache: false,
    maxPiezasCache: 0,
    rondasPatrones: 40,
    msMaster: 8000,
    maxNodosMaster: 1600000,
    watchdogMasterMs: 12000,
    usarCotaBarataPostCompactacion: true,
    usarDffFs0PostCompactacion: true,
    usarMascarasUnicasMasterLe4: true,
    minPiezasMultiSliceExperimental: 200,
    maxPiezasMultiSliceExperimental: 500,
    masterIndustrialRulesV3Experimental: true,
    masterStructuralV2: true,
  };
}

function config(c, mode) {
  const out = baseConfig(c);
  if (mode === "auto") out.autoEffortController = true;
  if (mode === "advanced") out.masterForceFull40 = true;
  return out;
}

function timed(fn) {
  const t = process.hrtime.bigint();
  const c0 = process.cpuUsage();
  try {
    const value = fn();
    const d = process.cpuUsage(c0);
    return {
      ok: true,
      value,
      wallMs: Number(process.hrtime.bigint() - t) / 1e6,
      cpuMs: (d.user + d.system) / 1000,
      error: null,
    };
  } catch (e) {
    const d = process.cpuUsage(c0);
    return {
      ok: false,
      value: null,
      wallMs: Number(process.hrtime.bigint() - t) / 1e6,
      cpuMs: (d.user + d.system) / 1000,
      error: String(e?.stack || e),
    };
  }
}

const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const quality = (p, c) => calidadPlanPlacas(p?.placas || [], p?.opts || c);

function quant(xs, p) {
  const a = xs.filter(Number.isFinite).slice().sort((x, y) => x - y);
  if (!a.length) return null;
  const pos = (a.length - 1) * p;
  const l = Math.floor(pos), h = Math.ceil(pos);
  return l === h ? a[l] : a[l] + (a[h] - a[l]) * (pos - l);
}

function summarize(rows) {
  const valid = rows.filter((r) => r.validAuto && r.validAdvanced);
  const same = valid.filter((r) => r.boardCmp === 0);
  const wins = valid.filter((r) => r.boardCmp < 0);
  const losses = valid.filter((r) => r.boardCmp > 0);
  const master = valid.filter((r) => r.autoEnteredMaster || r.advancedEnteredMaster);
  const early = master.filter((r) =>
    r.autoEnteredMaster &&
    Number.isFinite(r.autoRoundsExecuted) &&
    r.autoRoundsExecuted < 40
  );
  const sum = (xs) => xs.reduce((s, x) => s + (Number.isFinite(x) ? x : 0), 0);
  const advWall = sum(valid.map((r) => r.advancedWallMs));
  const autoWall = sum(valid.map((r) => r.autoWallMs));
  const advCpu = sum(valid.map((r) => r.advancedCpuMs));
  const autoCpu = sum(valid.map((r) => r.autoCpuMs));

  const stopReasons = {};
  for (const r of master) {
    const k = r.autoStopReason || "none";
    stopReasons[k] = (stopReasons[k] || 0) + 1;
  }

  return {
    cases: rows.length,
    valid: valid.length,
    invalid: rows.length - valid.length,
    boardWins: wins.length,
    boardLosses: losses.length,
    boardsSaved: wins.reduce((s, r) => s + r.advancedBoards - r.autoBoards, 0),
    remnantWorse: same.filter((r) => r.qualityCmp < 0).length,
    remnantEqual: same.filter((r) => r.qualityCmp === 0).length,
    remnantBetter: same.filter((r) => r.qualityCmp > 0).length,
    masterCases: master.length,
    earlyMasterStops: early.length,
    earlyMasterStopPct: master.length ? 100 * early.length / master.length : 0,
    avgAutoRoundsMaster: master.length
      ? sum(master.map((r) => r.autoRoundsExecuted)) / master.length
      : 0,
    stopReasons,
    wall: {
      advancedTotalMs: advWall,
      autoTotalMs: autoWall,
      savingPct: advWall ? 100 * (1 - autoWall / advWall) : null,
      advancedP50: quant(valid.map((r) => r.advancedWallMs), .5),
      autoP50: quant(valid.map((r) => r.autoWallMs), .5),
      advancedP95: quant(valid.map((r) => r.advancedWallMs), .95),
      autoP95: quant(valid.map((r) => r.autoWallMs), .95),
      advancedP99: quant(valid.map((r) => r.advancedWallMs), .99),
      autoP99: quant(valid.map((r) => r.autoWallMs), .99),
    },
    cpu: {
      advancedTotalMs: advCpu,
      autoTotalMs: autoCpu,
      savingPct: advCpu ? 100 * (1 - autoCpu / advCpu) : null,
      advancedP50: quant(valid.map((r) => r.advancedCpuMs), .5),
      autoP50: quant(valid.map((r) => r.autoCpuMs), .5),
      advancedP95: quant(valid.map((r) => r.advancedCpuMs), .95),
      autoP95: quant(valid.map((r) => r.autoCpuMs), .95),
      advancedP99: quant(valid.map((r) => r.advancedCpuMs), .99),
      autoP99: quant(valid.map((r) => r.autoCpuMs), .99),
    },
  };
}

if (MODE === "shard") {
  const all = decodeFixture();
  const cohort = all.filter((c) =>
    Number.isFinite(c.leptonBoards) &&
    c.leptonBoards > 0 &&
    c.leptonBoards <= MAX_BOARDS
  );
  const cases = cohort.filter((_, i) => i % SHARD_TOTAL === SHARD_INDEX);
  const rows = [];

  for (const c of cases) {
    const L = lines(c);
    const expected = L.reduce((s, x) => s + x.cant, 0);
    const CAuto = config(c, "auto");
    const CAdvanced = config(c, "advanced");

    let auto, advanced;
    if (c.id % 2 === 0) {
      advanced = timed(() => optimizarV10(L, CAdvanced, nuevasMetricas()));
      auto = timed(() => optimizarV10(L, CAuto, nuevasMetricas()));
    } else {
      auto = timed(() => optimizarV10(L, CAuto, nuevasMetricas()));
      advanced = timed(() => optimizarV10(L, CAdvanced, nuevasMetricas()));
    }

    const pa = auto.value?.plan;
    const pd = advanced.value?.plan;
    const va = Boolean(auto.ok && pa && validarPlanIndustrial(pa, expected)?.ok);
    const vd = Boolean(advanced.ok && pd && validarPlanIndustrial(pd, expected)?.ok);
    const na = pa?.resumen?.placas ?? Infinity;
    const nd = pd?.resumen?.placas ?? Infinity;
    const boardCmp = cmp(na, nd);
    const qualityCmp =
      va && vd && boardCmp === 0
        ? compararCalidad(quality(pa, CAuto), quality(pd, CAdvanced))
        : null;

    const ta = auto.value?.metricas?.effortController || {};
    const td = advanced.value?.metricas?.effortController || {};

    rows.push({
      id: c.id,
      leptonBoards: c.leptonBoards,
      pieces: expected,
      typeCount: L.length,
      validAuto: va,
      validAdvanced: vd,
      autoBoards: Number.isFinite(na) ? na : null,
      advancedBoards: Number.isFinite(nd) ? nd : null,
      boardCmp,
      qualityCmp,
      autoWallMs: auto.wallMs,
      advancedWallMs: advanced.wallMs,
      autoCpuMs: auto.cpuMs,
      advancedCpuMs: advanced.cpuMs,
      autoEnteredMaster: ta.enteredMaster === true,
      advancedEnteredMaster: td.enteredMaster === true,
      autoRoundsExecuted: Number.isFinite(ta.roundsExecuted) ? ta.roundsExecuted : 0,
      advancedRoundsExecuted: Number.isFinite(td.roundsExecuted) ? td.roundsExecuted : 0,
      autoStopReason: ta.stopReason || null,
      advancedStopReason: td.stopReason || null,
      autoBlocks: Array.isArray(ta.blocks) ? ta.blocks.length : 0,
      autoSafeLowerBound: Number.isFinite(ta.safeLowerBound) ? ta.safeLowerBound : null,
      errorAuto: auto.error,
      errorAdvanced: advanced.error,
    });
  }

  const file = path.join(__dirname, `auto-effort-shard-${SHARD_INDEX}.json`);
  fs.writeFileSync(file, JSON.stringify({
    shard: SHARD_INDEX,
    shardTotal: SHARD_TOTAL,
    cohortTotal: cohort.length,
    maxBoards: MAX_BOARDS,
    rows,
  }) + "\n");

  console.log("AUTO_EFFORT_SHARD " + JSON.stringify({
    shard: SHARD_INDEX,
    cohortTotal: cohort.length,
    summary: summarize(rows),
  }));
} else if (MODE === "report") {
  const files = fs.readdirSync(__dirname)
    .filter((x) => /^auto-effort-shard-\d+\.json$/.test(x));
  if (files.length !== SHARD_TOTAL) {
    throw new Error(`expected ${SHARD_TOTAL} shards got ${files.length}`);
  }
  const data = files.map((f) =>
    JSON.parse(fs.readFileSync(path.join(__dirname, f), "utf8"))
  );
  const rows = data.flatMap((x) => x.rows || []).sort((a, b) => a.id - b.id);
  const summary = summarize(rows);
  const failures = rows.filter((r) =>
    !r.validAuto ||
    !r.validAdvanced ||
    r.boardCmp > 0 ||
    (r.boardCmp === 0 && r.qualityCmp < 0)
  );
  const boardWins = rows.filter((r) => r.boardCmp < 0);
  const remnantWins = rows.filter((r) => r.boardCmp === 0 && r.qualityCmp > 0);
  const status =
    failures.length === 0 &&
    summary.masterCases > 0 &&
    summary.earlyMasterStops > 0
      ? "PASS"
      : "FAIL";

  const out = {
    schema: "optimizer-auto-effort-gate-v1",
    status,
    cohortTotal: data[0]?.cohortTotal ?? rows.length,
    maxBoards: data[0]?.maxBoards ?? MAX_BOARDS,
    summary,
    failures,
    boardWins,
    remnantWins,
  };
  fs.writeFileSync(
    path.join(__dirname, "AUTO_EFFORT_GATE_RESULT.json"),
    JSON.stringify(out, null, 2) + "\n"
  );
  console.log("AUTO_EFFORT_RESULT " + JSON.stringify({
    status,
    summary,
    failures: failures.length,
    boardWins: boardWins.length,
    remnantWins: remnantWins.length,
  }));
  if (status !== "PASS") process.exitCode = 2;
} else {
  throw new Error("mode shard|report");
}

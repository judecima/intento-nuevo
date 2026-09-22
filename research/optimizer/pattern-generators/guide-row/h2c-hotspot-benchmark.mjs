import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { buildGuideRowCandidate } from "./complete-candidate.mjs";
import { enumerateGuideResidualStates } from "./residual-builder.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(new URL("../../../../", import.meta.url).pathname);
const CORPUS = path.join(ROOT, "experiencia/canonical_cases.json");
const HOTSPOT = path.join(ROOT, "experiencia/v6/hotspot-all.jsonl");
const OUT = path.dirname(new URL(import.meta.url).pathname);

process.env.OPTIMIZER_RUST_BEAM_RANK_CACHE_EXPERIMENTAL = "1";
process.env.OPTIMIZER_RUST_LEAN_BEAM_EXPERIMENTAL = "1";
process.env.OPTIMIZER_RUST_GREEDY_PLAN_EXPERIMENTAL = "1";
process.env.OPTIMIZER_RUST_LARGE_ROUND_EXPERIMENTAL = "1";
process.env.OPTIMIZER_RUST_SIMPLE_CHOOSE_EXPERIMENTAL = "1";
process.env.OPTIMIZER_RUST_MASTER_ROUND_REUSE_EXPERIMENTAL = "0";
process.env.OPTIMIZER_MASTER_UNIQUE_MASKS_LE4_EXPERIMENTAL = "1";

const { optimizarV10, nuevasMetricas, validarPlanIndustrial } =
  require(path.join(ROOT, "src/lib/optimizer/legacy/v10.cjs"));
const { calidadPlanPlacas, compararCalidad } =
  require(path.join(ROOT, "src/lib/optimizer/legacy/motor.cjs"));
const { computeHybridLowerBound } =
  require(path.join(ROOT, "src/lib/optimizer/experimental/hybrid-lower-bound.cjs"));

const MODE = process.argv[2] || "shard";
const SHARD_INDEX = Number(process.env.SHARD_INDEX || 0);
const SHARD_TOTAL = Number(process.env.SHARD_TOTAL || 1);
const MAX_PIECES = Number(process.env.MAX_PIECES || 160);

if (MODE === "shard") shard();
else if (MODE === "report") report();
else throw new Error("mode must be shard|report");

function num(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function orderNumber(value) {
  const runs = String(value || "").replace(/\.xml$/i, "").match(/\d+/g);
  if (!runs) return null;
  const last = runs.at(-1);
  return Number(last.length > 7 ? last.slice(-7) : last);
}

function caseOrder(entry, index) {
  for (const value of [
    entry?.case_id,
    entry?.caseId,
    entry?.source_path,
    entry?.sourcePath,
    entry?.file,
    entry?.file_name,
    entry?.name,
    entry?.id,
  ]) {
    if (typeof value === "string" || Number.isFinite(Number(value))) {
      const n = orderNumber(value);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function loadCorpus() {
  const raw = JSON.parse(fs.readFileSync(CORPUS, "utf8"));
  return Array.isArray(raw)
    ? raw
    : raw.cases || raw.records || raw.canonical_cases || raw.canonicalCases || raw.data || [];
}

function loadHotspot() {
  return fs
    .readFileSync(HOTSPOT, "utf8")
    .trim()
    .split(/\n+/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function problem(entry) {
  if (!Array.isArray(entry?.pieces) || !entry.pieces.length) throw new Error("missing pieces");
  const width = num(entry.stock_width, entry.stockWidth, entry.panel?.width);
  const height = num(entry.stock_height, entry.stockHeight, entry.panel?.height);
  if (!(width > 0 && height > 0)) throw new Error("invalid stock");

  const directional = Boolean(
    entry.directional ?? entry.directional_input ?? entry.materialConVeta ?? entry.has_grain,
  );

  // H2c-v1 deliberately excludes directional cases. Historical canonical
  // records predate the explicit per-piece canRotate override and must not be
  // used to infer runtime grain semantics.
  if (directional) throw new Error("directional-excluded-h2c-v1");

  const lines = entry.pieces.map((p, index) => ({
    base: num(p.base, p.width),
    altura: num(p.altura, p.height),
    cant: num(p.cant, p.quantity, 1),
    veta: false,
    canRotate: true,
    ref: index,
    detalle: String(p.detalle ?? p.description ?? index + 1),
    cantos: null,
  }));
  if (lines.some((line) => !(line.base > 0 && line.altura > 0 && line.cant > 0))) {
    throw new Error("invalid piece");
  }

  return {
    width,
    height,
    saw: num(entry.saw, entry.kerf, entry.sierra, 4.5),
    trimX: 0,
    trimY: 0,
    lines,
    pieces: lines.reduce((sum, line) => sum + line.cant, 0),
    types: lines.length,
  };
}

function config(p) {
  return {
    placaBase: p.width,
    placaAltura: p.height,
    refiladoX: p.trimX,
    refiladoY: p.trimY,
    sierra: p.saw,
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
  };
}

function quantile(values, p) {
  const a = values.filter(Number.isFinite).slice().sort((x, y) => x - y);
  if (!a.length) return null;
  const pos = (a.length - 1) * p;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (pos - lo);
}

function exactDemandOk(plan, lines) {
  if (!plan) return false;
  const expected = new Map(lines.map((line) => [String(line.ref), Number(line.cant)]));
  const actual = new Map();
  for (const board of plan.placas || []) {
    for (const placement of board.colocadas || []) {
      const key = String(placement?.pieza?.ref);
      actual.set(key, (actual.get(key) || 0) + 1);
    }
  }
  if (expected.size !== actual.size) return false;
  for (const [key, count] of expected) if (actual.get(key) !== count) return false;
  return true;
}

function quality(plan, cfg) {
  return calidadPlanPlacas(plan?.placas || [], plan?.opts || cfg);
}

function timed(fn) {
  const cpu0 = process.cpuUsage();
  const t0 = process.hrtime.bigint();
  try {
    const value = fn();
    const d = process.cpuUsage(cpu0);
    return {
      ok: true,
      value,
      wallMs: Number(process.hrtime.bigint() - t0) / 1e6,
      cpuMs: (d.user + d.system) / 1000,
      error: null,
    };
  } catch (error) {
    const d = process.cpuUsage(cpu0);
    return {
      ok: false,
      value: null,
      wallMs: Number(process.hrtime.bigint() - t0) / 1e6,
      cpuMs: (d.user + d.system) / 1000,
      error: String(error?.stack || error?.message || error).slice(0, 1800),
    };
  }
}

function safeLowerBound(p, cfg, candidatePlan) {
  const area = p.lines.reduce((sum, line) => sum + line.cant * line.base * line.altura, 0);
  const boardArea = (cfg.placaBase - cfg.refiladoX) * (cfg.placaAltura - cfg.refiladoY);
  const areaLB = Math.ceil(area / boardArea - 1e-9);
  let hybridLB = 0;
  let reason = null;
  let violation = false;

  try {
    const incumbentBoards = candidatePlan?.resumen?.placas ?? null;
    const result = computeHybridLowerBound(
      p.lines,
      candidatePlan?.opts || cfg,
      incumbentBoards,
      {
        useRaster: false,
        claude: {
          usarRaster: false,
          usarDffFs0: true,
        },
      },
    );
    const raw = Number(result?.cheapLowerBound ?? result?.lowerBound ?? 0);
    if (Number.isFinite(raw) && raw > 0) {
      const value = Math.floor(raw);
      if (Number.isFinite(incumbentBoards) && value > incumbentBoards) {
        violation = true;
      } else {
        hybridLB = value;
      }
    }
    reason = result?.reason || null;
  } catch (error) {
    reason = "error:" + String(error?.message || error);
  }

  return {
    value: Math.max(areaLB, hybridLB),
    areaLB,
    hybridLB,
    reason,
    violation,
  };
}

function structuralFeatures(p, cfg) {
  const quantities = p.lines.map((line) => Number(line.cant)).sort((a, b) => b - a);
  const total = quantities.reduce((a, b) => a + b, 0);
  const residual = enumerateGuideResidualStates(p.lines, cfg);
  const states = residual.states || [];
  const natural = states.filter((state) => state.natural);
  const feasible = natural.map((state) => state.feasibleFamilies);
  const classes = natural.map((state) => state.effectClasses.length);
  const rejectedRatio = residual.telemetry.successorChecks
    ? residual.telemetry.rejectedByGeometry / residual.telemetry.successorChecks
    : 0;

  return {
    pieces: p.pieces,
    types: p.types,
    piecesPerType: p.types ? p.pieces / p.types : 0,
    qtyMax: quantities[0] || 0,
    top3QtyShare: total ? quantities.slice(0, 3).reduce((a, b) => a + b, 0) / total : 0,
    guideSuccessorMax: feasible.length ? Math.max(...feasible) : 0,
    guideSuccessorMedian: quantile(feasible, 0.5) || 0,
    effectClassMax: classes.length ? Math.max(...classes) : 0,
    effectClassMedian: quantile(classes, 0.5) || 0,
    residualRejectRatio: rejectedRatio,
    naturalStates: residual.telemetry.naturalStates,
  };
}

function runReference(p, cfg) {
  return timed(() => optimizarV10(p.lines, cfg, nuevasMetricas()));
}

function shard() {
  const corpus = loadCorpus();
  const hotspot = loadHotspot();
  const byOrder = new Map();
  for (let index = 0; index < corpus.length; index++) {
    const order = caseOrder(corpus[index], index);
    if (Number.isFinite(order) && !byOrder.has(order)) byOrder.set(order, corpus[index]);
  }

  const selected = hotspot
    .filter((row) => row.ok && !row.engineCacheHit && Number(row.pieces) <= MAX_PIECES)
    .map((row) => ({ row, order: orderNumber(row.file) }))
    .filter(({ order }) => Number.isFinite(order))
    .sort((a, b) => a.order - b.order);

  const rows = [];
  const counts = {
    hotspotSelected: selected.length,
    assigned: 0,
    missingCanonical: 0,
    directionalExcluded: 0,
    invalidInput: 0,
    candidateComplete: 0,
    candidateInvalidDemand: 0,
    candidateInvalidPhysical: 0,
    lbViolations: 0,
    candidateAtSafeLB: 0,
    referenceRuns: 0,
    referenceErrors: 0,
  };

  for (let selectedIndex = SHARD_INDEX; selectedIndex < selected.length; selectedIndex += SHARD_TOTAL) {
    counts.assigned++;
    const { row: historical, order } = selected[selectedIndex];
    const entry = byOrder.get(order);
    if (!entry) {
      counts.missingCanonical++;
      rows.push({ order, file: historical.file, status: "MISSING_CANONICAL" });
      continue;
    }

    let p;
    try {
      p = problem(entry);
    } catch (error) {
      if (/directional-excluded/.test(String(error?.message || error))) counts.directionalExcluded++;
      else counts.invalidInput++;
      rows.push({
        order,
        file: historical.file,
        status: /directional-excluded/.test(String(error?.message || error))
          ? "DIRECTIONAL_EXCLUDED"
          : "INVALID_INPUT",
        error: String(error?.message || error),
      });
      continue;
    }

    const cfg = config(p);
    const features = structuralFeatures(p, cfg);
    const candidateRun = timed(() => buildGuideRowCandidate(p.lines, cfg));
    const candidateResult = candidateRun.value;
    const candidate = candidateResult?.plan || null;
    const physical = candidate ? validarPlanIndustrial(candidate, p.pieces) : { ok: false };
    const demandOk = candidate ? exactDemandOk(candidate, p.lines) : false;

    if (candidateResult?.status === "COMPLETE") counts.candidateComplete++;
    if (candidate && !physical?.ok) counts.candidateInvalidPhysical++;
    if (candidate && !demandOk) counts.candidateInvalidDemand++;

    const lb = candidate && physical?.ok && demandOk ? safeLowerBound(p, cfg, candidate) : {
      value: 0, areaLB: 0, hybridLB: 0, reason: null, violation: false,
    };
    if (lb.violation) counts.lbViolations++;

    const candidateBoards = candidate?.resumen?.placas ?? null;
    const atSafeLB = Boolean(
      candidate &&
      physical?.ok &&
      demandOk &&
      !lb.violation &&
      Number.isFinite(candidateBoards) &&
      candidateBoards <= lb.value
    );
    if (atSafeLB) counts.candidateAtSafeLB++;

    const candidateQuality = candidate ? quality(candidate, cfg) : null;
    let reference = null;

    if (atSafeLB) {
      counts.referenceRuns++;
      const refRun = runReference(p, cfg);
      if (!refRun.ok || !refRun.value?.plan) {
        counts.referenceErrors++;
        reference = {
          ok: false,
          wallMs: refRun.wallMs,
          cpuMs: refRun.cpuMs,
          error: refRun.error,
        };
      } else {
        const refPlan = refRun.value.plan;
        const refPhysical = validarPlanIndustrial(refPlan, p.pieces);
        const refDemandOk = exactDemandOk(refPlan, p.lines);
        const refQuality = quality(refPlan, cfg);
        reference = {
          ok: Boolean(refPhysical?.ok && refDemandOk),
          boards: refPlan.resumen?.placas ?? null,
          quality: refQuality,
          qualityCmpCandidateVsReference: candidateQuality
            ? compararCalidad(candidateQuality, refQuality)
            : null,
          wallMs: refRun.wallMs,
          cpuMs: refRun.cpuMs,
          physicalOk: Boolean(refPhysical?.ok),
          demandOk: refDemandOk,
          metrics: refRun.value.metricas,
          cota: refRun.value.cota,
          cotaArea: refRun.value.cotaArea,
          error: null,
        };
      }
    }

    const boardArea = (cfg.placaBase - cfg.refiladoX) * (cfg.placaAltura - cfg.refiladoY);
    const pieceArea = p.lines.reduce((sum, line) => sum + line.cant * line.base * line.altura, 0);
    rows.push({
      order,
      file: historical.file,
      status: "OK",
      historical: {
        totalMs: historical.totalMs,
        boards: historical.boards,
        cota: historical.cota,
        compactationMs: historical.stageMs?.compactacion || 0,
        compactationWins: historical.metricas?.compactacion?.ganancias || 0,
        compactationBoardsSaved: historical.metricas?.compactacion?.placasAhorradas || 0,
        masterMs: historical.masterMs || 0,
      },
      features: {
        ...features,
        utilizationAtCandidateBoards: candidateBoards
          ? pieceArea / (candidateBoards * boardArea)
          : null,
      },
      lowerBound: lb,
      candidate: {
        complete: candidateResult?.status === "COMPLETE",
        boards: candidateBoards,
        quality: candidateQuality,
        physicalOk: Boolean(physical?.ok),
        demandOk,
        wallMs: candidateRun.wallMs,
        cpuMs: candidateRun.cpuMs,
        telemetry: candidateResult?.telemetry || null,
        atSafeLB,
        error: candidateRun.error,
      },
      reference,
    });

    console.log("H2C_CASE " + JSON.stringify({
      order,
      pieces: p.pieces,
      types: p.types,
      candidateBoards,
      lb: lb.value,
      atSafeLB,
      refBoards: reference?.boards ?? null,
      remnantCmp: reference?.qualityCmpCandidateVsReference ?? null,
      candidateMs: +candidateRun.wallMs.toFixed(1),
      referenceMs: reference?.wallMs != null ? +reference.wallMs.toFixed(1) : null,
    }));
  }

  const payload = {
    schema: "h2c-hotspot-shard-v1",
    branch: process.env.GITHUB_REF_NAME || null,
    shard: SHARD_INDEX,
    shardTotal: SHARD_TOTAL,
    maxPieces: MAX_PIECES,
    nonDirectionalOnly: true,
    counts,
    rows,
  };
  const out = path.join(OUT, "h2c-hotspot-shard-" + SHARD_INDEX + ".json");
  fs.writeFileSync(out, JSON.stringify(payload, null, 2) + "\n");
  console.log("H2C_SHARD " + JSON.stringify({ shard: SHARD_INDEX, counts }));
}

function summarize(rows) {
  const ok = rows.filter((row) => row.status === "OK");
  const cert = ok.filter((row) => row.candidate?.atSafeLB && row.reference?.ok);
  const remnantReg = cert.filter((row) => row.reference.qualityCmpCandidateVsReference < 0);
  const remnantEq = cert.filter((row) => row.reference.qualityCmpCandidateVsReference === 0);
  const remnantBetter = cert.filter((row) => row.reference.qualityCmpCandidateVsReference > 0);
  const boardDiff = cert.filter((row) => row.candidate.boards !== row.reference.boards);
  const sum = (xs) => xs.reduce((s, x) => s + (Number.isFinite(x) ? x : 0), 0);

  return {
    cases: ok.length,
    candidateAtSafeLB: ok.filter((row) => row.candidate?.atSafeLB).length,
    compared: cert.length,
    boardDifferences: boardDiff.map((row) => row.order),
    remnant: {
      regressions: remnantReg.map((row) => row.order),
      equal: remnantEq.length,
      better: remnantBetter.map((row) => row.order),
    },
    wall: {
      candidateTotalMs: sum(cert.map((row) => row.candidate.wallMs)),
      referenceTotalMs: sum(cert.map((row) => row.reference.wallMs)),
      candidateP50: quantile(cert.map((row) => row.candidate.wallMs), 0.5),
      candidateP95: quantile(cert.map((row) => row.candidate.wallMs), 0.95),
      referenceP50: quantile(cert.map((row) => row.reference.wallMs), 0.5),
      referenceP95: quantile(cert.map((row) => row.reference.wallMs), 0.95),
    },
    historicalAvoidable: {
      compactationMs: sum(cert.map((row) => row.historical?.compactationMs || 0)),
      masterMs: sum(cert.map((row) => row.historical?.masterMs || 0)),
    },
  };
}

function report() {
  const expected = Number(process.env.SHARD_TOTAL || 8);
  const files = fs.readdirSync(OUT)
    .filter((name) => /^h2c-hotspot-shard-\d+\.json$/.test(name))
    .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));

  if (files.length !== expected) throw new Error("expected " + expected + " shards, got " + files.length);

  const shards = files.map((file) => JSON.parse(fs.readFileSync(path.join(OUT, file), "utf8")));
  const rows = shards.flatMap((shard) => shard.rows || []).sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
  const counts = {};
  for (const shard of shards) {
    for (const [key, value] of Object.entries(shard.counts || {})) {
      counts[key] = (counts[key] || 0) + Number(value || 0);
    }
  }

  const result = {
    schema: "h2c-hotspot-results-v1",
    generatedAt: new Date().toISOString(),
    cohort: {
      hotspotRows: counts.hotspotSelected ? counts.hotspotSelected / expected : null,
      maxPieces: shards[0]?.maxPieces ?? null,
      nonDirectionalOnly: true,
    },
    counts,
    summary: summarize(rows),
    rows,
  };
  fs.writeFileSync(path.join(OUT, "h2c-hotspot-results.json"), JSON.stringify(result, null, 2) + "\n");
  console.log("H2C_SUMMARY " + JSON.stringify({ cohort: result.cohort, counts, summary: result.summary }));
}

#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";


const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const FIX = path.resolve(HERE, "../holdout-v2-fixture");
const DEFAULT_XML_STAGE = path.resolve(ROOT, "validation-full/serial-production-audit/_extracted");

const { resolverCoberturaContada } = require(path.join(
  ROOT,
  "src/lib/optimizer/experimental/counted-coverage.cjs",
));
const { solveRestrictedMasterLp } = require(path.join(
  ROOT,
  "src/lib/optimizer/experimental/restricted-master-lp.cjs",
));
const { priceTwoStage } = require(path.join(
  ROOT,
  "src/lib/optimizer/experimental/two-stage-pricing-oracle.cjs",
));
const { generateSerialDirectedPatterns } = require(path.join(
  ROOT,
  "src/lib/optimizer/experimental/serial-directed-pattern-generator.cjs",
));
const { materializar } = require(path.join(ROOT, "src/lib/optimizer/legacy/materializar.cjs"));
const { optimizar } = require(path.join(ROOT, "src/lib/optimizer/legacy/motor.cjs"));
const { validarPlanIndustrial } = require(path.join(
  ROOT,
  "src/lib/optimizer/legacy/validador_industrial_v3.cjs",
));
const { computeHybridLowerBound } = require(path.join(
  ROOT,
  "src/lib/optimizer/experimental/hybrid-lower-bound.cjs",
));

const DEFAULT_IDS = [
  5445701, 5445716, 5447573, 5456195, 5456736, 5461999, 5464978, 5512349,
  5479171, 5438604, 5438566, 5462443, 5446507, 5464700,
];

const ALL_AUDIT_SERIAL_IDS = [
  5434851,5434857,5435640,5438546,5438566,5438604,5445701,5445716,5446475,5446507,
  5447573,5451829,5451833,5453022,5456195,5456736,5461999,5462443,5464700,5464978,
  5465420,5479071,5479171,5487382,5487390,5487407,5488363,5491218,5491245,5493233,
  5504219,5508513,5508515,5512349,5512836,5512875,5515391,5515421,5515728,5522069,
];

function envInt(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function parseIds() {
  if (process.env.SERIAL_ALL === "1") return new Set(ALL_AUDIT_SERIAL_IDS);
  if (process.env.SERIAL_IDS) {
    return new Set(process.env.SERIAL_IDS.split(",").map((value) => Number(value.trim())).filter(Number.isSafeInteger));
  }
  return new Set(DEFAULT_IDS);
}

function decodeFixture(targetIds) {
  const b64 = [0, 1, 2, 3].map((i) => fs.readFileSync(path.join(FIX, `part-0${i}.b64`), "utf8").trim()).join("");
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
  const n = v();
  const out = [];
  let last = 0;
  for (let k = 0; k < n; k++) {
    const id = last + v(); last = id;
    const width = v() / 10, height = v() / 10, saw = v() / 10, leptonBoards = v(), tc = v();
    const types = [];
    for (let j = 0; j < tc; j++) types.push({ w: v() / 10, h: v() / 10, q: v() });
    if (targetIds.has(id)) out.push({ id, width, height, saw, leptonBoards, types });
  }
  return out;
}


function walkXml(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === ".extracted-ok") continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".xml") out.push(full);
    }
  }
  return out;
}

function physicalLeptonBoards(xml) {
  let total = 0, found = 0;
  for (const match of xml.matchAll(/<panel\d+\b([^>]*)>/gi)) {
    found++;
    const attrs = match[1] || "";
    const n = /\bnum\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const quantity = n ? Number(n[1]) : 1;
    total += Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
  }
  return found ? total : null;
}

async function loadCanonicalParser() {
  const bundlePath = path.join(
    ROOT,
    "node_modules/.cache/serial-counted-shadow/canonical-xml.mjs",
  );
  fs.mkdirSync(path.dirname(bundlePath), { recursive: true });
  await build({
    entryPoints: [path.join(ROOT, "src/lib/optimizer/canonical-xml.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    outfile: bundlePath,
    logLevel: "warning",
  });
  return import(pathToFileURL(bundlePath).href + "?v=" + Date.now());
}

async function loadMissingFromXml(targetIds, alreadyFound) {
  const missing = [...targetIds].filter((id) => !alreadyFound.some((c) => c.id === id));
  if (!missing.length) return { cases: [], unresolved: [], sourceDir: null };

  const sourceDir = path.resolve(process.env.SERIAL_SOURCE_DIR || DEFAULT_XML_STAGE);
  if (!fs.existsSync(sourceDir)) {
    return { cases: [], unresolved: missing, sourceDir };
  }

  const parser = await loadCanonicalParser();
  const byId = new Map();
  for (const xmlPath of walkXml(sourceDir)) {
    const name = path.basename(xmlPath);
    for (const id of missing) {
      if (!byId.has(id) && name.includes(String(id))) byId.set(id, xmlPath);
    }
    if (byId.size === missing.length) break;
  }

  const cases = [];
  for (const id of missing) {
    const xmlPath = byId.get(id);
    if (!xmlPath) continue;
    const xml = fs.readFileSync(xmlPath, "utf8");
    const rawSourceAudit = rawXmlSourceAudit(xml);
    const parsed = parser.parseCanonicalXml(xml, {
      fileName: path.basename(xmlPath),
      defaultKerf: 4.5,
      defaultMinRemnant: 250,
      defaultMinCommercialRemnantLongSide: 400,
    });
    const canonical = parsed.case;
    const leptonBoards = physicalLeptonBoards(xml);
    if (!Number.isFinite(leptonBoards)) {
      throw new Error("No pude leer placas Lepton para " + id + " desde " + xmlPath);
    }
    cases.push({
      id,
      width: canonical.panel.width,
      height: canonical.panel.height,
      saw: canonical.kerf,
      leptonBoards,
      materialHasGrain: canonical.material.hasGrain ?? false,
      trimX: canonical.trim.x,
      trimY: canonical.trim.y,
      stages: canonical.constraints.stages ?? 4,
      minRemnant: canonical.constraints.minRemnant,
      minCommercialRemnantLongSide:
        canonical.constraints.minCommercialRemnantLongSide ??
        Math.max(canonical.constraints.minRemnant, 400),
      thickness: canonical.material.thickness ?? canonical.panel.thickness ?? 18,
      types: canonical.pieces.map((piece) => ({
        w: piece.width,
        h: piece.height,
        q: piece.quantity,
        grain: piece.grain ?? false,
        canRotate: piece.rotationAllowed,
        reference: piece.reference,
        description: piece.description,
        edges: piece.edges,
      })),
      source: "xml",
      sourcePath: xmlPath,
      rawSourceAudit,
    });
  }

  return {
    cases,
    unresolved: missing.filter((id) => !cases.some((c) => c.id === id)),
    sourceDir,
  };
}

function linesFromCase(c) {
  return c.types.map((t, i) => ({
    base: t.w,
    altura: t.h,
    cant: t.q,
    veta: t.canRotate == null ? Boolean(t.grain) : t.canRotate === false,
    ref: i,
    detalle: t.description || t.reference || `SERIAL-${c.id}-${i}`,
    cantos: t.edges
      ? {
          arr: Boolean(t.edges.top),
          aba: Boolean(t.edges.bottom),
          izq: Boolean(t.edges.left),
          der: Boolean(t.edges.right),
        }
      : null,
  }));
}

function configFromCase(c) {
  const hasForcedNoRotate = c.types.some((t) => t.canRotate === false);
  return {
    placaBase: c.width,
    placaAltura: c.height,
    refiladoX: c.trimX ?? 0,
    refiladoY: c.trimY ?? 0,
    sierra: c.saw,
    etapas: c.stages ?? 4,
    materialConVeta: Boolean(c.materialHasGrain) || hasForcedNoRotate,
    descontarCanto: false,
    cantoEspesor: 0,
    restoMin: c.minRemnant ?? 250,
    restoMax: c.minCommercialRemnantLongSide ?? Math.max(c.minRemnant ?? 250, 400),
    material: "SERIAL-SHADOW",
    thickness: c.thickness ?? 18,
  };
}

function gcd2(a, b) { a = Math.abs(Math.trunc(a)); b = Math.abs(Math.trunc(b)); while (b) [a, b] = [b, a % b]; return a || 1; }
function gcdAll(values) { return values.reduce(gcd2, 0) || 1; }
function coverageMax(patterns, typeCount) {
  const max = new Array(typeCount).fill(0);
  for (const pattern of patterns) for (const [index, count] of pattern?.uso || []) if (index >= 0 && index < typeCount) max[index] = Math.max(max[index], count);
  return max;
}
function safeLowerBound(lines, config, incumbent) {
  const result = computeHybridLowerBound(lines, config, incumbent, { useRaster: false, claude: { usarRaster: false, usarDffFs0: true } });
  return { value: Math.max(1, Math.floor(Number(result?.cheapLowerBound ?? 0)), Math.floor(Number(result?.lowerBound ?? 0))), reason: result?.reason ?? null };
}
function nowMs() { return Number(process.hrtime.bigint()) / 1e6; }

function rawAttrs(text) {
  const out = {};
  for (const match of String(text || "").matchAll(/([\\w:.-]+)\\s*=\\s*["']([^"']*)["']/g)) {
    out[match[1].toLowerCase()] = match[2];
  }
  return out;
}

function rawXmlSourceAudit(xml) {
  const panels = [...String(xml).matchAll(/<panel\\d+\\b([^>]*)>/gi)].map((match) => rawAttrs(match[1]));
  const roots = [...String(xml).matchAll(/<no\\.0\\b([^>]*)>/gi)].map((match) => rawAttrs(match[1]));
  const quantities = panels.map((attrs) => {
    const n = Number(attrs.num ?? 1);
    return Number.isFinite(n) && n > 0 ? n : 1;
  });
  const physicalBoards = quantities.reduce((sum, value) => sum + value, 0);
  const kerfValues = panels
    .map((attrs) => Number(attrs.saw ?? attrs.kerf))
    .filter(Number.isFinite);
  const panelRectangles = panels.map((attrs) => ({
    l: Number(attrs.l),
    w: Number(attrs.w),
    thickness: Number(attrs.thickness),
    material: attrs.material ?? null,
    num: Number(attrs.num ?? 1),
  }));
  const rootTrimReferences = roots
    .map((attrs) => Number(attrs.trim))
    .filter(Number.isFinite);
  const grainAttributes = [...String(xml).matchAll(/\bgrain\s*=\s*["']([^"']+)["']/gi)]
    .map((match) => match[1]);
  return {
    panelTags: panels.length,
    physicalBoards,
    panelRectangles,
    kerfValues: [...new Set(kerfValues)],
    materials: [...new Set(panelRectangles.map((entry) => entry.material).filter(Boolean))],
    rootTrimReferences: [...new Set(rootTrimReferences)],
    grainAttributes: [...new Set(grainAttributes)],
  };
}

function patternFromPhysicalBoard(board, typeCount) {
  if (!board?.colocadas?.length) return null;
  const uso = new Map();
  for (const placement of board.colocadas) {
    const index = Number(placement?.pieza?.ref);
    if (!Number.isInteger(index) || index < 0 || index >= typeCount) return null;
    uso.set(index, (uso.get(index) || 0) + 1);
  }
  return {
    uso,
    area: board.colocadas.reduce(
      (sum, placement) => sum + placement.base * placement.altura,
      0,
    ),
    placa: board,
  };
}

function usageSignature(pattern, typeCount) {
  return Array.from(
    { length: typeCount },
    (_, index) => pattern?.uso?.get(index) || 0,
  ).join(",");
}

const targetIds = parseIds();
const fixtureCases = decodeFixture(targetIds).map((c) => ({ ...c, source: "holdout-v2-fixture" }));
const xmlRecovery = await loadMissingFromXml(targetIds, fixtureCases);
const cases = fixtureCases.concat(xmlRecovery.cases).sort((a, b) => a.id - b.id);
const missing = xmlRecovery.unresolved;
if (xmlRecovery.cases.length) {
  console.log(`Recuperados desde XML reales: ${xmlRecovery.cases.map((c) => c.id).join(", ")}`);
}
if (missing.length) {
  console.warn(
    `No pude resolver ${missing.length} IDs: ${missing.join(", ")}. ` +
    `Staging XML buscado: ${xmlRecovery.sourceDir || "n/a"}`,
  );
}

const limits = {
  maxExpansions: envInt("SERIAL_MAX_EXPANSIONS", 250000),
  maxAndCombinations: envInt("SERIAL_MAX_AND_COMBINATIONS", 250000),
  maxFrontierEntries: envInt("SERIAL_MAX_FRONTIER", 100000),
  maxMaterializations: envInt("SERIAL_MAX_MATERIALIZATIONS", 10000),
};
const maxVariants = envInt("SERIAL_MAX_VARIANTS", 1);
const solverNodes = envInt("SERIAL_SOLVER_NODES", 1600000);
const solverWatchdogMs = envInt("SERIAL_SOLVER_WATCHDOG_MS", 12000);
const maxPhysicalTests = envInt("SERIAL_MAX_PHYSICAL_TESTS", 176);
const baselinePhysicalTests = envInt("SERIAL_BASELINE_PHYSICAL_TESTS", 96);
const maxBatchPieces = envInt("SERIAL_MAX_BATCH_PIECES", 96);
const poolOnly = process.env.SERIAL_POOL_ONLY === "1";
const twoStagePricingEnabled = process.env.SERIAL_2STAGE_PRICING === "1";
const twoStagePricingRounds = envInt("SERIAL_2STAGE_ROUNDS", 20);
const twoStagePricingMaxStates = envInt("SERIAL_2STAGE_MAX_STATES", 500000);
const twoStageMasterEnabled = process.env.SERIAL_2STAGE_MASTER === "1";
const twoStageMasterWatchdogMs = envInt("SERIAL_2STAGE_MASTER_WATCHDOG_MS", 3000);
const twoStageMasterNodes = envInt("SERIAL_2STAGE_MASTER_NODES", 1600000);
const twoStageResidualWatchdogMs = envInt("SERIAL_2STAGE_RESIDUAL_WATCHDOG_MS", 1000);
const twoStageResidualNodes = envInt("SERIAL_2STAGE_RESIDUAL_NODES", 250000);
const residualCgEnabled = process.env.SERIAL_RESIDUAL_CG === "1";
const residualCgThresholdPieces = envInt("SERIAL_RESIDUAL_CG_THRESHOLD", 100);
const residualCgMaxCycles = envInt("SERIAL_RESIDUAL_CG_MAX_CYCLES", 6);
const residualCgPricingRounds = envInt("SERIAL_RESIDUAL_CG_PRICING_ROUNDS", 100);
const residualCgPricingBudgetMs = envInt("SERIAL_RESIDUAL_CG_PRICING_BUDGET_MS", 3000);
const residualCgFinalizerMs = envInt("SERIAL_RESIDUAL_CG_FINALIZER_MS", 3000);
const residualCgFinalizerMaxPieces = envInt("SERIAL_RESIDUAL_CG_FINALIZER_MAX_PIECES", 300);
const exportCombinedPlans = process.env.SERIAL_EXPORT_COMBINED_PLANS === "1";
const combinedPlanAuditDir = path.resolve(
  process.env.SERIAL_COMBINED_PLAN_DIR ||
  path.join(HERE, "combined-plan-audit"),
);
if (exportCombinedPlans) fs.mkdirSync(combinedPlanAuditDir, { recursive: true });

const rows = [];
for (const c of cases) {
  const lines = linesFromCase(c);
  const config = configFromCase(c);
  const pieces = lines.reduce((sum, line) => sum + line.cant, 0);
  const quantityGcd = gcdAll(lines.map((line) => line.cant));
  const lb = safeLowerBound(lines, config, c.leptonBoards + 1);

  let generator = null, generatorError = null;
  const tg = nowMs();
  try {
    generator = generateSerialDirectedPatterns(lines, config, {
      targetBoards: lb.value,
      maxPhysicalTests,
      baselinePhysicalTests,
      maxBatchPieces,
    });
  } catch (error) { generatorError = String(error?.stack || error); }
  const generationMs = nowMs() - tg;
  const patterns = generator?.patterns || [];

  let exactLp = null, exactLpError = null;
  if (!generatorError && patterns.length) {
    try {
      exactLp = solveRestrictedMasterLp(patterns, lines.map((line) => line.cant));
    } catch (error) {
      exactLpError = String(error?.stack || error);
    }
  }

  let twoStagePricing = null;
  let combinedPlanForExternalAudit = null;
  if (
    twoStagePricingEnabled &&
    exactLp?.status === "OPTIMAL" &&
    Array.isArray(exactLp.dualPrices)
  ) {
    const pricingPool = patterns.slice();
    const seenUsage = new Set(
      pricingPool.map((pattern) =>
        lines.map((_, index) => pattern.uso.get(index) || 0).join(","),
      ),
    );
    const rounds = [];
    const initialObjective = exactLp.objective;
    let currentLp = exactLp;
    let stopReason = "round-limit";
    let oracleExact = true;
    let pricingMs = 0;
    let lpMs = exactLp.elapsedMs || 0;

    for (let round = 0; round < twoStagePricingRounds; round++) {
      const oracle = priceTwoStage(lines, config, currentLp.dualPrices, {
        maxStates: twoStagePricingMaxStates,
      });
      pricingMs += oracle.elapsedMs || 0;
      oracleExact = oracleExact && Boolean(oracle.exactForTwoStage);
      const best = oracle.best;
      const before = currentLp.objective;

      if (!best) {
        stopReason = "no-pattern";
        rounds.push({
          round,
          before,
          oracleStatus: oracle.status,
          oracleExact: oracle.exactForTwoStage,
          axes: oracle.axes,
          pricingMs: oracle.elapsedMs,
          added: false,
        });
        break;
      }

      const signature = best.usage.join(",");
      const reducedCost = 1 - best.dualValue;
      const roundTelemetry = {
        round,
        before,
        dualValue: best.dualValue,
        reducedCost,
        rootAxis: best.rootAxis,
        area: best.area,
        usage: best.usage,
        oracleExact: oracle.exactForTwoStage,
        axes: oracle.axes,
        pricingMs: oracle.elapsedMs,
        added: false,
      };

      if (best.dualValue <= 1 + 1e-7) {
        stopReason = "no-negative-reduced-cost";
        rounds.push(roundTelemetry);
        break;
      }
      if (seenUsage.has(signature)) {
        stopReason = "duplicate-negative-column";
        rounds.push(roundTelemetry);
        break;
      }

      const pricingPattern = best.pattern;
      const expectedPricingPieces = best.usage.reduce((sum, count) => sum + count, 0);
      const pricingValidation = pricingPattern?.placa
        ? validarPlanIndustrial(
            {
              placas: [pricingPattern.placa],
              opts: config,
              resumen: { piezas: expectedPricingPieces },
            },
            expectedPricingPieces,
          )
        : null;
      roundTelemetry.patternValid = Boolean(pricingValidation?.ok);
      roundTelemetry.patternValidation = pricingValidation
        ? {
            ok: pricingValidation.ok,
            geometriaValida: pricingValidation.geometriaValida,
            secuenciaCompleta: pricingValidation.secuenciaCompleta,
            coberturaCompleta: pricingValidation.coberturaCompleta,
            cortesTerminales: pricingValidation.cortesTerminales,
            errores: pricingValidation.detallePlacas?.flatMap((entry) => entry.errores || []) ?? [],
          }
        : null;

      if (!pricingValidation?.ok) {
        stopReason = "invalid-pricing-column";
        rounds.push(roundTelemetry);
        break;
      }

      pricingPattern._twoStagePricing = true;
      pricingPattern._rootAxis = best.rootAxis;
      pricingPool.push(pricingPattern);
      seenUsage.add(signature);

      const nextLp = solveRestrictedMasterLp(
        pricingPool,
        lines.map((line) => line.cant),
      );
      lpMs += nextLp.elapsedMs || 0;
      roundTelemetry.added = true;
      roundTelemetry.after = nextLp.objective;
      roundTelemetry.lpMs = nextLp.elapsedMs;
      rounds.push(roundTelemetry);
      currentLp = nextLp;

      if (nextLp.status !== "OPTIMAL") {
        stopReason = "lp-not-optimal";
        break;
      }
    }

    let lpFloorResidualAudit = null;
    if (
      twoStageMasterEnabled &&
      currentLp?.status === "OPTIMAL" &&
      Array.isArray(currentLp.primal) &&
      currentLp.primal.length === pricingPool.length
    ) {
      const areaPlaca =
        (c.width - (config.refiladoX || 0)) *
        (c.height - (config.refiladoY || 0));
      const floorCounts = currentLp.primal.map((value) =>
        Math.max(0, Math.floor(Number(value) + 1e-9)),
      );
      const residual = lines.map((line) => Number(line.cant));
      let floorBoards = 0;
      for (let patternIndex = 0; patternIndex < pricingPool.length; patternIndex++) {
        const count = floorCounts[patternIndex];
        if (!count) continue;
        floorBoards += count;
        for (const [typeIndex, usage] of pricingPool[patternIndex].uso || []) {
          residual[typeIndex] -= usage * count;
        }
      }
      const residualPieces = residual.reduce((sum, value) => sum + Math.max(0, value), 0);
      const residualStarted = nowMs();
      let residualResult = null;
      let residualError = null;
      try {
        if (residual.every((value) => value === 0)) {
          residualResult = {
            placas: 0,
            counts: [],
            nodos: 0,
            ramasMultiplicidad: 0,
            agotado: false,
            targetReached: true,
          };
        } else if (residual.every((value) => value >= 0)) {
          const residualSolver = resolverCoberturaContada(
            pricingPool,
            residual,
            areaPlaca,
            residualPieces + 1,
            twoStageResidualWatchdogMs,
            {
              maxNodos: twoStageResidualNodes,
              watchdogMs: twoStageResidualWatchdogMs,
              expandPlan: false,
              lowerBoundDual: currentLp.dualPrices,
            },
          );
          residualResult = residualSolver?.resolver(
            lines.map((line) => line.base * line.altura),
          ) || null;
        } else {
          residualError = "LP floor produced negative residual";
        }
      } catch (error) {
        residualError = String(error?.stack || error);
      }

      let combinedValidation = null;
      let combinedBoards = null;
      if (Number.isFinite(residualResult?.placas)) {
        const planPatterns = [];
        for (let patternIndex = 0; patternIndex < pricingPool.length; patternIndex++) {
          for (let copy = 0; copy < floorCounts[patternIndex]; copy++) {
            planPatterns.push(pricingPool[patternIndex]);
          }
        }
        for (const entry of residualResult?.counts || []) {
          for (let copy = 0; copy < entry.count; copy++) {
            planPatterns.push(entry.pattern);
          }
        }
        combinedBoards = planPatterns.length;
        try {
          const combinedPlan = materializar(
            planPatterns,
            lines,
            {
              ...config,
              anchoUtil: c.width - (config.refiladoX || 0),
              altoUtil: c.height - (config.refiladoY || 0),
            },
          );
          combinedValidation = combinedPlan
            ? validarPlanIndustrial(combinedPlan, pieces)
            : null;
        } catch (error) {
          residualError = String(error?.stack || error);
        }
      }

      lpFloorResidualAudit = {
        lpObjective: currentLp.objective,
        floorBoards,
        residualPieces,
        residualDemand: residual,
        residualBoards: Number.isFinite(residualResult?.placas)
          ? residualResult.placas
          : null,
        combinedBoards,
        combinedValid: Boolean(combinedValidation?.ok),
        residualNodes: residualResult?.nodos ?? null,
        residualMultiplicityBranches: residualResult?.ramasMultiplicidad ?? null,
        residualExhausted: residualResult?.agotado ?? null,
        residualTargetReached: residualResult?.targetReached ?? null,
        residualDualBoundEnabled: residualResult?.dualBoundEnabled ?? null,
        elapsedMs: +(nowMs() - residualStarted).toFixed(3),
        error: residualError,
      };
    }

    let residualCgAudit = null;
    if (
      residualCgEnabled &&
      currentLp?.status === "OPTIMAL" &&
      Array.isArray(currentLp.primal)
    ) {
      const residualPool = pricingPool.slice();
      const residualSeenUsage = new Set(
        residualPool.map((pattern) => usageSignature(pattern, lines.length)),
      );
      const fixedPatterns = [];
      let residualDemand = lines.map((line) => Number(line.cant));
      let totalResidualPricingMs = 0;
      let residualPricingExact = true;
      let demandCapsBindingSeen = false;
      let residualCgStopReason = "max-cycles";
      const cycles = [];

      for (let cycle = 0; cycle < residualCgMaxCycles; cycle++) {
        const piecesBefore = residualDemand.reduce((sum, value) => sum + value, 0);
        if (piecesBefore <= residualCgThresholdPieces) {
          residualCgStopReason = "furniture-sized-residual";
          break;
        }

        let residualLp = solveRestrictedMasterLp(residualPool, residualDemand);
        const residualLines = lines.map((line, index) => ({
          ...line,
          cant: residualDemand[index],
        }));
        const pricingStarted = nowMs();
        let pricingStop = "round-limit";
        let pricingAdded = 0;
        let lastReducedCost = null;

        for (let round = 0; round < residualCgPricingRounds; round++) {
          if (nowMs() - pricingStarted >= residualCgPricingBudgetMs) {
            pricingStop = "pricing-budget";
            break;
          }

          const oracle = priceTwoStage(
            residualLines,
            config,
            residualLp.dualPrices,
            { maxStates: twoStagePricingMaxStates },
          );
          totalResidualPricingMs += oracle.elapsedMs || 0;
          residualPricingExact =
            residualPricingExact && Boolean(oracle.exactForTwoStage);
          demandCapsBindingSeen =
            demandCapsBindingSeen || Boolean(oracle.demandCapsBinding);

          const best = oracle.best;
          if (!best) {
            pricingStop = oracle.demandCapsBinding
              ? "no-feasible-pattern-demand-caps"
              : "no-pattern";
            break;
          }

          lastReducedCost = 1 - best.dualValue;
          if (best.dualValue <= 1 + 1e-7) {
            pricingStop = "no-negative-reduced-cost";
            break;
          }

          const signature = best.usage.join(",");
          if (residualSeenUsage.has(signature)) {
            pricingStop = "duplicate-negative-column";
            break;
          }

          const expectedPieces = best.usage.reduce((sum, count) => sum + count, 0);
          const validation = best.pattern?.placa
            ? validarPlanIndustrial(
                {
                  placas: [best.pattern.placa],
                  opts: config,
                  resumen: { piezas: expectedPieces },
                },
                expectedPieces,
              )
            : null;
          if (!validation?.ok) {
            pricingStop = "invalid-pricing-column";
            break;
          }

          best.pattern._twoStagePricing = true;
          best.pattern._residualPricing = true;
          residualPool.push(best.pattern);
          residualSeenUsage.add(signature);
          pricingAdded++;
          residualLp = solveRestrictedMasterLp(residualPool, residualDemand);
        }

        const floorCounts = residualLp.primal.map((value) =>
          Math.max(0, Math.floor(Number(value) + 1e-9)),
        );
        const nextResidual = residualDemand.slice();
        let fixedBoardsThisCycle = 0;

        for (
          let patternIndex = 0;
          patternIndex < residualPool.length;
          patternIndex++
        ) {
          const count = floorCounts[patternIndex] || 0;
          if (!count) continue;
          fixedBoardsThisCycle += count;
          for (let copy = 0; copy < count; copy++) {
            fixedPatterns.push(residualPool[patternIndex]);
          }
          for (const [typeIndex, usage] of residualPool[patternIndex].uso || []) {
            nextResidual[typeIndex] -= usage * count;
          }
        }

        const minResidual = Math.min(...nextResidual);
        const piecesAfter = nextResidual.reduce(
          (sum, value) => sum + Math.max(0, value),
          0,
        );
        cycles.push({
          cycle,
          piecesBefore,
          lpObjective: residualLp.objective,
          pricingAdded,
          pricingStop,
          lastReducedCost,
          pricingExact: residualPricingExact,
          demandCapsBindingSeen,
          fixedBoards: fixedBoardsThisCycle,
          piecesAfter,
        });

        if (minResidual < 0) {
          residualCgStopReason = "negative-residual-after-floor";
          break;
        }
        if (!fixedBoardsThisCycle || piecesAfter >= piecesBefore) {
          residualCgStopReason = "no-floor-progress";
          break;
        }

        residualDemand = nextResidual;
        if (piecesAfter <= residualCgThresholdPieces) {
          residualCgStopReason = "furniture-sized-residual";
          break;
        }
      }

      let finalizerBoards = null;
      let finalizerError = null;
      let finalizerMs = 0;
      const residualPieces = residualDemand.reduce(
        (sum, value) => sum + Math.max(0, value),
        0,
      );

      if (residualPieces === 0) {
        finalizerBoards = 0;
      } else if (residualPieces <= residualCgFinalizerMaxPieces) {
        const finalizerStarted = nowMs();
        try {
          const sub = [];
          for (let index = 0; index < lines.length; index++) {
            const count = residualDemand[index];
            if (!count) continue;
            sub.push({
              ...lines[index],
              ref: index,
              cant: count,
            });
          }
          const finalResult = optimizar(sub, {
            ...config,
            presupuestoBeamMs: residualCgFinalizerMs,
            maxPiezasBeam: Math.max(120, residualPieces),
            trazaDiag: false,
          });
          const finalPatterns = (finalResult?.placas || [])
            .map((board) => patternFromPhysicalBoard(board, lines.length))
            .filter(Boolean);
          if (finalPatterns.length !== (finalResult?.placas || []).length) {
            throw new Error("residual finalizer returned unmappable board");
          }
          fixedPatterns.push(...finalPatterns);
          finalizerBoards = finalPatterns.length;
        } catch (error) {
          finalizerError = String(error?.stack || error);
        }
        finalizerMs = nowMs() - finalizerStarted;
      } else {
        finalizerError =
          "residual exceeds finalizer max pieces: " +
          residualPieces +
          " > " +
          residualCgFinalizerMaxPieces;
      }

      let combinedBoards = null;
      let combinedValid = false;
      let validationError = null;
      if (!finalizerError && finalizerBoards !== null) {
        try {
          const combinedPlan = materializar(
            fixedPatterns,
            lines,
            {
              ...config,
              anchoUtil: c.width - (config.refiladoX || 0),
              altoUtil: c.height - (config.refiladoY || 0),
            },
          );
          const validation = combinedPlan
            ? validarPlanIndustrial(combinedPlan, pieces)
            : null;
          if (validation?.ok) combinedPlanForExternalAudit = combinedPlan;
          combinedBoards = combinedPlan?.resumen?.placas ?? null;
          combinedValid = Boolean(validation?.ok);
          if (!combinedValid) {
            validationError = validation || "materialization failed";
          }
        } catch (error) {
          validationError = String(error?.stack || error);
        }
      }

      residualCgAudit = {
        thresholdPieces: residualCgThresholdPieces,
        finalizerMaxPieces: residualCgFinalizerMaxPieces,
        cycles,
        stopReason: residualCgStopReason,
        residualPieces,
        finalizerBoards,
        finalizerMs: +finalizerMs.toFixed(3),
        finalizerError,
        fixedBoards: fixedPatterns.length - (finalizerBoards || 0),
        combinedBoards,
        combinedValid,
        validationError,
        totalResidualPricingMs,
        residualPricingExact,
        demandCapsBindingSeen,
        gateLeptonPlus2:
          combinedValid &&
          Number.isFinite(combinedBoards) &&
          combinedBoards <= c.leptonBoards + 2,
      };
    }

    let masterAudit = null;
    if (twoStageMasterEnabled) {
      const areaPlaca =
        (c.width - (config.refiladoX || 0)) *
        (c.height - (config.refiladoY || 0));
      const masterStarted = nowMs();
      try {
        const master = resolverCoberturaContada(
          pricingPool,
          lines.map((line) => line.cant),
          areaPlaca,
          pieces + 1,
          twoStageMasterWatchdogMs,
          {
            maxNodos: twoStageMasterNodes,
            watchdogMs: twoStageMasterWatchdogMs,
            targetBoards: c.leptonBoards,
            expandPlan: false,
            lowerBoundDual: currentLp.dualPrices,
          },
        );
        const masterResult = master?.resolver(
          lines.map((line) => line.base * line.altura),
        ) || null;
        masterAudit = {
          boards: Number.isFinite(masterResult?.placas) ? masterResult.placas : null,
          nodes: masterResult?.nodos ?? null,
          multiplicityBranches: masterResult?.ramasMultiplicidad ?? null,
          depthMax: masterResult?.profundidadMax ?? null,
          targetReached: masterResult?.targetReached ?? null,
          exhausted: masterResult?.agotado ?? null,
          timeout: masterResult?.timeout ?? null,
          budgetHit: masterResult?.budgetHit ?? null,
          watchdogHit: masterResult?.watchdogHit ?? null,
          seededIncumbent: masterResult?.seededIncumbent ?? null,
          dualBoundEnabled: masterResult?.dualBoundEnabled ?? null,
          elapsedMs: +(nowMs() - masterStarted).toFixed(3),
          patterns: pricingPool.length,
        };
      } catch (error) {
        masterAudit = {
          boards: null,
          error: String(error?.stack || error),
          elapsedMs: +(nowMs() - masterStarted).toFixed(3),
          patterns: pricingPool.length,
        };
      }
    }

    twoStagePricing = {
      initialObjective,
      finalObjective: currentLp.objective,
      improvement: initialObjective - currentLp.objective,
      addedColumns: pricingPool.length - patterns.length,
      rounds,
      stopReason,
      oracleExact,
      totalPricingMs: pricingMs,
      totalLpMs: lpMs,
      finalDualPrices: currentLp.dualPrices,
      finalMaxConstraintError: currentLp.maxConstraintError,
      finalMaxDualViolation: currentLp.maxDualViolation,
      allAddedPatternsValid: rounds
        .filter((entry) => entry.added)
        .every((entry) => entry.patternValid === true),
      lpFloorResidualAudit,
      residualCgAudit,
      masterAudit,
    };
  }

  const maxCoverage = coverageMax(patterns, lines.length);
  const missingTypes = maxCoverage.map((value, index) => (value > 0 ? null : index)).filter((value) => value !== null);

  let solution = null, solverError = null, solveMs = null, plan = null, validation = null;
  if (!poolOnly && !generatorError && patterns.length && !missingTypes.length) {
    const areaPlaca =
      (c.width - (config.refiladoX || 0)) *
      (c.height - (config.refiladoY || 0));
    // Safe research incumbent independent of Lepton. Unit patterns guarantee
    // an exact fallback of at most one board per physical piece.
    const incumbent = pieces + 1;
    const ts = nowMs();
    try {
      const solver = resolverCoberturaContada(patterns, lines.map((line) => line.cant), areaPlaca, incumbent, solverWatchdogMs, {
        maxNodos: solverNodes, watchdogMs: solverWatchdogMs, targetBoards: lb.value, expandPlan: true,
      });
      solution = solver?.resolver(lines.map((line) => line.base * line.altura)) || null;
      solveMs = nowMs() - ts;
      if (solution?.plan) {
        plan = materializar(solution.plan, lines, { ...config, anchoUtil: c.width, altoUtil: c.height });
        validation = plan ? validarPlanIndustrial(plan, pieces) : null;
      }
    } catch (error) { solveMs = nowMs() - ts; solverError = String(error?.stack || error); }
  }

  const boards = validation?.ok && plan?.resumen ? plan.resumen.placas : null;
  const row = {
    id: c.id, source: c.source ?? null, sourcePath: c.sourcePath ?? null, types: lines.length, pieces, quantityGcd, leptonBoards: c.leptonBoards,
    demand: lines.map((line) => line.cant),
    poolOnly,
    safeLowerBound: lb.value, lowerBoundReason: lb.reason,
    generatorStatus: generatorError ? "ERROR" : "DIRECTED",
    generatorRestricted: true,
    generatorPatterns: patterns.length,
    generatorRoots: null,
    generatorFailures: generator?.telemetry?.failedTests ?? 0,
    generatorTelemetry: generator?.telemetry ?? null,
    generationMs: +generationMs.toFixed(3),
    exactLpStatus: exactLp?.status ?? null,
    exactLpObjective: Number.isFinite(exactLp?.objective) ? exactLp.objective : null,
    exactLpIterations: exactLp?.iterations ?? null,
    exactLpMs: Number.isFinite(exactLp?.elapsedMs) ? +exactLp.elapsedMs.toFixed(3) : null,
    exactLpMaxConstraintError: Number.isFinite(exactLp?.maxConstraintError)
      ? exactLp.maxConstraintError
      : null,
    exactLpMaxDualViolation: Number.isFinite(exactLp?.maxDualViolation)
      ? exactLp.maxDualViolation
      : null,
    exactLpDualPrices: exactLp?.dualPrices ?? null,
    exactLpError,
    twoStagePricing,
    missingTypes,
    solverBoards: Number.isFinite(solution?.placas) ? solution.placas : null,
    solverNodes: solution?.nodos ?? null,
    multiplicityBranches: solution?.ramasMultiplicidad ?? null,
    solverDepthMax: solution?.profundidadMax ?? null,
    solverInitialIncumbent: solution?.initialIncumbent ?? null,
    solverMonotypeIncumbent: solution?.monotypeIncumbent ?? null,
    solverSeededIncumbent: solution?.seededIncumbent ?? null,
    solverExhausted: solution?.agotado ?? null, solverTargetReached: solution?.targetReached ?? null,
    solveMs: solveMs == null ? null : +solveMs.toFixed(3), materializedBoards: boards,
    valid: Boolean(validation?.ok), deltaVsLepton: boards == null ? null : boards - c.leptonBoards,
    reachedLepton: boards != null && boards <= c.leptonBoards,
    reachedSafeLowerBound: boards != null && boards <= lb.value,
    patternCounts: solution?.counts?.map((entry) => ({
      count: entry.count,
      usage: lines.map((_, index) => entry.pattern.uso.get(index) || 0),
    })) ?? null,
    poolPatterns: patterns.map((pattern) => ({
      usage: lines.map((_, index) => pattern.uso.get(index) || 0),
      area: pattern.area,
    })),
    generatorError, solverError,
  };
  if (exportCombinedPlans && combinedPlanForExternalAudit) {
    const bundle = {
      schema: "optimizer-combined-plan-audit-v1",
      generatedAt: new Date().toISOString(),
      caseId: c.id,
      sourcePath: c.sourcePath ?? null,
      rawSourceAudit: c.rawSourceAudit ?? null,
      leptonBoards: c.leptonBoards,
      expected: {
        panel: { width: c.width, height: c.height },
        trim: { x: c.trimX ?? 0, y: c.trimY ?? 0 },
        useful: {
          width: c.width - (c.trimX ?? 0),
          height: c.height - (c.trimY ?? 0),
        },
        kerf: c.saw,
        stages: c.stages ?? 4,
        materialHasGrain: Boolean(c.materialHasGrain),
        pieces: c.types.map((type, index) => ({
          index,
          width: type.w,
          height: type.h,
          quantity: type.q,
          grain: Boolean(type.grain),
          rotationAllowed: type.canRotate,
          reference: type.reference ?? null,
        })),
      },
      pipeline: {
        convergedLp: row.twoStagePricing?.finalObjective ?? null,
        fixedBoards: row.twoStagePricing?.residualCgAudit?.fixedBoards ?? null,
        finalizerBoards: row.twoStagePricing?.residualCgAudit?.finalizerBoards ?? null,
        combinedBoards: row.twoStagePricing?.residualCgAudit?.combinedBoards ?? null,
      },
      plan: combinedPlanForExternalAudit,
    };
    fs.writeFileSync(
      path.join(combinedPlanAuditDir, String(c.id) + ".combined-plan.json"),
      JSON.stringify(bundle) + "\n",
    );
  }

  rows.push(row);
  console.log("CASE " + JSON.stringify({
    id: row.id, types: row.types, pieces: row.pieces, gcd: row.quantityGcd, lepton: row.leptonBoards,
    lb: row.safeLowerBound, patterns: row.generatorPatterns,
    tests: row.generatorTelemetry?.tests ?? null,
    upperBound: row.generatorTelemetry?.upperBound ?? null,
    dualObjective: row.generatorTelemetry?.finalDualObjective ?? null,
    exactLp: row.exactLpObjective,
    exactLpMs: row.exactLpMs,
    exactLpIterations: row.exactLpIterations,
    twoStageLp: row.twoStagePricing?.finalObjective ?? null,
    twoStageGain: row.twoStagePricing?.improvement ?? null,
    twoStageCols: row.twoStagePricing?.addedColumns ?? null,
    twoStageStop: row.twoStagePricing?.stopReason ?? null,
    twoStageExact: row.twoStagePricing?.oracleExact ?? null,
    twoStagePricingMs: row.twoStagePricing?.totalPricingMs ?? null,
    twoStagePhysicalValid: row.twoStagePricing?.allAddedPatternsValid ?? null,
    twoStageMasterBoards: row.twoStagePricing?.masterAudit?.boards ?? null,
    twoStageMasterReached: row.twoStagePricing?.masterAudit?.targetReached ?? null,
    twoStageMasterMs: row.twoStagePricing?.masterAudit?.elapsedMs ?? null,
    lpFloorBoards: row.twoStagePricing?.lpFloorResidualAudit?.floorBoards ?? null,
    lpResidualPieces: row.twoStagePricing?.lpFloorResidualAudit?.residualPieces ?? null,
    lpResidualBoards: row.twoStagePricing?.lpFloorResidualAudit?.residualBoards ?? null,
    lpFloorCombinedBoards: row.twoStagePricing?.lpFloorResidualAudit?.combinedBoards ?? null,
    lpFloorCombinedValid: row.twoStagePricing?.lpFloorResidualAudit?.combinedValid ?? null,
    lpFloorResidualMs: row.twoStagePricing?.lpFloorResidualAudit?.elapsedMs ?? null,
    residualCgBoards: row.twoStagePricing?.residualCgAudit?.combinedBoards ?? null,
    residualCgValid: row.twoStagePricing?.residualCgAudit?.combinedValid ?? null,
    residualCgPieces: row.twoStagePricing?.residualCgAudit?.residualPieces ?? null,
    residualCgCycles: row.twoStagePricing?.residualCgAudit?.cycles?.length ?? null,
    residualCgStop: row.twoStagePricing?.residualCgAudit?.stopReason ?? null,
    residualCgExact: row.twoStagePricing?.residualCgAudit?.residualPricingExact ?? null,
    residualCgCaps: row.twoStagePricing?.residualCgAudit?.demandCapsBindingSeen ?? null,
    residualCgGate: row.twoStagePricing?.residualCgAudit?.gateLeptonPlus2 ?? null,
    dualTop: row.generatorTelemetry?.finalDualPrices
      ? row.generatorTelemetry.finalDualPrices
          .map((price, index) => ({ index, price }))
          .sort((a, b) => b.price - a.price || a.index - b.index)
          .slice(0, 6)
      : null,
    genMs: row.generationMs,
    boards: row.materializedBoards, valid: row.valid, delta: row.deltaVsLepton,
    seed: row.solverSeededIncumbent,
    monoSeed: row.solverMonotypeIncumbent,
    depth: row.solverDepthMax,
    nodes: row.solverNodes, multBranches: row.multiplicityBranches, solveMs: row.solveMs,
    generatorStatus: row.generatorStatus, missingTypes: row.missingTypes,
  }));
}

for (const row of rows) {
  const combined = row.twoStagePricing?.residualCgAudit;
  if (combined?.combinedValid && Number.isFinite(combined.combinedBoards)) {
    row.legacyValid = row.valid;
    row.legacyMaterializedBoards = row.materializedBoards;
    row.valid = true;
    row.materializedBoards = combined.combinedBoards;
    row.deltaVsLepton = combined.combinedBoards - row.leptonBoards;
    row.reachedLepton = combined.combinedBoards <= row.leptonBoards;
    row.reachedSafeLowerBound = combined.combinedBoards <= row.safeLowerBound;
    row.resultPipeline = "residual-cg-finalizer";
  } else {
    row.resultPipeline = row.valid ? "counted-coverage" : null;
  }
}
const valid = rows.filter((r) => r.valid);
const summary = {
  schema: "optimizer-serial-counted-shadow-v1", generatedAt: new Date().toISOString(),
  targets: targetIds.size, fixtureCases: fixtureCases.length, xmlRecoveredCases: xmlRecovery.cases.length, unresolvedIds: missing,
  limits, maxVariants, solverNodes, solverWatchdogMs, maxPhysicalTests, baselinePhysicalTests, maxBatchPieces, poolOnly,
  twoStagePricingEnabled, twoStagePricingRounds, twoStagePricingMaxStates,
  twoStageMasterEnabled, twoStageMasterWatchdogMs, twoStageMasterNodes,
  twoStageResidualWatchdogMs, twoStageResidualNodes,
  residualCgEnabled, residualCgThresholdPieces, residualCgMaxCycles,
  residualCgPricingRounds, residualCgPricingBudgetMs, residualCgFinalizerMs,
  residualCgFinalizerMaxPieces, exportCombinedPlans,
  valid: valid.length, invalid: rows.length - valid.length,
  reachedLepton: valid.filter((r) => r.reachedLepton).length,
  betterThanLepton: valid.filter((r) => r.deltaVsLepton < 0).length,
  equalLepton: valid.filter((r) => r.deltaVsLepton === 0).length,
  worseThanLepton: valid.filter((r) => r.deltaVsLepton > 0).length,
  reachedSafeLowerBound: valid.filter((r) => r.reachedSafeLowerBound).length,
  totalGenerationMs: rows.reduce((sum, r) => sum + (r.generationMs || 0), 0),
  totalSolveMs: rows.reduce((sum, r) => sum + (r.solveMs || 0), 0),
};

const output = { summary, rows };
const outputPath = path.join(HERE, "SERIAL_COUNTED_SHADOW_RESULT.json");
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n");
console.log("SUMMARY " + JSON.stringify(summary));
console.log("RESULT " + outputPath);

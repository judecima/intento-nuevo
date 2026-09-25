#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const DEFAULT_SOURCE = path.resolve(
  ROOT,
  "validation-full/serial-production-audit/_extracted",
);
const EPS = 1e-7;
const FIT_EPS = 0.6;

const { solveRestrictedMasterLp } = require(
  path.join(ROOT, "src/lib/optimizer/experimental/restricted-master-lp.cjs"),
);
const { priceTwoStage } = require(
  path.join(ROOT, "src/lib/optimizer/experimental/two-stage-pricing-oracle.cjs"),
);
const { generateSerialDirectedPatterns } = require(
  path.join(ROOT, "src/lib/optimizer/experimental/serial-directed-pattern-generator.cjs"),
);
const { validarPlanIndustrial } = require(
  path.join(ROOT, "src/lib/optimizer/legacy/validador_industrial_v3.cjs"),
);

const args = parseArgs(process.argv.slice(2));
const xmlPath = findCaseXml(args.source, args.caseId);
if (!xmlPath) {
  throw new Error(`No encontré XML para ${args.caseId} bajo ${args.source}`);
}

const parser = await loadCanonicalParser();
const xml = fs.readFileSync(xmlPath, "utf8");
const parsed = parser.parseCanonicalXml(xml, {
  fileName: path.basename(xmlPath),
  defaultKerf: 4.5,
  defaultMinRemnant: 250,
  defaultMinCommercialRemnantLongSide: 400,
});
if (parsed.format !== "project") {
  throw new Error("El audit de columnas Lepton requiere XML <project>");
}

const canonical = parsed.case;
const lepton = extractLeptonColumns(xml, canonical);
if (!lepton.trim.unambiguous) {
  throw new Error(
    "Refilado Lepton ambiguo: " + JSON.stringify(lepton.trim),
  );
}
if (lepton.mappingErrors.length) {
  throw new Error(
    "No pude mapear todas las piezas Lepton al demand vector:\n" +
      lepton.mappingErrors.join("\n"),
  );
}

const lines = canonical.pieces.map((piece, index) => ({
  base: Number(piece.width),
  altura: Number(piece.height),
  cant: Number(piece.quantity),
  veta:
    piece.rotationAllowed == null
      ? Boolean(piece.grain)
      : piece.rotationAllowed === false,
  ref: index,
  detalle: piece.description || piece.reference || `LEPTON-${index}`,
  cantos: piece.edges
    ? {
        arr: Boolean(piece.edges.top),
        aba: Boolean(piece.edges.bottom),
        izq: Boolean(piece.edges.left),
        der: Boolean(piece.edges.right),
      }
    : null,
}));
const demand = lines.map((line) => line.cant);
const config = {
  placaBase: canonical.panel.width,
  placaAltura: canonical.panel.height,
  refiladoX: lepton.trim.x,
  refiladoY: lepton.trim.y,
  sierra: canonical.kerf,
  etapas: canonical.constraints.stages ?? 4,
  materialConVeta:
    Boolean(canonical.material.hasGrain) ||
    canonical.pieces.some((piece) => piece.rotationAllowed === false),
  descontarCanto: false,
  cantoEspesor: 0,
  restoMin: canonical.constraints.minRemnant ?? 250,
  restoMax:
    canonical.constraints.minCommercialRemnantLongSide ??
    Math.max(canonical.constraints.minRemnant ?? 250, 400),
  material: canonical.material.description || "LEPTON-AUDIT",
  thickness: canonical.material.thickness ?? canonical.panel.thickness ?? 18,
};

const generationStarted = nowMs();
const generated = generateSerialDirectedPatterns(lines, config, {
  targetBoards: lepton.physicalBoards,
  maxPhysicalTests: args.maxPhysicalTests,
  baselinePhysicalTests: args.baselinePhysicalTests,
  maxBatchPieces: args.maxBatchPieces,
});
const generationMs = nowMs() - generationStarted;
const initialPool = generated?.patterns || [];
if (!initialPool.length) throw new Error("El generador devolvió pool vacío");

const initialLp = solveRestrictedMasterLp(initialPool, demand);
if (initialLp.status !== "OPTIMAL") {
  throw new Error("RMP inicial no óptimo: " + initialLp.status);
}

const pricing = convergeTwoStage(initialPool, lines, config, args);
const convergedPool = pricing.pool;
const convergedLp = pricing.lp;

const initialVectors = initialPool.map((pattern) =>
  usageVector(pattern, demand.length),
);
const convergedVectors = convergedPool.map((pattern) =>
  usageVector(pattern, demand.length),
);

const classified = lepton.uniquePatterns.map((entry) => {
  const exactInitial = findExact(entry.usage, initialVectors);
  const exactConverged = findExact(entry.usage, convergedVectors);
  const dominatedInitial = findDominators(entry.usage, initialVectors);
  const dominatedConverged = findDominators(entry.usage, convergedVectors);
  const dualValue = dot(entry.usage, convergedLp.dualPrices || []);
  return {
    ...entry,
    exactInInitialPool: exactInitial.length > 0,
    exactInitialCount: exactInitial.length,
    exactInConverged2StagePool: exactConverged.length > 0,
    exactConvergedCount: exactConverged.length,
    dominatedByInitialPool:
      exactInitial.length === 0 && dominatedInitial.length > 0,
    initialDominatorCount: dominatedInitial.length,
    dominatedByConverged2StagePool:
      exactConverged.length === 0 && dominatedConverged.length > 0,
    convergedDominatorCount: dominatedConverged.length,
    dualValueAt2StageOptimum: dualValue,
    reducedCostAt2StageOptimum: 1 - dualValue,
    negativeReducedCostAt2StageOptimum: dualValue > 1 + EPS,
  };
});

const leptonColumns = classified
  .filter((entry) => !entry.exactInConverged2StagePool)
  .map((entry) => ({
    usage: entry.usage,
    _leptonColumn: true,
    physicalCutLevels: entry.physicalCutLevels,
  }));

const injectedPool = convergedPool.concat(leptonColumns);
const injectedLp = solveRestrictedMasterLp(injectedPool, demand);

const reconstructedDemand = new Array(demand.length).fill(0);
let reconstructedBoards = 0;
for (const entry of lepton.uniquePatterns) {
  reconstructedBoards += entry.multiplicity;
  for (let i = 0; i < demand.length; i++) {
    reconstructedDemand[i] += entry.usage[i] * entry.multiplicity;
  }
}
const demandMatchesLepton =
  reconstructedDemand.length === demand.length &&
  reconstructedDemand.every((value, index) => value === demand[index]);

const stageDistribution = weightedHistogram(
  classified,
  (entry) => String(entry.physicalCutLevels),
);
const missingStageDistribution = weightedHistogram(
  classified.filter((entry) => !entry.exactInConverged2StagePool),
  (entry) => String(entry.physicalCutLevels),
);
const negativeReducedCostStageDistribution = weightedHistogram(
  classified.filter((entry) => entry.negativeReducedCostAt2StageOptimum),
  (entry) => String(entry.physicalCutLevels),
);

const weighted = {
  physicalBoards: lepton.physicalBoards,
  exactInitial: weightedCount(classified, (entry) => entry.exactInInitialPool),
  exactConverged2Stage: weightedCount(
    classified,
    (entry) => entry.exactInConverged2StagePool,
  ),
  dominatedOnlyInitial: weightedCount(
    classified,
    (entry) =>
      !entry.exactInInitialPool && entry.dominatedByInitialPool,
  ),
  dominatedOnlyConverged2Stage: weightedCount(
    classified,
    (entry) =>
      !entry.exactInConverged2StagePool &&
      entry.dominatedByConverged2StagePool,
  ),
  missingConverged2Stage: weightedCount(
    classified,
    (entry) => !entry.exactInConverged2StagePool,
  ),
  negativeReducedCostAfter2Stage: weightedCount(
    classified,
    (entry) => entry.negativeReducedCostAt2StageOptimum,
  ),
};

const output = {
  schema: "optimizer-lepton-column-injection-audit-v1",
  generatedAt: new Date().toISOString(),
  caseId: args.caseId,
  sourcePath: xmlPath,
  stageConvention: {
    name: "physical-cut-levels",
    definition:
      "For Lepton project XML, physicalCutLevels = max terminal child layer - 1. Root layer 1 represents the first cutting stage; terminal layer 3 therefore means 2 physical cut levels. For optimizer physical plans, the comparable quantity is max cut.nivel.",
    currentTwoStageOracle:
      "two-stage-pricing-oracle.cjs emits physical cuts at nivel 1 and nivel 2; it is therefore 2 physical cut levels under this convention.",
  },
  geometry: {
    panel: canonical.panel,
    useful: {
      width: canonical.panel.width - lepton.trim.x,
      height: canonical.panel.height - lepton.trim.y,
    },
    trim: lepton.trim,
    kerf: canonical.kerf,
    constraintsStages: canonical.constraints.stages ?? 4,
  },
  demand: {
    types: demand.length,
    pieces: demand.reduce((sum, value) => sum + value, 0),
    vector: demand,
    reconstructedFromLepton: reconstructedDemand,
    exactMatch: demandMatchesLepton,
  },
  lepton: {
    physicalBoards: lepton.physicalBoards,
    reconstructedBoards,
    panelTags: lepton.panelTags,
    uniquePatternVectors: lepton.uniquePatterns.length,
    stageDistribution,
  },
  generator: {
    initialPatterns: initialPool.length,
    generationMs,
    telemetry: generated?.telemetry ?? null,
  },
  rmp: {
    initial: lpSummary(initialLp),
    converged2Stage: lpSummary(convergedLp),
    twoStagePricing: {
      addedColumns: pricing.addedColumns,
      rounds: pricing.rounds,
      stopReason: pricing.stopReason,
      oracleExact: pricing.oracleExact,
      totalPricingMs: pricing.totalPricingMs,
      totalLpMs: pricing.totalLpMs,
    },
    afterLeptonInjection: lpSummary(injectedLp),
    leptonInjectionSanity:
      demandMatchesLepton &&
      reconstructedBoards === lepton.physicalBoards &&
      injectedLp.status === "OPTIMAL" &&
      injectedLp.objective <= lepton.physicalBoards + EPS
        ? "PASS"
        : "FAIL",
  },
  coverage: {
    weighted,
    missingStageDistribution,
    negativeReducedCostStageDistribution,
    uniquePatterns: classified,
  },
  interpretation: {
    exact:
      "Exact vector already in pool: no generation gap for that Lepton board vector.",
    dominated:
      "Lepton vector is not exact, but some pool vector covers every type at least as much and strictly more in at least one type. This is useful under >= covering, but the current production equality master cannot consume it if it overproduces residual demand.",
    negativeReducedCost:
      "A Lepton vector with dualValue > 1 after exact 2-stage convergence is a direct witness that the current union pool + modeled 2-stage family is LP-incomplete.",
    classFGate:
      "LP after direct Lepton-vector injection checks extraction/RMP consistency. Restriction mismatch must be tested separately at the physical-layout level because the RMP itself sees only usage vectors.",
  },
};

fs.mkdirSync(path.dirname(args.output), { recursive: true });
fs.writeFileSync(args.output, JSON.stringify(output, null, 2) + "\n");

console.log(
  "LEPTON_COLUMN_AUDIT " +
    JSON.stringify({
      caseId: args.caseId,
      leptonBoards: lepton.physicalBoards,
      uniqueLeptonPatterns: lepton.uniquePatterns.length,
      initialLp: initialLp.objective,
      converged2StageLp: convergedLp.objective,
      afterLeptonInjectionLp: injectedLp.objective,
      injectionSanity: output.rmp.leptonInjectionSanity,
      exactConverged2StageBoards: weighted.exactConverged2Stage,
      dominatedOnlyConverged2StageBoards:
        weighted.dominatedOnlyConverged2Stage,
      missingConverged2StageBoards: weighted.missingConverged2Stage,
      negativeReducedCostBoards: weighted.negativeReducedCostAfter2Stage,
      missingStageDistribution,
      negativeReducedCostStageDistribution,
      output: args.output,
    }),
);

function convergeTwoStage(initialPool, lines, config, options) {
  const pool = initialPool.slice();
  const seen = new Set(pool.map((pattern) => usageVector(pattern, lines.length).join(",")));
  let lp = solveRestrictedMasterLp(pool, lines.map((line) => line.cant));
  let stopReason = "round-limit";
  let oracleExact = true;
  let totalPricingMs = 0;
  let totalLpMs = lp.elapsedMs || 0;
  let addedColumns = 0;
  const rounds = [];

  for (let round = 0; round < options.pricingRounds; round++) {
    const oracle = priceTwoStage(lines, config, lp.dualPrices, {
      maxStates: options.maxStates,
    });
    totalPricingMs += oracle.elapsedMs || 0;
    oracleExact = oracleExact && Boolean(oracle.exactForTwoStage);
    const best = oracle.best;
    if (!best) {
      stopReason = oracle.demandCapsBinding ? "demand-caps-binding" : "no-pattern";
      rounds.push({
        round,
        added: false,
        oracleExact: oracle.exactForTwoStage,
        demandCapsBinding: oracle.demandCapsBinding,
      });
      break;
    }

    const reducedCost = 1 - best.dualValue;
    const signature = best.usage.join(",");
    const record = {
      round,
      dualValue: best.dualValue,
      reducedCost,
      rootAxis: best.rootAxis,
      usage: best.usage,
      added: false,
      oracleExact: oracle.exactForTwoStage,
      demandCapsBinding: oracle.demandCapsBinding,
    };

    if (best.dualValue <= 1 + EPS) {
      stopReason = "no-negative-reduced-cost";
      rounds.push(record);
      break;
    }
    if (seen.has(signature)) {
      stopReason = "duplicate-negative-column";
      rounds.push(record);
      break;
    }

    const expectedPieces = best.usage.reduce((sum, value) => sum + value, 0);
    const validation = validarPlanIndustrial(
      {
        placas: [best.pattern.placa],
        opts: config,
        resumen: { piezas: expectedPieces },
      },
      expectedPieces,
    );
    record.patternValid = Boolean(validation?.ok);
    if (!validation?.ok) {
      stopReason = "invalid-pricing-column";
      rounds.push(record);
      break;
    }

    pool.push(best.pattern);
    seen.add(signature);
    addedColumns++;
    lp = solveRestrictedMasterLp(pool, lines.map((line) => line.cant));
    totalLpMs += lp.elapsedMs || 0;
    record.added = true;
    record.after = lp.objective;
    rounds.push(record);

    if (lp.status !== "OPTIMAL") {
      stopReason = "lp-not-optimal";
      break;
    }
  }

  return {
    pool,
    lp,
    addedColumns,
    rounds,
    stopReason,
    oracleExact,
    totalPricingMs,
    totalLpMs,
  };
}

function extractLeptonColumns(xml, canonical) {
  const root = parseXml(xml);
  const panels = root.children.filter((node) => /^panel\d+$/i.test(node.name));
  const trimByAxis = { x: new Set(), y: new Set() };
  const patterns = [];
  const mappingErrors = [];
  let physicalBoards = 0;

  for (const [panelIndex, panel] of panels.entries()) {
    const nodes = panel.children.filter((node) => /^no\.\d+$/i.test(node.name));
    const byId = new Map();
    for (const node of nodes) {
      const id = attr(node, "id", "ID");
      if (id != null) byId.set(String(id), node);
    }
    const rootNode = byId.get("0");
    if (!rootNode) {
      mappingErrors.push(`panel ${panelIndex + 1}: root id=0 missing`);
      continue;
    }

    const rootDirection =
      inferDirectRootDirection(nodes, byId) ??
      resolveRootDirection(nodes, rootNode);
    const quantity = positiveInt(attr(panel, "num", "Num"), 1);
    physicalBoards += quantity;

    for (const node of nodes) {
      const layer = positiveInt(attr(node, "layer", "Layer"), 1);
      if (layer > 2) continue;
      const trim = number(attr(node, "trim", "Trim"));
      if (!Number.isFinite(trim)) continue;
      trimByAxis[nodeDirection(rootDirection, layer)].add(trim);
    }

    const usage = new Array(canonical.pieces.length).fill(0);
    let maxTerminalLayer = 1;
    let terminalPieces = 0;

    for (const parent of nodes) {
      for (const part of (parent.children || []).filter(
        (child) => child.name.toLowerCase() === "part",
      )) {
        if (positiveInt(attr(part, "type", "Type"), 0) !== 1) continue;
        const childId = String(attr(part, "id", "ID") ?? "");
        const child = byId.get(childId);
        if (!child) {
          mappingErrors.push(
            `panel ${panelIndex + 1}: terminal child ${childId} missing`,
          );
          continue;
        }

        const dims = globalDims(child, rootDirection);
        const normalized = landscape(dims);
        const code = String(attr(part, "code", "Code") ?? "").trim();
        const typeIndex = matchCanonicalType(
          canonical.pieces,
          code,
          normalized.width,
          normalized.height,
        );
        if (typeIndex < 0) {
          mappingErrors.push(
            `panel ${panelIndex + 1}: no canonical type for code=${JSON.stringify(code)} dims=${normalized.width}x${normalized.height}`,
          );
          continue;
        }

        const partQuantity = positiveInt(attr(part, "num", "Num"), 1);
        usage[typeIndex] += partQuantity;
        terminalPieces += partQuantity;
        maxTerminalLayer = Math.max(
          maxTerminalLayer,
          positiveInt(attr(child, "layer", "Layer"), 1),
        );
      }
    }

    patterns.push({
      panelIndex: panelIndex + 1,
      multiplicity: quantity,
      usage,
      terminalPieces,
      maxXmlLayer: maxTerminalLayer,
      physicalCutLevels: Math.max(0, maxTerminalLayer - 1),
      rootDirection,
    });
  }

  const grouped = new Map();
  for (const pattern of patterns) {
    const key = pattern.usage.join(",");
    const previous = grouped.get(key);
    if (previous) {
      previous.multiplicity += pattern.multiplicity;
      previous.panelTags++;
      previous.maxXmlLayer = Math.max(previous.maxXmlLayer, pattern.maxXmlLayer);
      previous.physicalCutLevels = Math.max(
        previous.physicalCutLevels,
        pattern.physicalCutLevels,
      );
      previous.sourcePanelIndexes.push(pattern.panelIndex);
    } else {
      grouped.set(key, {
        usage: pattern.usage,
        multiplicity: pattern.multiplicity,
        panelTags: 1,
        maxXmlLayer: pattern.maxXmlLayer,
        physicalCutLevels: pattern.physicalCutLevels,
        sourcePanelIndexes: [pattern.panelIndex],
      });
    }
  }

  const valuesX = [...trimByAxis.x].sort((a, b) => a - b);
  const valuesY = [...trimByAxis.y].sort((a, b) => a - b);
  return {
    panelTags: panels.length,
    physicalBoards,
    trim: {
      x: valuesX.length === 1 ? valuesX[0] : null,
      y: valuesY.length === 1 ? valuesY[0] : null,
      valuesX,
      valuesY,
      unambiguous: valuesX.length === 1 && valuesY.length === 1,
    },
    uniquePatterns: [...grouped.values()],
    mappingErrors,
  };
}

function matchCanonicalType(pieces, code, width, height) {
  const dimensionMatches = [];
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    const dimsMatch =
      Math.abs(Number(piece.width) - width) <= FIT_EPS &&
      Math.abs(Number(piece.height) - height) <= FIT_EPS;
    if (!dimsMatch) continue;
    if (code && String(piece.reference ?? "") === code) return i;
    dimensionMatches.push(i);
  }
  return dimensionMatches.length === 1 ? dimensionMatches[0] : -1;
}

function findExact(target, vectors) {
  const out = [];
  for (let i = 0; i < vectors.length; i++) {
    if (sameVector(target, vectors[i])) out.push(i);
  }
  return out;
}

function findDominators(target, vectors) {
  const out = [];
  for (let i = 0; i < vectors.length; i++) {
    const candidate = vectors[i];
    let strict = false;
    let ok = true;
    for (let j = 0; j < target.length; j++) {
      if (candidate[j] < target[j]) {
        ok = false;
        break;
      }
      if (candidate[j] > target[j]) strict = true;
    }
    if (ok && strict) out.push(i);
  }
  return out;
}

function usageVector(pattern, typeCount) {
  if (Array.isArray(pattern?.usage)) return pattern.usage.map(Number);
  if (Array.isArray(pattern?.usageVector)) return pattern.usageVector.map(Number);
  const out = new Array(typeCount).fill(0);
  for (const [index, value] of pattern?.uso || []) {
    if (index >= 0 && index < typeCount) out[index] = Number(value) || 0;
  }
  return out;
}

function weightedCount(rows, predicate) {
  return rows.reduce(
    (sum, entry) => sum + (predicate(entry) ? entry.multiplicity : 0),
    0,
  );
}

function weightedHistogram(rows, keyFn) {
  const out = {};
  for (const row of rows) {
    const key = keyFn(row);
    out[key] = (out[key] || 0) + row.multiplicity;
  }
  return Object.fromEntries(
    Object.entries(out).sort(
      (a, b) => Number(a[0]) - Number(b[0]),
    ),
  );
}

function lpSummary(lp) {
  return {
    status: lp?.status ?? null,
    objective: Number.isFinite(lp?.objective) ? lp.objective : null,
    ceilObjective: Number.isFinite(lp?.objective)
      ? Math.ceil(lp.objective - 1e-9)
      : null,
    iterations: lp?.iterations ?? null,
    elapsedMs: lp?.elapsedMs ?? null,
    maxConstraintError: lp?.maxConstraintError ?? null,
    maxDualViolation: lp?.maxDualViolation ?? null,
  };
}

function sameVector(a, b) {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

function dot(a, b) {
  let out = 0;
  for (let i = 0; i < a.length; i++) out += a[i] * Number(b[i] || 0);
  return out;
}

function nowMs() {
  return Number(process.hrtime.bigint()) / 1e6;
}

function number(value) {
  const out = Number(value);
  return Number.isFinite(out) ? out : NaN;
}

function positiveInt(value, fallback) {
  const out = Number(value);
  return Number.isInteger(out) && out >= 0 ? out : fallback;
}

function attr(node, ...names) {
  for (const name of names) {
    if (node?.attributes?.[name] != null) return node.attributes[name];
    const lower = String(name).toLowerCase();
    for (const [key, value] of Object.entries(node?.attributes || {})) {
      if (key.toLowerCase() === lower) return value;
    }
  }
  return null;
}

function attrsFromStartTag(body) {
  const out = {};
  const nameMatch = /^([^\s/>]+)/.exec(body);
  if (!nameMatch) return { name: "", attributes: out };
  const name = nameMatch[1];
  const rest = body.slice(name.length);
  for (const match of rest.matchAll(
    /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g,
  )) {
    out[match[1]] = match[2] ?? match[3] ?? "";
  }
  return { name, attributes: out };
}

function parseXml(xml) {
  const tokenPattern =
    /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\/[^>]+>|<[^>]+>|[^<]+/g;
  const stack = [];
  let root = null;
  let token;
  while ((token = tokenPattern.exec(xml)) != null) {
    const raw = token[0];
    if (!raw.startsWith("<")) continue;
    if (raw.startsWith("<?") || raw.startsWith("<!--") || raw.startsWith("<!")) continue;
    if (raw.startsWith("</")) {
      stack.pop();
      continue;
    }
    const selfClosing = raw.endsWith("/>");
    const body = raw.slice(1, selfClosing ? -2 : -1).trim();
    const parsed = attrsFromStartTag(body);
    const node = { name: parsed.name, attributes: parsed.attributes, children: [] };
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(node);
    else root = node;
    if (!selfClosing) stack.push(node);
  }
  if (!root) throw new Error("XML sin raíz");
  return root;
}

function flip(direction) {
  return direction === "x" ? "y" : "x";
}

function nodeDirection(rootDirection, layer) {
  return layer % 2 === 1 ? rootDirection : flip(rootDirection);
}

function globalDims(node, rootDirection) {
  const l = number(attr(node, "l", "L"));
  const w = number(attr(node, "w", "W"));
  const layer = positiveInt(attr(node, "layer", "Layer"), 1);
  const direction = nodeDirection(rootDirection, layer);
  return direction === "x"
    ? { width: l, height: w }
    : { width: w, height: l };
}

function landscape(dims) {
  return dims.width >= dims.height
    ? dims
    : { width: dims.height, height: dims.width };
}

function inferDirectRootDirection(nodes, byId) {
  let inferred = null;
  for (const node of nodes) {
    const layer = positiveInt(attr(node, "layer", "Layer"), 1);
    const children = (node.children || [])
      .filter((child) => child.name.toLowerCase() === "part")
      .map((part) => byId.get(String(attr(part, "id", "ID") ?? "")))
      .filter(Boolean);
    if (children.length < 2) continue;
    const xs = new Set(children.map((child) => number(attr(child, "x", "X")) || 0));
    const ys = new Set(children.map((child) => number(attr(child, "y", "Y")) || 0));
    const observed =
      xs.size > 1 && ys.size === 1
        ? "x"
        : ys.size > 1 && xs.size === 1
          ? "y"
          : null;
    if (!observed) continue;
    const candidate = layer % 2 === 1 ? observed : flip(observed);
    if (inferred && inferred !== candidate) return inferred;
    inferred = inferred ?? candidate;
  }
  return inferred;
}

function resolveRootDirection(nodes, root) {
  const xFits = directionFits(nodes, root, "x");
  const yFits = directionFits(nodes, root, "y");
  if (xFits !== yFits) return xFits ? "x" : "y";
  return "x";
}

function directionFits(nodes, root, rootDirection) {
  const frame = globalDims(root, rootDirection);
  return nodes.every((node) => {
    const dims = globalDims(node, rootDirection);
    const x = number(attr(node, "x", "X")) || 0;
    const y = number(attr(node, "y", "Y")) || 0;
    return (
      x >= -FIT_EPS &&
      y >= -FIT_EPS &&
      x + dims.width <= frame.width + FIT_EPS &&
      y + dims.height <= frame.height + FIT_EPS
    );
  });
}

async function loadCanonicalParser() {
  const bundlePath = path.join(
    ROOT,
    "node_modules/.cache/lepton-column-audit/canonical-xml.mjs",
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

function findCaseXml(source, caseId) {
  if (!fs.existsSync(source)) return null;
  const stack = [source];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === ".extracted-ok") continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (
        entry.isFile() &&
        path.extname(entry.name).toLowerCase() === ".xml" &&
        entry.name.includes(String(caseId))
      ) {
        return full;
      }
    }
  }
  return null;
}

function parseArgs(argv) {
  const out = {
    caseId: 5445701,
    source: path.resolve(process.env.SERIAL_SOURCE_DIR || DEFAULT_SOURCE),
    output: path.join(HERE, "LEPTON_COLUMN_INJECTION_5445701.json"),
    pricingRounds: 200,
    maxStates: 500000,
    maxPhysicalTests: 176,
    baselinePhysicalTests: 96,
    maxBatchPieces: 96,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--case") out.caseId = Number(argv[++i]);
    else if (arg === "--source") out.source = path.resolve(argv[++i]);
    else if (arg === "--output") out.output = path.resolve(argv[++i]);
    else if (arg === "--pricing-rounds") out.pricingRounds = Number(argv[++i]);
    else if (arg === "--max-states") out.maxStates = Number(argv[++i]);
    else if (arg === "--max-physical-tests") out.maxPhysicalTests = Number(argv[++i]);
    else if (arg === "--baseline-physical-tests") out.baselinePhysicalTests = Number(argv[++i]);
    else if (arg === "--max-batch-pieces") out.maxBatchPieces = Number(argv[++i]);
    else throw new Error("Argumento desconocido: " + arg);
  }

  if (!Number.isSafeInteger(out.caseId)) throw new Error("--case inválido");
  return out;
}

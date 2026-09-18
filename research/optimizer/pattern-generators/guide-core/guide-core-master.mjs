import { createRequire } from "node:module";

import {
  generateIndustrialPortfolio,
  selectIndustrialMode,
} from "../guide-slice/portfolio.mjs";
import {
  deduplicatePatterns,
  solvePatternPool,
} from "../subset-generator/rescue-generator.mjs";

const require = createRequire(import.meta.url);
const { patronesMonotipo } = require("../../../../src/lib/optimizer/legacy/patrones.cjs");
const { materializar } = require("../../../../src/lib/optimizer/legacy/materializar.cjs");
const { validarPlanIndustrial } = require("../../../../src/lib/optimizer/legacy/validador_industrial_v3.cjs");

export const GUIDE_CORE_MASTER_VERSION = "guide-core-master-v1";
export const GUIDE_CORE_MODES = Object.freeze([
  "COMMON_BAND",
  "GUIDE_HUB",
  "REPEATED_STRIPS",
]);

function quantity(lines) {
  return lines.reduce((sum, line) => sum + Number(line.cant || 0), 0);
}

export function shouldRunGuideCore(lines, config) {
  const selected = selectIndustrialMode(lines, config);
  return {
    selected,
    run: GUIDE_CORE_MODES.includes(selected.mode),
  };
}

/**
 * Research-only pre-Master probe.
 *
 * It never returns an uncertified candidate. A success requires:
 * - current incumbent is exactly LB+1;
 * - Guide-Core physically reaches LB;
 * - materialization succeeds;
 * - Industrial V3 validates the complete plan.
 *
 * Any other result means "fall through to the frozen Master".
 */
export function runGuideCoreMaster(
  lines,
  config,
  {
    lowerBound,
    incumbentBoards,
    masterLimitMs = 1500,
  } = {},
) {
  if (!Array.isArray(lines) || !lines.length) {
    throw new TypeError("Guide-Core requires nonempty lines");
  }
  if (!Number.isFinite(lowerBound) || !Number.isFinite(incumbentBoards)) {
    throw new TypeError("Guide-Core requires finite lowerBound/incumbentBoards");
  }

  const gate = shouldRunGuideCore(lines, config);
  const telemetry = {
    version: GUIDE_CORE_MASTER_VERSION,
    mode: gate.selected.mode,
    gap: incumbentBoards - lowerBound,
    pieces: quantity(lines),
    types: lines.length,
    calls: 0,
    patterns: 0,
    poolSize: 0,
    nodes: 0,
    exhausted: false,
  };

  if (incumbentBoards - lowerBound !== 1) {
    return {
      status: "FALLBACK_REQUIRED",
      stage: "GAP_ROUTER",
      certified: false,
      plan: null,
      telemetry,
    };
  }

  if (!gate.run) {
    return {
      status: "FALLBACK_REQUIRED",
      stage: "MODE_ROUTER",
      certified: false,
      plan: null,
      telemetry,
    };
  }

  const generated = generateIndustrialPortfolio(lines, config);
  const guidePatterns = Array.isArray(generated.patterns) ? generated.patterns : [];
  telemetry.calls = generated.telemetry?.calls ?? 0;
  telemetry.patterns = guidePatterns.length;

  if (!guidePatterns.length) {
    return {
      status: "FALLBACK_REQUIRED",
      stage: "EMPTY_GUIDE",
      certified: false,
      plan: null,
      telemetry,
    };
  }

  const monotypes = patronesMonotipo(lines, config);
  const pool = deduplicatePatterns([...guidePatterns, ...monotypes]);
  telemetry.poolSize = pool.length;

  const solved = solvePatternPool(lines, config, pool, {
    incumbentBoards,
    masterLimitMs,
    includeMonotypes: false,
  });
  telemetry.nodes = solved?.nodos ?? 0;
  telemetry.exhausted = Boolean(solved?.agotado);

  if (!solved?.plan || solved.placas !== lowerBound) {
    return {
      status: "FALLBACK_REQUIRED",
      stage: "GUIDE_MISS",
      certified: false,
      plan: null,
      telemetry,
    };
  }

  const plan = materializar(solved.plan, lines, config);
  if (!plan) {
    return {
      status: "FALLBACK_REQUIRED",
      stage: "MATERIALIZATION_MISS",
      certified: false,
      plan: null,
      telemetry,
    };
  }

  const validation = validarPlanIndustrial(plan, quantity(lines));
  if (!validation?.ok) {
    return {
      status: "FALLBACK_REQUIRED",
      stage: "INVALID_GUIDE",
      certified: false,
      plan: null,
      validation,
      telemetry,
    };
  }

  return {
    status: "CERTIFIED",
    stage: "GUIDE_CORE",
    certified: true,
    placas: lowerBound,
    plan,
    validation,
    telemetry,
  };
}

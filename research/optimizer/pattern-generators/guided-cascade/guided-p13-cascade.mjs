import { createRequire } from "node:module";

import { generateIndustrialPortfolio } from "../guide-slice/portfolio.mjs";
import {
  deduplicatePatterns,
  generateSubsetPatterns,
  solvePatternPool,
} from "../subset-generator/rescue-generator.mjs";

const require = createRequire(import.meta.url);
const { patronesMonotipo } = require("../../../../src/lib/optimizer/legacy/patrones.cjs");
const { materializar } = require("../../../../src/lib/optimizer/legacy/materializar.cjs");
const { validarPlanIndustrial } = require("../../../../src/lib/optimizer/legacy/validador_industrial_v3.cjs");

export const GUIDED_P13_CASCADE_VERSION = "guided-p13-lb-cascade-v1";
export const P13_FROZEN_ROUNDS = Object.freeze([0, 7, 11, 12, 14, 15, 16, 17, 18, 19, 21, 26, 35]);

function pieceQuantity(lines) {
  return lines.reduce((sum, line) => sum + Number(line.cant || 0), 0);
}

function certifyPhysical(lines, config, result, lowerBound) {
  if (!result?.plan || result.placas !== lowerBound) return null;
  const plan = materializar(result.plan, lines, config);
  if (!plan) return null;
  const expectedPieces = pieceQuantity(lines);
  const validation = validarPlanIndustrial(plan, expectedPieces);
  if (!validation?.ok) return null;
  return { plan, validation };
}

/**
 * Research-only safe cascade for Pattern Master.
 *
 * Safety contract:
 * - It only returns early when a physically materialized/validated plan equals
 *   a valid lower bound, so board count is certified optimal.
 * - Any unresolved case returns FALLBACK_REQUIRED. The current production
 *   generator must remain the fallback and therefore preserves quality.
 * - Gap != 1 is routed directly to fallback: no speculative overhead is added
 *   to multi-board-gap cases such as the historical 4058501 / 4059200 class.
 */
export function runGuidedP13Cascade(
  lines,
  config,
  {
    lowerBound,
    incumbentBoards,
    guideMasterLimitMs = 1_500,
    p13MasterLimitMs = 1_500,
    p13MaxPieces = 160,
    allowGuide = true,
    allowP13 = true,
  } = {},
) {
  if (!Array.isArray(lines) || !lines.length) throw new TypeError("guided cascade requires nonempty lines");
  if (!Number.isFinite(lowerBound) || !Number.isFinite(incumbentBoards)) {
    throw new TypeError("guided cascade requires finite lowerBound and incumbentBoards");
  }

  const gap = incumbentBoards - lowerBound;
  const telemetry = {
    version: GUIDED_P13_CASCADE_VERSION,
    lowerBound,
    incumbentBoards,
    gap,
    pieceQty: pieceQuantity(lines),
    logicalTypes: lines.length,
    guide: null,
    p13: null,
    monotypes: 0,
  };

  if (gap !== 1) {
    return {
      status: "FALLBACK_REQUIRED",
      stage: "GAP_ROUTER",
      certified: false,
      placas: incumbentBoards,
      plan: null,
      telemetry,
    };
  }

  // Monotypes are invariant for both guide and P13 pools. Compute them once and
  // reuse them across both solves instead of regenerating them per stage.
  const monotypes = patronesMonotipo(lines, config);
  telemetry.monotypes = monotypes.length;

  let guidePatterns = [];
  if (allowGuide) {
    const guideStarted = process.cpuUsage();
    const guide = generateIndustrialPortfolio(lines, config);
    const guideCpu = process.cpuUsage(guideStarted);
    guidePatterns = Array.isArray(guide.patterns) ? guide.patterns : [];
    const guidePool = deduplicatePatterns([...guidePatterns, ...monotypes]);
    const guideSolve = guidePool.length
      ? solvePatternPool(lines, config, guidePool, {
          incumbentBoards,
          masterLimitMs: guideMasterLimitMs,
          includeMonotypes: false,
        })
      : null;
    const guideCertified = certifyPhysical(lines, config, guideSolve, lowerBound);

    telemetry.guide = {
      mode: guide.telemetry?.mode ?? guide.status ?? "UNKNOWN",
      calls: guide.telemetry?.calls ?? 0,
      patterns: guidePatterns.length,
      poolSize: guidePool.length,
      cpuMs: (guideCpu.user + guideCpu.system) / 1000,
      boards: guideSolve?.placas ?? incumbentBoards,
      nodes: guideSolve?.nodos ?? 0,
      exhausted: guideSolve?.agotado ?? false,
    };

    if (guideCertified) {
      return {
        status: "CERTIFIED",
        stage: "GUIDE",
        certified: true,
        placas: lowerBound,
        plan: guideCertified.plan,
        validation: guideCertified.validation,
        telemetry,
      };
    }
  } else {
    telemetry.guide = { skipped: true };
  }

  if (!allowP13 || telemetry.pieceQty > p13MaxPieces) {
    return {
      status: "FALLBACK_REQUIRED",
      stage: "P13_ROUTER",
      certified: false,
      placas: incumbentBoards,
      plan: null,
      telemetry,
    };
  }

  const p13 = generateSubsetPatterns(lines, config, {
    maskRounds: [...P13_FROZEN_ROUNDS],
    passes: 2,
    restartsPerBoard: 14,
    rescue: true,
    beam: false,
  });
  const combinedPool = deduplicatePatterns([
    ...guidePatterns,
    ...p13.patterns,
    ...monotypes,
  ]);
  const p13Solve = solvePatternPool(lines, config, combinedPool, {
    incumbentBoards,
    masterLimitMs: p13MasterLimitMs,
    includeMonotypes: false,
  });
  const p13Certified = certifyPhysical(lines, config, p13Solve, lowerBound);

  telemetry.p13 = {
    rounds: [...P13_FROZEN_ROUNDS],
    generationCpuMs: p13.generationCpuMs,
    patterns: p13.patterns.length,
    combinedPoolSize: combinedPool.length,
    boards: p13Solve?.placas ?? incumbentBoards,
    nodes: p13Solve?.nodos ?? 0,
    exhausted: p13Solve?.agotado ?? false,
  };

  if (p13Certified) {
    return {
      status: "CERTIFIED",
      stage: "P13",
      certified: true,
      placas: lowerBound,
      plan: p13Certified.plan,
      validation: p13Certified.validation,
      telemetry,
    };
  }

  return {
    status: "FALLBACK_REQUIRED",
    stage: "LEGACY_FALLBACK",
    certified: false,
    placas: incumbentBoards,
    plan: null,
    telemetry,
  };
}

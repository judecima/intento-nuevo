import { createHash } from "node:crypto";

import type { OptimizeProjectDiagnostics } from "../../src/lib/optimizer/engine/legacy-engine";
import type { OptimizationResult } from "../../src/lib/optimizer/types";

export function createRustCertificationDiagnostics(): OptimizeProjectDiagnostics {
  return {
    cacheBypassed: false,
    rustRequested: false,
    rustExecuted: false,
    rustSucceeded: false,
    rustFallbackJs: false,
    rustMasterSwallowedError: false,
  };
}

export function normalizeOptimizationResult(result: OptimizationResult) {
  const {
    engineMs: _engineMs,
    cacheHit: _cacheHit,
    ...deterministicMetrics
  } = result.metrics;

  return {
    algorithmVersion: result.algorithmVersion,
    inputHash: result.inputHash ?? null,
    strategy: result.strategy,
    profile: result.profile ?? null,
    projectId: result.projectId ?? null,
    projectVersion: result.projectVersion ?? null,
    boards: result.boards,
    placements: result.placements,
    cuts: result.cuts,
    remnants: result.remnants,
    metrics: deterministicMetrics,
    validation: result.validation,
  };
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

export function optimizationResultDigest(result: OptimizationResult): string {
  return createHash("sha256")
    .update(stableStringify(normalizeOptimizationResult(result)))
    .digest("hex");
}

export function fullOptimizeContractSummary(
  result: OptimizationResult,
  diagnostics: OptimizeProjectDiagnostics,
) {
  return {
    cacheHit: result.metrics.cacheHit === true,
    cacheBypassed: diagnostics.cacheBypassed === true,
    rustRequested: diagnostics.rustRequested === true,
    rustExecuted: diagnostics.rustExecuted === true,
    rustSucceeded: diagnostics.rustSucceeded === true,
    rustFallback: diagnostics.rustFallbackJs === true,
    rustMasterSwallowedError: diagnostics.rustMasterSwallowedError === true,
    rustError: diagnostics.rustError ?? null,
    rustMasterError: diagnostics.rustMasterError ?? null,
    rustGeneratorCaughtError: diagnostics.rustGeneratorCaughtError ?? null,
    patternGeneratorUsed: result.metrics.patternGenerator ?? null,
    algorithmVersion: result.algorithmVersion,
    plates: result.metrics.boardCount,
    valid: result.validation.ok,
    remnant: {
      commercialAreaM2: result.metrics.commercialRemnantAreaM2,
      largestM2: result.metrics.largestCommercialRemnantM2,
      secondLargestM2: result.metrics.secondLargestCommercialRemnantM2,
      count: result.metrics.commercialRemnantCount,
    },
    resultDigest: optimizationResultDigest(result),
    result: normalizeOptimizationResult(result),
  };
}

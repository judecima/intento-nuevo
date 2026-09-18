import { performance } from "node:perf_hooks";

import {
  optimizeProject,
  type OptimizeProjectDiagnostics,
} from "../../src/lib/optimizer/engine/legacy-engine";
import type { OptimizationInput } from "../../src/lib/optimizer/types";
import {
  createRustCertificationDiagnostics,
  fullOptimizeContractSummary,
} from "./full-optimize-contract";

let invocationCount = 0;

function parseEvent(rawEvent: unknown): Record<string, unknown> {
  if (rawEvent == null) return {};
  if (typeof rawEvent === "string") return JSON.parse(rawEvent) as Record<string, unknown>;
  if (typeof rawEvent !== "object" || Array.isArray(rawEvent)) {
    throw new Error("INVALID_EVENT");
  }

  const record = rawEvent as Record<string, unknown>;
  if (typeof record.body === "string") {
    return JSON.parse(record.body) as Record<string, unknown>;
  }
  if (record.body && typeof record.body === "object" && !Array.isArray(record.body)) {
    return record.body as Record<string, unknown>;
  }
  return record;
}

function mb(bytes: number) {
  return Number((bytes / 1024 / 1024).toFixed(2));
}

export async function handler(
  rawEvent: unknown,
  runtimeContext: { moduleInitMs?: number } = {},
) {
  const coldStart = invocationCount++ === 0;
  const event = parseEvent(rawEvent);

  if (event.operation === "health") {
    return {
      ok: true,
      operation: "full-optimize-health",
      architecture: process.arch,
      platform: process.platform,
      node: process.version,
      coldStart,
      moduleInitMs: Number((runtimeContext.moduleInitMs ?? 0).toFixed(3)),
    };
  }

  const input = (event.input ?? event) as OptimizationInput;
  const diagnostics: OptimizeProjectDiagnostics = createRustCertificationDiagnostics();
  const rssBefore = process.memoryUsage().rss;
  const maxRssBeforeKb = process.resourceUsage().maxRSS;
  const cpuStartedAt = process.cpuUsage();
  const startedAt = performance.now();

  const result = optimizeProject(input, {
    patternGenerator: "rust",
    bypassCache: true,
    rustCertification: true,
    diagnostics,
  });

  const domainWallMs = performance.now() - startedAt;
  const cpu = process.cpuUsage(cpuStartedAt);
  const domainCpuMs = (cpu.user + cpu.system) / 1000;
  const rssAfter = process.memoryUsage().rss;
  const maxRssAfterKb = process.resourceUsage().maxRSS;

  if (result.metrics.cacheHit === true || diagnostics.cacheBypassed !== true) {
    throw new Error("FULL_OPTIMIZE_BENCHMARK_CACHE_INVARIANT_FAILED");
  }
  if (!result.validation.ok) {
    throw new Error("FULL_OPTIMIZE_RESULT_INVALID");
  }

  return {
    ok: true,
    operation: "full-optimize",
    requestId: event.requestId ?? input.projectId ?? null,
    architecture: process.arch,
    platform: process.platform,
    node: process.version,
    memorySizeMb: Number(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE || 0) || null,
    coldStart,
    moduleInitMs: Number((runtimeContext.moduleInitMs ?? 0).toFixed(3)),
    domainWallMs: Number(domainWallMs.toFixed(3)),
    domainCpuMs: Number(domainCpuMs.toFixed(3)),
    fullWallMs: Number(domainWallMs.toFixed(3)),
    fullCpuMs: Number(domainCpuMs.toFixed(3)),
    rssBeforeMb: mb(rssBefore),
    rssAfterMb: mb(rssAfter),
    maxRssBeforeMb: Number((maxRssBeforeKb / 1024).toFixed(2)),
    maxRssMb: Number((maxRssAfterKb / 1024).toFixed(2)),
    ...fullOptimizeContractSummary(result, diagnostics),
  };
}

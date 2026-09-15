import { describe, expect, it } from "vitest";
import { summarizeOptimizationTimings, type OptimizationTimingSample } from "../src/lib/optimizations/telemetry";

describe("summarizeOptimizationTimings", () => {
  it("summarizes queue, run, total and engine percentiles", () => {
    const samples: OptimizationTimingSample[] = Array.from({ length: 100 }, (_, index) => ({
      jobId: String(index + 1),
      status: "completed",
      queuedMs: index + 1,
      runMs: (index + 1) * 2,
      totalMs: (index + 1) * 3,
      engineMs: (index + 1) * 4,
      cacheHit: false
    }));

    const summary = summarizeOptimizationTimings(samples);

    expect(summary.sampleCount).toBe(100);
    expect(summary.completed).toBe(100);
    expect(summary.queuedMs).toEqual({ p50: 50, p95: 95, p99: 99 });
    expect(summary.runMs).toEqual({ p50: 100, p95: 190, p99: 198 });
    expect(summary.totalMs).toEqual({ p50: 150, p95: 285, p99: 297 });
    expect(summary.engineMs).toEqual({ p50: 200, p95: 380, p99: 396 });
  });

  it("keeps active and failed jobs without inventing durations", () => {
    const samples: OptimizationTimingSample[] = [
      { jobId: "q", status: "queued", queuedMs: null, runMs: null, totalMs: null, engineMs: null, cacheHit: null },
      { jobId: "r", status: "running", queuedMs: 20, runMs: null, totalMs: null, engineMs: null, cacheHit: null },
      { jobId: "f", status: "failed", queuedMs: 10, runMs: 40, totalMs: 50, engineMs: null, cacheHit: null }
    ];

    const summary = summarizeOptimizationTimings(samples);

    expect(summary.active).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.totalMs).toEqual({ p50: 50, p95: 50, p99: 50 });
  });
});

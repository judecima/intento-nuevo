import { describe, expect, it } from "vitest";

import { canRunOptimization, runOptimizationSchema } from "@/lib/domain/optimizations";

describe("optimization domain", () => {
  it("allows customers and admins to optimize editable projects", () => {
    expect(canRunOptimization("customer", "draft")).toBe(true);
    expect(canRunOptimization("admin", "optimized")).toBe(true);
  });

  it("blocks sellers and operators from running customer optimizations", () => {
    expect(canRunOptimization("seller", "draft")).toBe(false);
    expect(canRunOptimization("operator", "optimized")).toBe(false);
  });

  it("blocks optimization for submitted or production projects", () => {
    expect(canRunOptimization("customer", "submitted")).toBe(false);
    expect(canRunOptimization("admin", "in_production")).toBe(false);
  });

  it("parses run optimization commands with baseline as default strategy", () => {
    const parsed = runOptimizationSchema.parse({
      projectId: "10000000-0000-4000-8000-000000000001",
      expectedVersion: "3"
    });

    expect(parsed).toEqual({
      projectId: "10000000-0000-4000-8000-000000000001",
      expectedVersion: 3,
      strategy: "baseline"
    });
  });
});

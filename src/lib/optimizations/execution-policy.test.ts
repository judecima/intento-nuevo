import { describe, expect, it } from "vitest";
import {
  INLINE_MAX_LOGICAL_TYPES,
  INLINE_MAX_PHYSICAL_PIECES,
  optimizationExecutionPolicy
} from "./execution-policy";

describe("optimizationExecutionPolicy", () => {
  it("keeps the frozen synchronous cohort inline", () => {
    const policy = optimizationExecutionPolicy([
      { quantity: INLINE_MAX_PHYSICAL_PIECES, width: 500, height: 300, can_rotate: true }
    ]);

    expect(policy).toMatchObject({ mode: "inline", physicalPieces: 50, logicalTypes: 1 });
  });

  it("queues orders above the physical-piece boundary", () => {
    const policy = optimizationExecutionPolicy([
      { quantity: INLINE_MAX_PHYSICAL_PIECES + 1, width: 500, height: 300, can_rotate: true }
    ]);

    expect(policy.mode).toBe("queued-worker");
  });

  it("queues orders above the logical-type boundary", () => {
    const items = Array.from({ length: INLINE_MAX_LOGICAL_TYPES + 1 }, (_, index) => ({
      quantity: 1,
      width: 400 + index,
      height: 300,
      can_rotate: false
    }));

    const policy = optimizationExecutionPolicy(items);
    expect(policy).toMatchObject({ mode: "queued-worker", logicalTypes: 21 });
  });

  it("normalizes rotated dimensions only when rotation is actually free", () => {
    const free = optimizationExecutionPolicy([
      { quantity: 1, width: 400, height: 300, can_rotate: true, grain: false },
      { quantity: 1, width: 300, height: 400, can_rotate: true, grain: false }
    ]);
    const grained = optimizationExecutionPolicy([
      { quantity: 1, width: 400, height: 300, can_rotate: false, grain: true },
      { quantity: 1, width: 300, height: 400, can_rotate: false, grain: true }
    ]);

    expect(free.logicalTypes).toBe(1);
    expect(grained.logicalTypes).toBe(2);
  });

  it("keeps edge-band variants as separate routing types", () => {
    const policy = optimizationExecutionPolicy([
      { quantity: 1, width: 400, height: 300, can_rotate: false, edge_top: false, edge_type: "none" },
      { quantity: 1, width: 400, height: 300, can_rotate: false, edge_top: true, edge_type: "thin" }
    ]);

    expect(policy.logicalTypes).toBe(2);
  });
});

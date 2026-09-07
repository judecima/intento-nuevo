import { describe, expect, it } from "vitest";
import { countSelectedEdges, cycleEdgeCount, setEdgeBandType } from "@/lib/domain/edge-bands";

const empty = {
  edgeType: "none" as const,
  edgeTop: false,
  edgeBottom: false,
  edgeLeft: false,
  edgeRight: false
};

describe("edge band selection", () => {
  it("cycles a band from zero to one, two and back to zero sides", () => {
    const one = cycleEdgeCount(empty);
    const two = cycleEdgeCount(one);
    const zero = cycleEdgeCount(two);

    expect(one.edgeType).toBe("thin");
    expect(countSelectedEdges(one)).toBe(1);
    expect(countSelectedEdges(two)).toBe(2);
    expect(zero.edgeType).toBe("none");
    expect(countSelectedEdges(zero)).toBe(0);
  });

  it("keeps manually selected sides when increasing the count", () => {
    const one = { ...empty, edgeType: "thick" as const, edgeLeft: true };
    const two = cycleEdgeCount(one);

    expect(two.edgeLeft).toBe(true);
    expect(countSelectedEdges(two)).toBe(2);
  });

  it("allows selecting one type, both types or no type", () => {
    const thin = setEdgeBandType(empty, "thin");
    const thick = setEdgeBandType(thin, "thick");
    const both = setEdgeBandType(thick, "both");
    const none = setEdgeBandType({ ...both, edgeTop: true, edgeLeft: true }, "none");

    expect(thin.edgeType).toBe("thin");
    expect(thick.edgeType).toBe("thick");
    expect(both.edgeType).toBe("both");
    expect(none.edgeType).toBe("none");
    expect(countSelectedEdges(none)).toBe(0);
  });
});

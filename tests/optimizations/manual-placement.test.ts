import { describe, expect, it } from "vitest";
import type { CutPlanBoard, CutPlanPiece } from "@/lib/optimizations/plan-view";
import { validateManualPiecePlacement } from "@/lib/optimizations/manual-placement";

function piece(id: string, x: number, y: number, width: number, height: number): CutPlanPiece {
  return {
    id,
    index: Number(id),
    reference: id,
    description: id,
    x,
    y,
    width,
    height,
    rotated: false,
    level: 1,
    sourceWidth: width,
    sourceHeight: height,
    edges: { top: false, bottom: false, left: false, right: false },
    edgeType: "none",
    trace: []
  };
}

const board: CutPlanBoard = {
  index: 0,
  width: 1000,
  height: 600,
  usedArea: 200000,
  utilization: 33.33,
  pieces: [piece("1", 0, 0, 400, 200), piece("2", 450, 0, 300, 200)],
  cuts: [],
  remnants: []
};

describe("manual piece placement", () => {
  it("accepts a piece in an empty gap when it stays inside the useful board", () => {
    expect(
      validateManualPiecePlacement({
        board,
        pieceId: "1",
        position: { x: 0, y: 250 }
      })
    ).toEqual({ valid: true });
  });

  it("rejects a position that overlaps another piece", () => {
    expect(
      validateManualPiecePlacement({
        board,
        pieceId: "1",
        position: { x: 300, y: 0 }
      })
    ).toEqual({ valid: false, reason: "overlap" });
  });

  it("rejects a position outside the board or trim boundary", () => {
    expect(
      validateManualPiecePlacement({
        board,
        pieceId: "1",
        position: { x: 700, y: 0 },
        trimX: 10
      })
    ).toEqual({ valid: false, reason: "outside-board" });
  });
});

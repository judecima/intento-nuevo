import { describe, expect, it } from "vitest";
import { findNeighbors, isPieceReleased, releasedLevel } from "@/components/optimizer/diagnostics";
import {
  buildCutPlanView,
  cutPlanViewFromResult,
  edgeLabel,
  type BuildCutPlanViewInput
} from "@/lib/optimizations/plan-view";
import { optimizeProject } from "@/lib/optimizer";

function pieceRow(overrides: Partial<BuildCutPlanViewInput["pieces"][number]> = {}) {
  return {
    id: "piece-1",
    board_index: 0,
    piece_id: "1",
    reference: "P1",
    description: "Estante",
    x: 0,
    y: 0,
    width: 600,
    height: 400,
    rotated: false,
    level: 1,
    raw_json: {
      sourceWidth: 600,
      sourceHeight: 400,
      edges: { top: true, bottom: false, left: true, right: false },
      trace: []
    },
    ...overrides
  };
}

function baseInput(): BuildCutPlanViewInput {
  return {
    job: { strategy: "v10", algorithm_version: "legacy-v10" },
    result: {
      id: "result-1",
      project_version: 3,
      board_count: 1,
      piece_count: 2,
      utilization_percentage: 62.5,
      waste_percentage: 37.5,
      commercial_remnant_area: 0.5,
      cut_count: 2,
      saw_meters: 4.2,
      created_at: "2026-08-13T10:00:00.000Z",
      result_json: {
        raw: {
          opts: { placaBase: 2750, placaAltura: 1830, refiladoX: 10, refiladoY: 12, sierra: 4.5, restoMin: 250, restoMax: 400 },
          resumen: { origen: "v10-multislice" }
        },
        profile: "balanced",
        validation: { ok: true }
      }
    },
    boards: [{ id: "board-1", board_index: 0, width: 2750, height: 1830 }],
    pieces: [
      pieceRow(),
      pieceRow({ id: "piece-2", piece_id: "2", reference: "P2", x: 610, y: 0, level: 2 })
    ],
    cuts: [
      {
        id: "cut-1",
        board_index: 0,
        x1: 0,
        y1: 404,
        x2: 2740,
        y2: 404,
        level: 1,
        length: 2740,
        terminal: false
      },
      {
        id: "cut-2",
        board_index: 0,
        x1: 604,
        y1: 0,
        x2: 604,
        y2: 404,
        level: 2,
        length: 404,
        terminal: true
      }
    ],
    remnants: [
      {
        id: "remnant-1",
        board_index: 0,
        x: 1220,
        y: 0,
        width: 500,
        height: 1800,
        area: 900000,
        commercial: true
      },
      {
        id: "remnant-2",
        board_index: 0,
        x: 0,
        y: 1700,
        width: 90,
        height: 100,
        area: 9000,
        commercial: false
      }
    ],
    project: {
      version: 3,
      board_width: 2750,
      board_height: 1830,
      board_thickness: 18,
      kerf: 3.2,
      trim_x: 0,
      trim_y: 0,
      min_remnant: 200,
      grain_enabled: false
    },
    material: { code: "MDF18", description: "MDF 18MM GRIS TAPIR" }
  };
}

describe("buildCutPlanView", () => {
  it("prefers the options the optimizer actually used over the current project row", () => {
    const plan = buildCutPlanView(baseInput());

    expect(plan.meta.trimX).toBe(10);
    expect(plan.meta.trimY).toBe(12);
    expect(plan.meta.kerf).toBe(4.5);
    expect(plan.meta.remnantMinShortSide).toBe(250);
    expect(plan.meta.remnantMinLongSide).toBe(400);
    expect(plan.meta.profile).toBe("balanced");
    expect(plan.meta.modeLabel).toBe("V10 balanceado / Lepton");
    expect(plan.meta.origin).toBe("v10-multislice");
  });

  it("falls back to project parameters when the stored plan has no legacy options", () => {
    const input = baseInput();
    input.result.result_json = {};
    const plan = buildCutPlanView(input);

    expect(plan.meta.kerf).toBe(3.2);
    expect(plan.meta.trimX).toBe(0);
    expect(plan.meta.remnantMinShortSide).toBe(200);
  });

  it("groups identical pieces and lists the boards they fall on", () => {
    const plan = buildCutPlanView(baseInput());

    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0]).toMatchObject({ description: "Estante", quantity: 2, width: 600, height: 400, boards: [1] });
    expect(edgeLabel(plan.groups[0].edges)).toBe("A I");
  });

  it("counts only commercial remnants as recoverable stock", () => {
    const plan = buildCutPlanView(baseInput());

    expect(plan.stock).toHaveLength(1);
    expect(plan.stock[0].id).toBe("remnant-1");
    expect(plan.metrics.remnantAreaM2).toBeCloseTo(0.9, 6);
    expect(plan.metrics.largestRemnantM2).toBeCloseTo(0.9, 6);
    expect(plan.metrics.secondLargestRemnantM2).toBe(0);
    expect(plan.metrics.remnantFragments).toBe(1);
  });

  it("uses stored Lepton remnant quality metrics when available", () => {
    const input = baseInput();
    input.result.result_json = {
      raw: {
        opts: { placaBase: 2750, placaAltura: 1830, refiladoX: 10, refiladoY: 12, sierra: 4.5, restoMin: 250, restoMax: 400 },
        resumen: { mayorSobranteM2: 1.2, segundoSobranteM2: 0.8, fragmentosComerciales: 2 }
      }
    };

    const plan = buildCutPlanView(input);

    expect(plan.metrics.largestRemnantM2).toBe(1.2);
    expect(plan.metrics.secondLargestRemnantM2).toBe(0.8);
    expect(plan.metrics.remnantFragments).toBe(2);
  });

  it("derives edge band meters from the original piece sides", () => {
    const plan = buildCutPlanView(baseInput());

    // 2 piezas x (canto superior 600 mm + canto izquierdo 400 mm)
    expect(plan.metrics.edgeSides).toBe(4);
    expect(plan.metrics.edgeMeters).toBeCloseTo(2, 6);
  });

  it("splits edge-band meters by material type and sums both types", () => {
    const input = baseInput();
    input.pieces[0].raw_json = {
      sourceWidth: 600,
      sourceHeight: 400,
      edges: { top: true, bottom: false, left: true, right: false },
      edgeType: "both",
      trace: []
    };

    const plan = buildCutPlanView(input);

    // La primera pieza usa ambos tipos (1 m por tipo) y la segunda usa el
    // fallback historico fino (1 m): total fino 2 m, grueso 1 m.
    expect(plan.metrics.edgeBand045Meters).toBeCloseTo(2, 6);
    expect(plan.metrics.edgeBand2mmMeters).toBeCloseTo(1, 6);
    expect(plan.metrics.edgeMeters).toBeCloseTo(3, 6);
  });

  it("marks the plan as stale when it belongs to an older project version", () => {
    const input = baseInput();
    input.project.version = 4;

    expect(buildCutPlanView(input).meta.stale).toBe(true);
    expect(buildCutPlanView(baseInput()).meta.stale).toBe(false);
  });

  it("keeps board utilization and areas consistent with the placed pieces", () => {
    const plan = buildCutPlanView(baseInput());
    const board = plan.boards[0];

    expect(board.pieces).toHaveLength(2);
    expect(board.usedArea).toBe(480000);
    expect(board.utilization).toBeCloseTo((480000 / (2750 * 1830)) * 100, 6);
    expect(plan.metrics.offcutAreaM2).toBeCloseTo(plan.metrics.totalAreaM2 - plan.metrics.cutAreaM2, 6);
  });
});

describe("cutPlanViewFromResult", () => {
  const project = {
    version: 2,
    board_width: 1200,
    board_height: 800,
    board_thickness: 18,
    kerf: 5,
    trim_x: 10,
    trim_y: 10,
    min_remnant: 100,
    grain_enabled: false
  };

  const result = optimizeProject({
    board: { width: project.board_width, height: project.board_height, thickness: 18 },
    material: { description: "MDF TEST 18MM", hasGrain: false, thickness: 18 },
    kerf: project.kerf,
    trim: { x: project.trim_x, y: project.trim_y },
    constraints: { minRemnant: project.min_remnant, minCommercialRemnantLongSide: 250 },
    pieces: [
      { reference: "A", description: "Lateral", quantity: 2, width: 500, height: 300, edges: { top: true, left: true } },
      { reference: "B", description: "Estante", quantity: 3, width: 400, height: 200 }
    ]
  });

  it("builds a drawable plan for a draft that was never persisted", () => {
    const plan = cutPlanViewFromResult(result, { strategy: "baseline", project, material: null });

    expect(plan.meta.resultId).toBe("draft");
    expect(plan.meta.stale).toBe(false);
    expect(plan.boards.length).toBeGreaterThan(0);
    expect(plan.metrics.pieces).toBe(5);
    expect(plan.boards[0].cuts.length).toBeGreaterThan(0);
  });

  it("carries the parameters used for the draft, not the saved project row", () => {
    const plan = cutPlanViewFromResult(result, {
      strategy: "v10",
      project: { ...project, kerf: 999 },
      material: null
    });

    // El kerf viene de las opciones con las que corrio el motor.
    expect(plan.meta.kerf).toBe(project.kerf);
    expect(plan.meta.trimX).toBe(project.trim_x);
    expect(plan.meta.strategy).toBe("v10");
  });

  it("keeps edge banding of the draft pieces", () => {
    const plan = cutPlanViewFromResult(result, { strategy: "baseline", project, material: null });
    const lateral = plan.groups.find((group) => group.description === "Lateral");

    expect(lateral?.quantity).toBe(2);
    expect(edgeLabel(lateral!.edges)).toBe("A I");
    expect(plan.metrics.edgeSides).toBe(4);
  });
});

describe("cut sequence diagnostics", () => {
  it("releases pieces as the saw reaches their level", () => {
    const plan = buildCutPlanView(baseInput());
    const board = plan.boards[0];

    expect(releasedLevel(board.cuts, 0)).toBe(-1);
    expect(releasedLevel(board.cuts, 1)).toBe(1);
    expect(releasedLevel(board.cuts, board.cuts.length)).toBe(Number.POSITIVE_INFINITY);

    expect(isPieceReleased(board.pieces[0], board.cuts, 0)).toBe(false);
    expect(isPieceReleased(board.pieces[0], board.cuts, 1)).toBe(true);
    expect(isPieceReleased(board.pieces[1], board.cuts, 1)).toBe(false);
    expect(isPieceReleased(board.pieces[1], board.cuts, 2)).toBe(true);
  });

  it("finds the nearest overlapping neighbour and its gap", () => {
    const plan = buildCutPlanView(baseInput());
    const board = plan.boards[0];
    const neighbors = findNeighbors(board, board.pieces[0]);

    expect(neighbors.right?.gap).toBe(10);
    expect(neighbors.left).toBeNull();
    expect(neighbors.above).toBeNull();
    expect(neighbors.below).toBeNull();
  });
});

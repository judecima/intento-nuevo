import { describe, expect, it } from "vitest";

import {
  buildOptimizationInputFromDraft,
  buildOptimizationInputFromProject,
  optimizerProfileForStrategy
} from "@/lib/optimizations/project-input";
import type { ProjectDraft } from "@/lib/domain/projects";
import type { OptimizationInput } from "@/lib/optimizer";
import type { Database } from "@/lib/supabase/database.types";

type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
type ProjectItemRow = Database["public"]["Tables"]["project_items"]["Row"];

describe("project optimization input mapper", () => {
  it("builds a typed optimizer input from persisted project data", () => {
    const project: ProjectRow = {
      id: "10000000-0000-4000-8000-000000000001",
      organization_id: "20000000-0000-4000-8000-000000000001",
      owner_id: "30000000-0000-4000-8000-000000000001",
      name: "Placard",
      description: null,
      status: "draft",
      material_id: "40000000-0000-4000-8000-000000000001",
      board_width: 2750,
      board_height: 1830,
      board_thickness: 18,
      kerf: 4.5,
      trim_x: 10,
      trim_y: 10,
      min_remnant: 250,
      min_cut_size: 50,
      grain_enabled: true,
      created_at: "2026-08-13T00:00:00.000Z",
      updated_at: "2026-08-13T00:00:00.000Z",
      version: 4
    };

    const items: ProjectItemRow[] = [
      {
        id: "50000000-0000-4000-8000-000000000001",
        project_id: project.id,
        reference: "LAT",
        description: "Lateral",
        quantity: 2,
        width: 578,
        height: 1800,
        grain: true,
        can_rotate: false,
        edge_top: true,
        edge_bottom: false,
        edge_left: true,
        edge_right: true,
        edge_type: "thin",
        metadata: {},
        sort_order: 10,
        created_at: "2026-08-13T00:00:00.000Z",
        updated_at: "2026-08-13T00:00:00.000Z"
      }
    ];

    const input = buildOptimizationInputFromProject({
      project,
      material: {
        id: project.material_id,
        code: "106",
        description: "MDF ROBLE 18MM",
        thickness: 18,
        has_grain: true
      },
      items,
      strategy: "v10"
    });

    expect(input.projectVersion).toBe(4);
    expect(input.strategy).toBe("v10");
    expect(input.board).toEqual({ width: 2750, height: 1830, thickness: 18 });
    expect(input.material).toMatchObject({
      code: "106",
      description: "MDF ROBLE 18MM",
      hasGrain: true
    });
    expect(input.pieces).toHaveLength(1);
    expect(input.pieces[0]).toMatchObject({
      reference: "LAT",
      quantity: 2,
      width: 578,
      height: 1800,
      grain: true,
      canRotate: false,
      edgeType: "thin"
    });
  });

  it("keeps preview and saved reoptimization inputs aligned for the same draft", () => {
    const project: ProjectRow = {
      id: "10000000-0000-4000-8000-000000000002",
      organization_id: "20000000-0000-4000-8000-000000000001",
      owner_id: "30000000-0000-4000-8000-000000000001",
      name: "Cocina",
      description: null,
      status: "draft",
      material_id: "40000000-0000-4000-8000-000000000002",
      board_width: 2740,
      board_height: 1820,
      board_thickness: 15,
      kerf: 5,
      trim_x: 10,
      trim_y: 10,
      min_remnant: 250,
      min_cut_size: 50,
      grain_enabled: true,
      created_at: "2026-08-13T00:00:00.000Z",
      updated_at: "2026-08-13T00:00:00.000Z",
      version: 7
    };
    const material = {
      id: project.material_id,
      code: "93",
      description: "AGL 15MM ABEDUL",
      width: 2740,
      height: 1820,
      thickness: 15,
      has_grain: true
    };
    const draft: ProjectDraft = {
      projectId: project.id,
      expectedVersion: 7,
      materialId: material.id,
      name: "Cocina",
      description: "",
      kerf: 5,
      trimX: 10,
      trimY: 10,
      minRemnant: 250,
      minCutSize: 50,
      strategy: "v10",
      items: [
        {
          id: "50000000-0000-4000-8000-000000000001",
          reference: "P1",
          description: "ver",
          quantity: 7,
          width: 1300,
          height: 900,
          grain: false,
          canRotate: true,
          edgeTop: false,
          edgeBottom: false,
          edgeLeft: false,
          edgeRight: false,
          edgeType: "none"
        },
        {
          reference: "P2",
          description: "ver2",
          quantity: 12,
          width: 600,
          height: 1400,
          grain: false,
          canRotate: true,
          edgeTop: false,
          edgeBottom: false,
          edgeLeft: false,
          edgeRight: false,
          edgeType: "none"
        }
      ]
    };
    const persistedItems: ProjectItemRow[] = draft.items.map((item, index) => ({
      id: item.id ?? `50000000-0000-4000-8000-00000000000${index + 2}`,
      project_id: project.id,
      reference: item.reference,
      description: item.description,
      quantity: item.quantity,
      width: item.width,
      height: item.height,
      grain: item.grain,
      can_rotate: item.canRotate,
      edge_top: item.edgeTop,
      edge_bottom: item.edgeBottom,
      edge_left: item.edgeLeft,
      edge_right: item.edgeRight,
      edge_type: item.edgeType,
      metadata: {},
      sort_order: (index + 1) * 10,
      created_at: "2026-08-13T00:00:00.000Z",
      updated_at: "2026-08-13T00:00:00.000Z"
    }));

    const previewInput = buildOptimizationInputFromDraft({ project, material, draft });
    const savedInput = buildOptimizationInputFromProject({
      project,
      material,
      items: persistedItems,
      strategy: draft.strategy
    });

    expect(optimizerProfileForStrategy("baseline")).toBe("fast");
    expect(optimizerProfileForStrategy("v10")).toBe("balanced");
    expect(stripPersistenceIdentity(previewInput)).toEqual(stripPersistenceIdentity(savedInput));
  });

  it("maps the four UI optimization modes to explicit strategy and profile pairs", () => {
    const project: ProjectRow = {
      id: "10000000-0000-4000-8000-000000000003",
      organization_id: "20000000-0000-4000-8000-000000000001",
      owner_id: "30000000-0000-4000-8000-000000000001",
      name: "Modos",
      description: null,
      status: "draft",
      material_id: "40000000-0000-4000-8000-000000000003",
      board_width: 2750,
      board_height: 1830,
      board_thickness: 18,
      kerf: 4.5,
      trim_x: 10,
      trim_y: 10,
      min_remnant: 250,
      min_cut_size: 50,
      grain_enabled: false,
      created_at: "2026-08-13T00:00:00.000Z",
      updated_at: "2026-08-13T00:00:00.000Z",
      version: 2
    };
    const material = {
      id: project.material_id,
      code: "MDF18",
      description: "MDF 18MM",
      width: 2750,
      height: 1830,
      thickness: 18,
      has_grain: false
    };
    const baseDraft: ProjectDraft = {
      projectId: project.id,
      expectedVersion: 2,
      materialId: material.id,
      name: "Modos",
      description: "",
      kerf: 4.5,
      trimX: 10,
      trimY: 10,
      minRemnant: 250,
      minCutSize: 50,
      strategy: "baseline",
      items: [
        {
          reference: "P1",
          description: "Base",
          quantity: 1,
          width: 600,
          height: 400,
          grain: false,
          canRotate: true,
          edgeTop: false,
          edgeBottom: false,
          edgeLeft: false,
          edgeRight: false,
          edgeType: "none"
        }
      ]
    };
    const modes = [
      { strategy: "baseline" as const, profile: "fast" as const },
      { strategy: "v10" as const, profile: "fast" as const },
      { strategy: "v10" as const, profile: "balanced" as const },
      { strategy: "v10" as const, profile: "deep" as const }
    ];

    expect(
      modes.map((mode) =>
        buildOptimizationInputFromDraft({
          project,
          material,
          draft: { ...baseDraft, ...mode },
          profile: mode.profile
        })
      )
    ).toMatchObject(
      modes.map((mode) => ({
        strategy: mode.strategy,
        constraints: { profile: mode.profile }
      }))
    );
  });
});

function stripPersistenceIdentity(input: OptimizationInput): OptimizationInput {
  return {
    ...input,
    pieces: input.pieces.map(({ id: _id, ...piece }) => piece)
  };
}

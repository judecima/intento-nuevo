import { describe, expect, it } from "vitest";
import {
  canCreateProject,
  canEditProject,
  isProjectEditableStatus,
  projectDraftSchema,
  normalizeProjectItemOrientation,
  projectStatuses
} from "@/lib/domain/projects";

describe("projects domain", () => {
  it("keeps project statuses explicit and finite", () => {
    expect(projectStatuses).toContain("draft");
    expect(projectStatuses).toContain("submitted");
    expect(projectStatuses).toContain("in_production");
  });

  it("allows editing only draft-like project statuses", () => {
    expect(isProjectEditableStatus("draft")).toBe(true);
    expect(isProjectEditableStatus("optimized")).toBe(true);
    expect(isProjectEditableStatus("submitted")).toBe(false);
    expect(isProjectEditableStatus("approved")).toBe(false);
  });

  it("allows project creation for customer, seller and admin roles", () => {
    expect(canCreateProject("customer")).toBe(true);
    expect(canCreateProject("admin")).toBe(true);
    expect(canCreateProject("seller")).toBe(true);
    expect(canCreateProject("operator")).toBe(false);
    expect(canCreateProject(null, { platformAdmin: true })).toBe(true);
  });

  it("requires an editable status and a project authoring role", () => {
    expect(canEditProject("customer", "draft")).toBe(true);
    expect(canEditProject("admin", "optimized")).toBe(true);
    expect(canEditProject("customer", "submitted")).toBe(false);
    expect(canEditProject("seller", "draft")).toBe(true);
    expect(canEditProject(null, "draft", { platformAdmin: true })).toBe(true);
    expect(canEditProject(null, "submitted", { platformAdmin: true })).toBe(false);
  });

  it("keeps the selected board material in the editable project draft", () => {
    expect(
      projectDraftSchema.parse({
        projectId: "10000000-0000-4000-8000-000000000001",
        expectedVersion: 3,
        materialId: "20000000-0000-4000-8000-000000000001",
        name: "Placard",
        description: "",
        kerf: 4.5,
        trimX: 10,
        trimY: 10,
        minRemnant: 250,
        strategy: "baseline",
        items: []
      }).materialId
    ).toBe("20000000-0000-4000-8000-000000000001");
  });

  it("forces grain orientation when the selected board has grain", () => {
    expect(normalizeProjectItemOrientation([{ grain: false, canRotate: true }], true)).toEqual([
      { grain: true, canRotate: false }
    ]);
    expect(normalizeProjectItemOrientation([{ grain: true, canRotate: false }], false)).toEqual([
      { grain: false, canRotate: true }
    ]);
  });
});

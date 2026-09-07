import { describe, expect, it } from "vitest";

import {
  adminDomainErrors,
  canAdminister,
  createMachineProfileSchema,
  parseConfigurationJson,
  updateMemberSchema
} from "@/lib/domain/admin";

describe("admin domain", () => {
  it("allows only admins to administer organization settings", () => {
    expect(canAdminister("admin")).toBe(true);
    expect(canAdminister("seller")).toBe(false);
    expect(canAdminister("operator")).toBe(false);
    expect(canAdminister("customer")).toBe(false);
    expect(canAdminister(null)).toBe(false);
  });

  it("parses organization member updates from form values", () => {
    const parsed = updateMemberSchema.parse({
      organizationId: "10000000-0000-4000-8000-000000000001",
      userId: "10000000-0000-4000-8000-000000000002",
      role: "seller",
      active: "false",
      comment: "Cambio de sector"
    });

    expect(parsed).toMatchObject({
      role: "seller",
      active: false,
      comment: "Cambio de sector"
    });
  });

  it("parses machine profile commands with JSON configuration", () => {
    const parsed = createMachineProfileSchema.parse({
      organizationId: "10000000-0000-4000-8000-000000000001",
      name: "Seccionadora principal",
      manufacturer: "Homag",
      model: "",
      xmlFormat: "legacy_project_xml",
      kerf: "4.4",
      minPieceWidth: "80",
      minPieceHeight: "60",
      configuration: "{\"station\":\"A\"}",
      active: "true"
    });

    expect(parsed).toMatchObject({
      name: "Seccionadora principal",
      model: null,
      kerf: 4.4,
      minPieceWidth: 80,
      minPieceHeight: 60,
      configuration: { station: "A" },
      active: true
    });
  });

  it("rejects invalid machine profile configuration JSON", () => {
    const parsed = createMachineProfileSchema.safeParse({
      organizationId: "10000000-0000-4000-8000-000000000001",
      name: "Seccionadora principal",
      manufacturer: "",
      model: "",
      xmlFormat: "legacy_project_xml",
      kerf: "4.5",
      minPieceWidth: "0",
      minPieceHeight: "0",
      configuration: "[1,2,3]",
      active: "true"
    });

    expect(parsed.success).toBe(false);
    expect(parseConfigurationJson("[1,2,3]")).toEqual({
      ok: false,
      error: adminDomainErrors.invalidConfiguration
    });
  });
});

import { describe, expect, it } from "vitest";

import {
  canCompleteProduction,
  canGenerateMachineXml,
  canManageProduction,
  canStartProduction,
  completeProductionSchema,
  generateMachineXmlSchema,
  safeReturnPath,
  startProductionSchema
} from "@/lib/domain/production";

describe("production domain", () => {
  it("allows operators and admins to manage production", () => {
    expect(canManageProduction("operator")).toBe(true);
    expect(canManageProduction("admin")).toBe(true);
    expect(canManageProduction("seller")).toBe(false);
    expect(canManageProduction("customer")).toBe(false);
  });

  it("checks production actions against order status", () => {
    expect(canStartProduction("operator", "approved")).toBe(true);
    expect(canStartProduction("operator", "production")).toBe(false);
    expect(canCompleteProduction("operator", "production")).toBe(true);
    expect(canCompleteProduction("operator", "approved")).toBe(false);
    expect(canGenerateMachineXml("operator", "completed")).toBe(true);
    expect(canGenerateMachineXml("operator", "delivered")).toBe(true);
    expect(canGenerateMachineXml("operator", "submitted")).toBe(false);
  });

  it("parses action commands", () => {
    expect(
      startProductionSchema.parse({
        orderId: "10000000-0000-4000-8000-000000000001",
        expectedOrderVersion: "4",
        machineProfileId: "",
        notes: "Arranque"
      }),
    ).toMatchObject({
      orderId: "10000000-0000-4000-8000-000000000001",
      expectedOrderVersion: 4,
      machineProfileId: null,
      notes: "Arranque"
    });

    expect(
      completeProductionSchema.parse({
        orderId: "10000000-0000-4000-8000-000000000001",
        expectedOrderVersion: "5"
      }),
    ).toMatchObject({
      expectedOrderVersion: 5,
      notes: ""
    });

    expect(
      generateMachineXmlSchema.parse({
        orderId: "10000000-0000-4000-8000-000000000001",
        machineProfileId: ""
      }),
    ).toMatchObject({
      machineProfileId: null
    });
  });

  it("rejects external return paths", () => {
    expect(safeReturnPath("/production/active")).toBe("/production/active");
    expect(safeReturnPath("https://example.com")).toBe("/production");
    expect(safeReturnPath("//example.com/path")).toBe("/production");
  });
});

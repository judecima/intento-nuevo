import { describe, expect, it } from "vitest";

import {
  canAccessOrderProcess,
  canRunProcessAction,
  listAvailableProcessActions,
  processOrderStatusesForRole,
  processEntrySchema,
  processTransitionSchema
} from "@/lib/domain/process";

describe("process domain", () => {
  it("limits process access to internal roles", () => {
    expect(canAccessOrderProcess("seller")).toBe(true);
    expect(canAccessOrderProcess("operator")).toBe(true);
    expect(canAccessOrderProcess("admin")).toBe(true);
    expect(canAccessOrderProcess("customer")).toBe(false);
  });

  it("keeps sales, production and delivery actions role-aware", () => {
    expect(canRunProcessAction("seller", "submitted", "approve")).toBe(true);
    expect(canRunProcessAction("seller", "approved", "start_production")).toBe(false);
    expect(canRunProcessAction("operator", "approved", "start_production")).toBe(true);
    expect(canRunProcessAction("operator", "completed", "deliver")).toBe(false);
    expect(canRunProcessAction("admin", "completed", "deliver")).toBe(true);
    expect(listAvailableProcessActions("operator", "production")).toEqual(["complete_production"]);
  });

  it("shows only approved-and-later orders in the process board", () => {
    expect(processOrderStatusesForRole("seller")).toEqual(["approved", "production", "completed", "delivered"]);
    expect(processOrderStatusesForRole("operator")).toEqual(["approved", "production", "completed", "delivered"]);
    expect(processOrderStatusesForRole("admin")).toEqual(["approved", "production", "completed", "delivered"]);
    expect(processOrderStatusesForRole("customer")).toEqual([]);
  });

  it("parses process row edits and transitions", () => {
    expect(
      processEntrySchema.parse({
        orderId: "10000000-0000-4000-8000-000000000001",
        invoiceNumber: "FAC 120",
        remittanceNumber: "",
        remitted: "true",
        promisedOn: "2026-08-20",
        deadlineOn: "",
        edgeBand045Count: "12.5",
        edgeBand2mmCount: "4"
      })
    ).toMatchObject({
      invoiceNumber: "FAC 120",
      remitted: true,
      promisedOn: "2026-08-20",
      deadlineOn: null,
      edgeBand045Count: 12.5,
      edgeBand2mmCount: 4
    });

    expect(
      processTransitionSchema.parse({
        orderId: "10000000-0000-4000-8000-000000000001",
        expectedOrderVersion: "3",
        action: "deliver",
        remittanceNumber: "R 44"
      })
    ).toMatchObject({
      expectedOrderVersion: 3,
      action: "deliver",
      remittanceNumber: "R 44"
    });
  });
});

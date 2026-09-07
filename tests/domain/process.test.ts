import { describe, expect, it } from "vitest";

import {
  calculateAutomaticDeliveryDate,
  calculateProcessDeliveryAlert,
  calculateProcessDeliveryStatus,
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
    expect(canRunProcessAction("seller", "pending", "approve")).toBe(true);
    expect(canRunProcessAction("seller", "approved", "start_production")).toBe(false);
    expect(canRunProcessAction("operator", "approved", "start_production")).toBe(true);
    expect(canRunProcessAction("operator", "production", "start_edgebanding")).toBe(true);
    expect(canRunProcessAction("operator", "completed", "deliver")).toBe(true);
    expect(canRunProcessAction("admin", "completed", "deliver")).toBe(true);
    expect(listAvailableProcessActions("operator", "production")).toEqual(["start_edgebanding", "complete_production"]);
    expect(listAvailableProcessActions("operator", "edgebanding")).toEqual(["complete_production"]);
    expect(listAvailableProcessActions("operator", "completed")).toEqual(["deliver"]);
  });

  it("shows the right workflow states in the process board", () => {
    expect(processOrderStatusesForRole("seller")).toEqual([
      "pending",
      "submitted",
      "under_review",
      "approved",
      "production",
      "edgebanding",
      "completed",
      "delivered"
    ]);
    expect(processOrderStatusesForRole("operator")).toEqual(["approved", "production", "edgebanding", "completed", "delivered"]);
    expect(processOrderStatusesForRole("admin")).toEqual([
      "pending",
      "submitted",
      "under_review",
      "approved",
      "production",
      "edgebanding",
      "completed",
      "delivered"
    ]);
    expect(processOrderStatusesForRole("customer")).toEqual([]);
  });

  it("calculates the automatic delivery date from the approval date", () => {
    expect(calculateAutomaticDeliveryDate("2026-08-20T15:30:00.000Z", 10)).toBe("2026-08-30");
    expect(calculateAutomaticDeliveryDate("2026-08-20T02:30:00.000Z", 7)).toBe("2026-08-26");
    expect(calculateAutomaticDeliveryDate("2026-08-20T15:30:00.000Z", 0)).toBe("2026-08-27");
    expect(calculateAutomaticDeliveryDate(null, 7)).toBeNull();
  });

  it("highlights unfinished approved orders around the automatic delivery date", () => {
    const today = new Date("2026-08-20T15:00:00.000Z");

    expect(calculateProcessDeliveryAlert("approved", "2026-08-19", today)).toBe("overdue");
    expect(calculateProcessDeliveryAlert("production", "2026-08-22", today)).toBe("due_soon");
    expect(calculateProcessDeliveryAlert("edgebanding", "2026-08-20", today)).toBe("due_soon");
    expect(calculateProcessDeliveryAlert("approved", "2026-08-23", today)).toBeNull();
    expect(calculateProcessDeliveryAlert("completed", "2026-08-19", today)).toBeNull();
    expect(calculateProcessDeliveryAlert("pending", "2026-08-19", today)).toBeNull();
  });

  it("returns the visible delivery status for deadline tracking", () => {
    const today = new Date("2026-08-20T15:00:00.000Z");

    expect(calculateProcessDeliveryStatus("approved", "2026-08-19", today)).toBe("overdue");
    expect(calculateProcessDeliveryStatus("production", "2026-08-22", today)).toBe("due_soon");
    expect(calculateProcessDeliveryStatus("edgebanding", "2026-08-23", today)).toBe("on_time");
    expect(calculateProcessDeliveryStatus("completed", "2026-08-19", today)).toBe("on_time");
    expect(calculateProcessDeliveryStatus("delivered", "2026-08-19", today)).toBe("delivered");
    expect(calculateProcessDeliveryStatus("approved", null, today)).toBe("on_time");
    expect(calculateProcessDeliveryAlert("delivered", "2026-08-19", today)).toBeNull();
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

import { describe, expect, it } from "vitest";

import {
  canReviewOrders,
  canSubmitOrder,
  canTransitionOrder,
  getOrderSnapshotSummary,
  orderTransitionSchema,
  submitOrderSchema
} from "@/lib/domain/orders";

describe("order domain", () => {
  it("defines the seller review transition chain", () => {
    expect(canTransitionOrder("submitted", "under_review")).toBe(true);
    expect(canTransitionOrder("submitted", "approved")).toBe(true);
    expect(canTransitionOrder("under_review", "approved")).toBe(true);
    expect(canTransitionOrder("under_review", "changes_requested")).toBe(true);
    expect(canTransitionOrder("completed", "delivered")).toBe(true);
    expect(canTransitionOrder("approved", "completed")).toBe(false);
  });

  it("limits submit and review permissions by role", () => {
    expect(canSubmitOrder("customer")).toBe(true);
    expect(canSubmitOrder("admin")).toBe(true);
    expect(canSubmitOrder("seller")).toBe(false);
    expect(canReviewOrders("seller")).toBe(true);
    expect(canReviewOrders("operator")).toBe(false);
  });

  it("parses submit and transition commands", () => {
    expect(
      submitOrderSchema.parse({
        projectId: "10000000-0000-4000-8000-000000000001",
        optimizationResultId: "20000000-0000-4000-8000-000000000001",
        expectedProjectVersion: "7",
        notesCustomer: "Listo para revisar"
      }),
    ).toEqual({
      projectId: "10000000-0000-4000-8000-000000000001",
      optimizationResultId: "20000000-0000-4000-8000-000000000001",
      expectedProjectVersion: 7,
      notesCustomer: "Listo para revisar"
    });

    expect(
      orderTransitionSchema.parse({
        orderId: "30000000-0000-4000-8000-000000000001",
        expectedOrderVersion: "2"
      }),
    ).toEqual({
      orderId: "30000000-0000-4000-8000-000000000001",
      expectedOrderVersion: 2,
      comment: ""
    });
  });

  it("summarizes immutable order snapshots", () => {
    const summary = getOrderSnapshotSummary({
      project: {
        name: "Placard dormitorio"
      },
      material: {
        description: "MDF ROBLE 18MM"
      },
      customer: {
        full_name: "Julio",
        email: "juliodecima@gmail.com"
      },
      items: [
        { quantity: 2 },
        { quantity: 4 }
      ],
      optimization_result: {
        board_count: 3,
        utilization_percentage: 81.25,
        waste_percentage: 18.75,
        cut_count: 42,
        saw_meters: 51.2
      }
    });

    expect(summary).toEqual({
      projectName: "Placard dormitorio",
      materialDescription: "MDF ROBLE 18MM",
      customerName: "Julio",
      customerEmail: "juliodecima@gmail.com",
      itemRows: 2,
      totalPieces: 6,
      boardCount: 3,
      utilizationPercentage: 81.25,
      wastePercentage: 18.75,
      cutCount: 42,
      sawMeters: 51.2
    });
  });
});

import { z } from "zod";
import type { OrganizationRole } from "@/lib/domain/roles";

export const orderStatuses = [
  "pending",
  "submitted",
  "under_review",
  "changes_requested",
  "approved",
  "production",
  "edgebanding",
  "completed",
  "delivered",
  "cancelled"
] as const;

export type OrderStatus = (typeof orderStatuses)[number];

export const orderStatusLabels: Record<OrderStatus, string> = {
  pending: "Pendiente",
  submitted: "Pendiente",
  under_review: "En revision",
  changes_requested: "Correcciones solicitadas",
  approved: "Aprobado",
  production: "Produccion",
  edgebanding: "Pegado de canto",
  completed: "Finalizado",
  delivered: "Entregado",
  cancelled: "Cancelado"
};

export const orderDomainErrors = {
  forbidden: "FORBIDDEN",
  alreadyExists: "ORDER_ALREADY_EXISTS",
  invalidStatus: "ORDER_INVALID_STATUS",
  notFound: "ORDER_NOT_FOUND",
  snapshotMissing: "ORDER_SNAPSHOT_MISSING",
  versionConflict: "ORDER_VERSION_CONFLICT",
  projectVersionConflict: "PROJECT_VERSION_CONFLICT",
  projectInvalidStatus: "PROJECT_INVALID_STATUS",
  optimizationInvalid: "OPTIMIZATION_INVALID",
  transitionFailed: "ORDER_TRANSITION_FAILED"
} as const;

export type OrderDomainError = (typeof orderDomainErrors)[keyof typeof orderDomainErrors];

export const validOrderTransitions: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["approved", "cancelled"],
  submitted: ["approved", "cancelled"],
  under_review: ["approved", "cancelled"],
  changes_requested: ["cancelled"],
  approved: ["production", "cancelled"],
  production: ["edgebanding", "completed"],
  edgebanding: ["completed"],
  completed: ["delivered"],
  delivered: [],
  cancelled: []
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return validOrderTransitions[from].includes(to);
}

export function canSubmitOrder(role: OrganizationRole | null, options: { platformAdmin?: boolean } = {}): boolean {
  return Boolean(options.platformAdmin) || role === "customer" || role === "seller" || role === "admin";
}

export function canReviewOrders(role: OrganizationRole | null): boolean {
  return role === "seller" || role === "admin";
}

export function canReadProductionOrders(role: OrganizationRole | null): boolean {
  return role === "operator" || role === "admin";
}

export const submitOrderSchema = z.object({
  projectId: z.string().uuid(),
  optimizationResultId: z.string().uuid(),
  expectedProjectVersion: z.coerce.number().int().positive(),
  notesCustomer: z.string().trim().max(2000).optional().default("")
});

export const orderTransitionSchema = z.object({
  orderId: z.string().uuid(),
  expectedOrderVersion: z.coerce.number().int().positive(),
  comment: z.string().trim().max(2000).optional().default("")
});

export type OrderSnapshotSummary = {
  projectName: string;
  materialDescription: string;
  customerName: string;
  customerEmail: string;
  itemRows: number;
  totalPieces: number;
  boardCount: number;
  utilizationPercentage: number;
  wastePercentage: number;
  cutCount: number;
  sawMeters: number;
  edgeBand045Meters: number;
  edgeBand2mmMeters: number;
};

export function getOrderSnapshotSummary(snapshot: unknown): OrderSnapshotSummary {
  const root = isRecord(snapshot) ? snapshot : {};
  const project = isRecord(root.project) ? root.project : {};
  const material = isRecord(root.material) ? root.material : {};
  const customer = isRecord(root.customer) ? root.customer : {};
  const result = isRecord(root.optimization_result) ? root.optimization_result : {};
  const resultJson = isRecord(result.result_json) ? result.result_json : {};
  const resultMetrics = isRecord(resultJson.metrics) ? resultJson.metrics : {};
  const items = Array.isArray(root.items) ? root.items : [];

  return {
    projectName: stringValue(project.name, "Proyecto"),
    materialDescription: stringValue(material.description, "Material snapshot"),
    customerName: stringValue(customer.full_name, "Cliente"),
    customerEmail: stringValue(customer.email, ""),
    itemRows: items.length,
    totalPieces: items.reduce((total, item) => {
      if (!isRecord(item)) return total;
      return total + numberValue(item.quantity, 0);
    }, 0),
    boardCount: numberValue(result.board_count, 0),
    utilizationPercentage: numberValue(result.utilization_percentage, 0),
    wastePercentage: numberValue(result.waste_percentage, 0),
    cutCount: numberValue(result.cut_count, 0),
    sawMeters: numberValue(result.saw_meters, 0),
    edgeBand045Meters: numberValue(result.edge_band_045_meters, numberValue(resultMetrics.edgeBand045Meters, 0)),
    edgeBand2mmMeters: numberValue(result.edge_band_2mm_meters, numberValue(resultMetrics.edgeBand2mmMeters, 0))
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

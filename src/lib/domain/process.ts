import { z } from "zod";
import type { OrderStatus } from "@/lib/domain/orders";
import { DEFAULT_ORGANIZATION_DELIVERY_TIME_DAYS } from "@/lib/domain/platform";
import type { OrganizationRole } from "@/lib/domain/roles";

const ARGENTINA_OFFSET_MINUTES = -180;
const DAY_MS = 24 * 60 * 60 * 1000;

export const processActionIds = [
  "approve",
  "start_production",
  "start_edgebanding",
  "complete_production",
  "deliver"
] as const;

export type ProcessActionId = (typeof processActionIds)[number];
export type ProcessDeliveryAlert = "overdue" | "due_soon";
export type ProcessDeliveryStatus = ProcessDeliveryAlert | "on_time" | "delivered";

export const processDeliveryStatusLabels: Record<ProcessDeliveryStatus, string> = {
  overdue: "Vencido",
  due_soon: "Pendiente a vencer",
  on_time: "En fecha",
  delivered: "Entregado"
};

export const processActionLabels: Record<ProcessActionId, string> = {
  approve: "Aprobar",
  start_production: "Iniciar produccion",
  start_edgebanding: "Pasar a pegado",
  complete_production: "Finalizar",
  deliver: "Entregar"
};

export const processStageLabels: Record<OrderStatus, string> = {
  pending: "Pendiente",
  submitted: "Pendiente",
  under_review: "Revision",
  changes_requested: "Correcciones",
  approved: "Listo para corte",
  production: "Produccion",
  edgebanding: "Pegado de canto",
  completed: "Finalizado",
  delivered: "Entregado",
  cancelled: "Cancelado"
};

export const processDomainErrors = {
  forbidden: "FORBIDDEN",
  invalidStatus: "ORDER_INVALID_STATUS",
  orderNotFound: "ORDER_NOT_FOUND",
  orderVersionConflict: "ORDER_VERSION_CONFLICT",
  processUpdateFailed: "ORDER_PROCESS_UPDATE_FAILED",
  transitionFailed: "ORDER_PROCESS_TRANSITION_FAILED"
} as const;

export function canAccessOrderProcess(role: OrganizationRole | null): boolean {
  return role === "seller" || role === "operator" || role === "admin";
}

export function canRunProcessAction(
  role: OrganizationRole | null,
  status: OrderStatus,
  action: ProcessActionId
): boolean {
  if (role === "admin") return adminCanRun(status, action);

  if (role === "seller") {
    return (
      (["pending", "submitted", "under_review"].includes(status) && action === "approve") ||
      (status === "completed" && action === "deliver")
    );
  }

  if (role === "operator") {
    return (
      (status === "approved" && action === "start_production") ||
      (status === "production" && ["start_edgebanding", "complete_production"].includes(action)) ||
      (status === "edgebanding" && action === "complete_production") ||
      (status === "completed" && action === "deliver")
    );
  }

  return false;
}

export function listAvailableProcessActions(
  role: OrganizationRole | null,
  status: OrderStatus
): ProcessActionId[] {
  return processActionIds.filter((action) => canRunProcessAction(role, status, action));
}

export function processOrderStatusesForRole(role: OrganizationRole | null): OrderStatus[] {
  if (role === "seller" || role === "admin") {
    return ["pending", "submitted", "under_review", "approved", "production", "edgebanding", "completed", "delivered"];
  }
  if (role === "operator") {
    return ["approved", "production", "edgebanding", "completed", "delivered"];
  }
  return [];
}

export function calculateAutomaticDeliveryDate(
  approvedAt: string | null | undefined,
  deliveryTimeDays: number
): string | null {
  if (!approvedAt) return null;

  const approvedDate = new Date(approvedAt);
  if (Number.isNaN(approvedDate.valueOf())) return null;

  const days = Number.isInteger(deliveryTimeDays) && deliveryTimeDays > 0
    ? deliveryTimeDays
    : DEFAULT_ORGANIZATION_DELIVERY_TIME_DAYS;
  const localDate = new Date(approvedDate.getTime() + ARGENTINA_OFFSET_MINUTES * 60_000);
  localDate.setUTCDate(localDate.getUTCDate() + days);

  return [
    localDate.getUTCFullYear(),
    String(localDate.getUTCMonth() + 1).padStart(2, "0"),
    String(localDate.getUTCDate()).padStart(2, "0")
  ].join("-");
}

export function calculateProcessDeliveryAlert(
  status: OrderStatus,
  deliveryOn: string | null | undefined,
  currentDate: Date = new Date()
): ProcessDeliveryAlert | null {
  const deliveryStatus = calculateProcessDeliveryStatus(status, deliveryOn, currentDate);
  return deliveryStatus === "overdue" || deliveryStatus === "due_soon" ? deliveryStatus : null;
}

export function calculateProcessDeliveryStatus(
  status: OrderStatus,
  deliveryOn: string | null | undefined,
  currentDate: Date = new Date()
): ProcessDeliveryStatus {
  if (status === "delivered") return "delivered";
  if (!["approved", "production", "edgebanding"].includes(status) || !deliveryOn) return "on_time";

  const deliveryDate = dateOnlyToUtcMs(deliveryOn);
  if (deliveryDate === null) return "on_time";

  const daysUntilDelivery = Math.floor((deliveryDate - argentinaTodayUtcMs(currentDate)) / DAY_MS);
  if (daysUntilDelivery < 0) return "overdue";
  if (daysUntilDelivery <= 2) return "due_soon";
  return "on_time";
}

export const processTransitionSchema = z.object({
  orderId: z.string().uuid(),
  expectedOrderVersion: z.coerce.number().int().positive(),
  action: z.enum(processActionIds),
  comment: z.string().trim().max(2000).optional().default(""),
  machineProfileId: z.string().uuid().optional().or(z.literal("")).transform((value) => value || null),
  remittanceNumber: z.string().trim().max(120).optional().default("")
});

export const processEntrySchema = z.object({
  orderId: z.string().uuid(),
  invoiceNumber: z.string().trim().max(120).optional().default(""),
  remittanceNumber: z.string().trim().max(120).optional().default(""),
  remitted: z.coerce.boolean().optional().default(false),
  promisedOn: nullableDateString(),
  deadlineOn: nullableDateString(),
  cutCompletedOn: nullableDateString(),
  edgebandingCompletedOn: nullableDateString(),
  edgeBand045Count: z.coerce.number().min(0).max(999999).optional().default(0),
  edgeBand2mmCount: z.coerce.number().min(0).max(999999).optional().default(0),
  processNotes: z.string().trim().max(2000).optional().default("")
});

function adminCanRun(status: OrderStatus, action: ProcessActionId): boolean {
  return (
    (["pending", "submitted", "under_review"].includes(status) && action === "approve") ||
    (status === "approved" && action === "start_production") ||
    (status === "production" && ["start_edgebanding", "complete_production"].includes(action)) ||
    (status === "edgebanding" && action === "complete_production") ||
    (status === "completed" && action === "deliver")
  );
}

function nullableDateString() {
  return z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal(""))
    .transform((value) => value || null);
}

function argentinaTodayUtcMs(value: Date): number {
  const shifted = new Date(value.getTime() + ARGENTINA_OFFSET_MINUTES * 60_000);
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
}

function dateOnlyToUtcMs(value: string): number | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, year, month, day] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}

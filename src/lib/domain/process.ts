import { z } from "zod";
import type { OrderStatus } from "@/lib/domain/orders";
import type { OrganizationRole } from "@/lib/domain/roles";

export const processActionIds = [
  "start_review",
  "request_changes",
  "approve",
  "start_production",
  "complete_production",
  "deliver"
] as const;

export type ProcessActionId = (typeof processActionIds)[number];

export const processActionLabels: Record<ProcessActionId, string> = {
  start_review: "Tomar revision",
  request_changes: "Solicitar cambios",
  approve: "Aprobar",
  start_production: "Iniciar produccion",
  complete_production: "Finalizar",
  deliver: "Entregar"
};

export const processStageLabels: Record<OrderStatus, string> = {
  submitted: "Pendiente",
  under_review: "Revision",
  changes_requested: "Correcciones",
  approved: "Listo para corte",
  production: "Produccion",
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
      (status === "submitted" && ["start_review", "request_changes", "approve"].includes(action)) ||
      (status === "under_review" && ["request_changes", "approve"].includes(action)) ||
      (status === "completed" && action === "deliver")
    );
  }

  if (role === "operator") {
    return (
      (status === "approved" && action === "start_production") ||
      (status === "production" && action === "complete_production")
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
  if (role === "seller" || role === "operator" || role === "admin") {
    return ["approved", "production", "completed", "delivered"];
  }
  return [];
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
    (status === "submitted" && ["start_review", "request_changes", "approve"].includes(action)) ||
    (status === "under_review" && ["request_changes", "approve"].includes(action)) ||
    (status === "approved" && action === "start_production") ||
    (status === "production" && action === "complete_production") ||
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

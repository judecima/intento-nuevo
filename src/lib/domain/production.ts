import { z } from "zod";
import type { OrganizationRole } from "@/lib/domain/roles";
import type { OrderStatus } from "@/lib/domain/orders";

export const productionJobStatuses = ["queued", "in_progress", "completed", "cancelled"] as const;

export type ProductionJobStatus = (typeof productionJobStatuses)[number];

export const productionJobStatusLabels: Record<ProductionJobStatus, string> = {
  queued: "En cola",
  in_progress: "En produccion",
  completed: "Finalizado",
  cancelled: "Cancelado"
};

export const generatedFileTypes = ["machine_xml", "pdf", "other"] as const;

export type GeneratedFileType = (typeof generatedFileTypes)[number];

export const generatedFileTypeLabels: Record<GeneratedFileType, string> = {
  machine_xml: "XML maquina",
  pdf: "PDF",
  other: "Otro"
};

export const productionDomainErrors = {
  forbidden: "FORBIDDEN",
  orderNotFound: "ORDER_NOT_FOUND",
  invalidOrderStatus: "ORDER_INVALID_STATUS",
  orderVersionConflict: "ORDER_VERSION_CONFLICT",
  jobNotFound: "PRODUCTION_JOB_NOT_FOUND",
  machineProfileNotFound: "MACHINE_PROFILE_NOT_FOUND",
  xmlGenerationFailed: "XML_GENERATION_FAILED",
  fileNotFound: "GENERATED_FILE_NOT_FOUND",
  storageUploadFailed: "STORAGE_UPLOAD_FAILED",
  auditFailed: "AUDIT_LOG_FAILED",
  transitionFailed: "PRODUCTION_TRANSITION_FAILED"
} as const;

export type ProductionDomainError = (typeof productionDomainErrors)[keyof typeof productionDomainErrors];

export function canManageProduction(role: OrganizationRole | null): boolean {
  return role === "operator" || role === "admin";
}

export function canAccessProduction(role: OrganizationRole | null): boolean {
  return role === "operator" || role === "admin";
}

export function canGenerateMachineXml(role: OrganizationRole | null, orderStatus: OrderStatus): boolean {
  return canManageProduction(role) && ["approved", "production", "edgebanding", "completed", "delivered"].includes(orderStatus);
}

export function canStartProduction(role: OrganizationRole | null, orderStatus: OrderStatus): boolean {
  return canManageProduction(role) && orderStatus === "approved";
}

export function canStartEdgebanding(role: OrganizationRole | null, orderStatus: OrderStatus): boolean {
  return canManageProduction(role) && orderStatus === "production";
}

export function canCompleteProduction(role: OrganizationRole | null, orderStatus: OrderStatus): boolean {
  return canManageProduction(role) && (orderStatus === "production" || orderStatus === "edgebanding");
}

export const startProductionSchema = z.object({
  orderId: z.string().uuid(),
  expectedOrderVersion: z.coerce.number().int().positive(),
  machineProfileId: z.string().uuid().optional().or(z.literal("")).transform((value) => value || null),
  notes: z.string().trim().max(2000).optional().default(""),
  returnTo: z.string().trim().optional().default("/production")
});

export const completeProductionSchema = z.object({
  orderId: z.string().uuid(),
  expectedOrderVersion: z.coerce.number().int().positive(),
  notes: z.string().trim().max(2000).optional().default(""),
  returnTo: z.string().trim().optional().default("/production/active")
});

export const startEdgebandingSchema = z.object({
  orderId: z.string().uuid(),
  expectedOrderVersion: z.coerce.number().int().positive(),
  notes: z.string().trim().max(2000).optional().default(""),
  returnTo: z.string().trim().optional().default("/production/active")
});

export const generateMachineXmlSchema = z.object({
  orderId: z.string().uuid(),
  machineProfileId: z.string().uuid().optional().or(z.literal("")).transform((value) => value || null),
  returnTo: z.string().trim().optional().default("/production")
});

export const downloadGeneratedFileSchema = z.object({
  fileId: z.string().uuid(),
  returnTo: z.string().trim().optional().default("/production")
});

export function safeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/production";
  return value;
}

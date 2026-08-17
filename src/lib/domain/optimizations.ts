import { z } from "zod";
import type { OrganizationRole } from "@/lib/domain/roles";
import type { ProjectStatus } from "@/lib/domain/projects";

export const optimizationJobStatuses = ["queued", "running", "completed", "failed", "cancelled"] as const;

export type OptimizationJobStatus = (typeof optimizationJobStatuses)[number];

export const optimizationJobStatusLabels: Record<OptimizationJobStatus, string> = {
  queued: "En cola",
  running: "Ejecutando",
  completed: "Completada",
  failed: "Fallida",
  cancelled: "Cancelada"
};

export const optimizationDomainErrors = {
  forbidden: "FORBIDDEN",
  invalidStatus: "PROJECT_INVALID_STATUS",
  noItems: "OPTIMIZATION_NO_ITEMS",
  invalidResult: "OPTIMIZATION_INVALID",
  failed: "OPTIMIZATION_FAILED",
  jobCreateFailed: "OPTIMIZATION_JOB_CREATE_FAILED",
  resultCreateFailed: "OPTIMIZATION_RESULT_CREATE_FAILED",
  projectVersionConflict: "PROJECT_VERSION_CONFLICT",
  projectNotFound: "PROJECT_NOT_FOUND"
} as const;

export type OptimizationDomainError = (typeof optimizationDomainErrors)[keyof typeof optimizationDomainErrors];

export const optimizableProjectStatuses = ["draft", "optimized"] as const satisfies ProjectStatus[];

export function canRunOptimization(role: OrganizationRole | null, status: ProjectStatus): boolean {
  if (!optimizableProjectStatuses.includes(status as (typeof optimizableProjectStatuses)[number])) return false;
  return role === "customer" || role === "admin";
}

export const runOptimizationSchema = z.object({
  projectId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().positive(),
  strategy: z.enum(["baseline", "v10"]).default("baseline"),
  profile: z.enum(["fast", "balanced", "deep"]).optional()
});

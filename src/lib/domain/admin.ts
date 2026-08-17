import { z } from "zod";
import { organizationRoles, type OrganizationRole } from "@/lib/domain/roles";

export const adminDomainErrors = {
  forbidden: "FORBIDDEN",
  invalidInput: "ADMIN_INVALID_INPUT",
  authUserCreateFailed: "AUTH_USER_CREATE_FAILED",
  lastAdminRequired: "LAST_ADMIN_REQUIRED",
  memberNotFound: "ORGANIZATION_MEMBER_NOT_FOUND",
  profileNotFound: "PROFILE_NOT_FOUND",
  memberCreateFailed: "ORGANIZATION_MEMBER_CREATE_FAILED",
  machineProfileNotFound: "MACHINE_PROFILE_NOT_FOUND",
  machineProfileSaveFailed: "MACHINE_PROFILE_SAVE_FAILED",
  memberSaveFailed: "ORGANIZATION_MEMBER_SAVE_FAILED",
  auditQueryFailed: "AUDIT_QUERY_FAILED",
  invalidConfiguration: "MACHINE_PROFILE_INVALID_CONFIGURATION"
} as const;

export type AdminDomainError = (typeof adminDomainErrors)[keyof typeof adminDomainErrors];

export const staffMemberRoles = ["seller", "operator"] as const;

const booleanFieldSchema = z.union([z.boolean(), z.string()]).transform((value) => {
  if (typeof value === "boolean") return value;
  return ["1", "true", "on", "yes", "active"].includes(value.toLowerCase());
});

const optionalTextSchema = z
  .string()
  .trim()
  .max(200)
  .optional()
  .default("")
  .transform((value) => value || null);

export const updateMemberSchema = z.object({
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(organizationRoles),
  active: booleanFieldSchema,
  comment: z.string().trim().max(1000).optional().default("")
});

export const createStaffMemberSchema = z.object({
  organizationId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
  role: z.enum(staffMemberRoles),
  comment: z.string().trim().max(1000).optional().default("")
});

const machineProfileBaseSchema = z.object({
  name: z.string().trim().min(2).max(120),
  manufacturer: optionalTextSchema,
  model: optionalTextSchema,
  xmlFormat: z.string().trim().min(2).max(80).default("legacy_project_xml"),
  kerf: z.coerce.number().min(0).max(20).default(4.5),
  minPieceWidth: z.coerce.number().min(0).max(10000).default(0),
  minPieceHeight: z.coerce.number().min(0).max(10000).default(0),
  configuration: z
    .string()
    .trim()
    .optional()
    .default("{}")
    .transform((value, context) => {
      const parsed = parseConfigurationJson(value || "{}");
      if (!parsed.ok) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: adminDomainErrors.invalidConfiguration
        });
        return z.NEVER;
      }
      return parsed.value;
    }),
  active: booleanFieldSchema
});

export const createMachineProfileSchema = machineProfileBaseSchema.extend({
  organizationId: z.string().uuid()
});

export const updateMachineProfileSchema = machineProfileBaseSchema.extend({
  id: z.string().uuid()
});

export type UpdateMemberCommand = z.infer<typeof updateMemberSchema>;
export type CreateStaffMemberCommand = z.infer<typeof createStaffMemberSchema>;
export type CreateMachineProfileCommand = z.infer<typeof createMachineProfileSchema>;
export type UpdateMachineProfileCommand = z.infer<typeof updateMachineProfileSchema>;

export function canAdminister(role: OrganizationRole | null): boolean {
  return role === "admin";
}

export function parseConfigurationJson(
  value: string
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: adminDomainErrors.invalidConfiguration };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, error: adminDomainErrors.invalidConfiguration };
  }
}

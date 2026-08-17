import { z } from "zod";
import { organizationRoles } from "@/lib/domain/roles";

/**
 * Plataforma: el nivel que esta por encima del tenant. Un super usuario crea
 * organizaciones y decide quien pertenece a cada una; los roles de
 * `organization_members` siguen gobernando lo que pasa dentro de cada una.
 */
export const platformDomainErrors = {
  forbidden: "PLATFORM_FORBIDDEN",
  invalidInput: "PLATFORM_INVALID_INPUT",
  slugTaken: "ORGANIZATION_SLUG_TAKEN",
  organizationNotFound: "ORGANIZATION_NOT_FOUND",
  organizationHasData: "ORGANIZATION_HAS_DATA",
  memberNotFound: "ORGANIZATION_MEMBER_NOT_FOUND",
  catalogCopyFailed: "ORGANIZATION_CATALOG_COPY_FAILED",
  catalogAlreadyExists: "ORGANIZATION_CATALOG_ALREADY_EXISTS",
  userCreateFailed: "AUTH_USER_CREATE_FAILED",
  saveFailed: "PLATFORM_SAVE_FAILED"
} as const;

export type PlatformDomainError = (typeof platformDomainErrors)[keyof typeof platformDomainErrors];

export function canManagePlatform(context: { isPlatformAdmin?: boolean } | null | undefined): boolean {
  return Boolean(context?.isPlatformAdmin);
}

/**
 * Deriva el slug de una organizacion respetando el check de la base:
 * `^[a-z0-9]+(?:-[a-z0-9]+)*$`.
 */
export function slugifyOrganizationName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

const slugSchema = z
  .string()
  .trim()
  .max(60)
  .optional()
  .default("")
  .transform((value) => slugifyOrganizationName(value));

/** Checkbox de formulario: ausente significa desmarcado, no dato invalido. */
const booleanFieldSchema = z
  .union([z.boolean(), z.string()])
  .optional()
  .default("")
  .transform((value) => {
    if (typeof value === "boolean") return value;
    return ["1", "true", "on", "yes", "active"].includes(value.toLowerCase());
  });

export const createOrganizationSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    slug: slugSchema
  })
  .transform((value) => ({
    name: value.name,
    slug: value.slug || slugifyOrganizationName(value.name)
  }))
  .refine((value) => value.slug.length >= 2, {
    message: "El nombre no genera un identificador valido.",
    path: ["slug"]
  });

export const updateOrganizationSchema = z
  .object({
    organizationId: z.string().uuid(),
    name: z.string().trim().min(2).max(120),
    slug: slugSchema,
    active: booleanFieldSchema,
    allowCustomerSignup: booleanFieldSchema
  })
  .transform((value) => ({
    organizationId: value.organizationId,
    name: value.name,
    slug: value.slug || slugifyOrganizationName(value.name),
    active: value.active,
    allowCustomerSignup: value.allowCustomerSignup
  }))
  .refine((value) => value.slug.length >= 2, {
    message: "El nombre no genera un identificador valido.",
    path: ["slug"]
  });

/**
 * Vincula a una persona con una organizacion. Si el email todavia no tiene
 * usuario, se crea con la contrasena provista.
 */
export const linkOrganizationMemberSchema = z
  .object({
    organizationId: z.string().uuid(),
    email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
    fullName: z.string().trim().max(120).optional().default(""),
    password: z.string().trim().max(128).optional().default(""),
    role: z.enum(organizationRoles)
  })
  .refine((value) => value.password === "" || value.password.length >= 8, {
    message: "La contrasena debe tener al menos 8 caracteres.",
    path: ["password"]
  });

export const updateOrganizationMemberSchema = z.object({
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(organizationRoles),
  active: booleanFieldSchema
});

export const removeOrganizationMemberSchema = z.object({
  organizationId: z.string().uuid(),
  userId: z.string().uuid()
});

export const deleteOrganizationSchema = z.object({
  organizationId: z.string().uuid()
});

export type CreateOrganizationCommand = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganizationCommand = z.infer<typeof updateOrganizationSchema>;
export type LinkOrganizationMemberCommand = z.infer<typeof linkOrganizationMemberSchema>;

export const platformNoticeMessages: Record<string, string> = {
  organization_created: "Organizacion creada.",
  catalog_copied: "Catalogo copiado correctamente.",
  organization_saved: "Organizacion actualizada.",
  organization_deleted: "Organizacion eliminada.",
  member_linked: "Usuario vinculado a la organizacion.",
  member_saved: "Membresia actualizada.",
  member_removed: "Usuario desvinculado.",
  [platformDomainErrors.forbidden]: "Solo un super usuario puede administrar organizaciones.",
  [platformDomainErrors.invalidInput]: "Revisa los datos: hay algun campo invalido.",
  [platformDomainErrors.slugTaken]: "Ya existe una organizacion con ese identificador.",
  [platformDomainErrors.organizationNotFound]: "No se encontro la organizacion.",
  [platformDomainErrors.organizationHasData]:
    "La organizacion tiene proyectos o pedidos cargados: desactivala en lugar de eliminarla.",
  [platformDomainErrors.memberNotFound]: "No se encontro la membresia.",
  [platformDomainErrors.catalogCopyFailed]: "No se pudo copiar el catalogo.",
  [platformDomainErrors.catalogAlreadyExists]: "La organizacion ya tiene materiales cargados.",
  [platformDomainErrors.userCreateFailed]:
    "No se pudo crear el usuario. Si es nuevo, indica nombre y una contrasena de 8 caracteres o mas.",
  [platformDomainErrors.saveFailed]: "No se pudo guardar el cambio."
};

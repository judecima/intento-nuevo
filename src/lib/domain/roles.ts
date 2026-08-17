export const organizationRoles = ["customer", "seller", "operator", "admin"] as const;

export type OrganizationRole = (typeof organizationRoles)[number];

export const roleLabels: Record<OrganizationRole, string> = {
  customer: "Cliente",
  seller: "Vendedor",
  operator: "Operario",
  admin: "Administrador"
};

export function isOrganizationRole(value: string): value is OrganizationRole {
  return organizationRoles.includes(value as OrganizationRole);
}

export function hasAnyRole(
  role: OrganizationRole | null | undefined,
  allowed: readonly OrganizationRole[]
): boolean {
  return Boolean(role && allowed.includes(role));
}

export function getDefaultRouteForRole(role: OrganizationRole | null | undefined): string {
  if (role === "seller") return "/sales/orders";
  if (role === "operator") return "/production";
  if (role === "admin") return "/admin/users";
  return "/dashboard";
}

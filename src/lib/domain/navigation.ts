import type { OrganizationRole } from "./roles";

export const navigationGroups = ["general", "projects", "sales", "production", "admin"] as const;

export type NavigationGroup = (typeof navigationGroups)[number];

export const navigationGroupLabels: Record<NavigationGroup, string> = {
  general: "General",
  projects: "Proyectos",
  sales: "Ventas",
  production: "Produccion",
  admin: "Administracion"
};

export type NavigationItem = {
  href: string;
  label: string;
  group: NavigationGroup;
  roles: readonly OrganizationRole[];
  /** Solo para el super usuario de plataforma, sin importar su rol en la organizacion. */
  platformOnly?: boolean;
  /** Visible tambien para el super usuario aunque no tenga rol de tenant. */
  platformAccessible?: boolean;
};

export const navigationItems: readonly NavigationItem[] = [
  {
    href: "/admin/organizations",
    label: "Organizaciones",
    group: "admin",
    roles: [],
    platformOnly: true
  },
  {
    href: "/dashboard",
    label: "Dashboard",
    group: "general",
    roles: ["customer", "seller", "operator", "admin"],
    platformAccessible: true
  },
  { href: "/process", label: "Proceso pedidos", group: "general", roles: ["seller", "operator", "admin"] },
  {
    href: "/projects",
    label: "Mis proyectos",
    group: "projects",
    roles: ["customer", "seller", "admin"],
    platformAccessible: true
  },
  {
    href: "/projects/new",
    label: "Nuevo proyecto",
    group: "projects",
    roles: ["customer", "admin"],
    platformAccessible: true
  },
  { href: "/orders", label: "Mis pedidos", group: "projects", roles: ["customer", "admin"] },
  { href: "/sales/orders", label: "Pedidos pendientes", group: "sales", roles: ["seller", "admin"] },
  { href: "/sales/review", label: "En revision", group: "sales", roles: ["seller", "admin"] },
  { href: "/sales/approved", label: "Aprobados", group: "sales", roles: ["seller", "admin"] },
  { href: "/sales/customers", label: "Clientes", group: "sales", roles: ["seller", "admin"] },
  { href: "/production", label: "Cola de produccion", group: "production", roles: ["operator", "admin"] },
  { href: "/production/approved", label: "Aprobados", group: "production", roles: ["operator", "admin"] },
  { href: "/production/active", label: "En produccion", group: "production", roles: ["operator", "admin"] },
  { href: "/production/completed", label: "Finalizados", group: "production", roles: ["operator", "admin"] },
  { href: "/admin/users", label: "Usuarios", group: "admin", roles: ["admin"] },
  { href: "/admin/materials", label: "Materiales", group: "admin", roles: ["admin"] },
  { href: "/admin/machines", label: "Maquinas", group: "admin", roles: ["admin"] },
  { href: "/admin/settings", label: "Configuracion", group: "admin", roles: ["admin"], platformAccessible: true },
  { href: "/admin/audit", label: "Auditoria", group: "admin", roles: ["admin"] }
];

export function getNavigationForRole(
  role: OrganizationRole | null | undefined,
  options: { platformAdmin?: boolean } = {}
): NavigationItem[] {
  const platformItems = options.platformAdmin
    ? navigationItems.filter((item) => item.platformOnly || item.platformAccessible)
    : [];

  // El super usuario puede no ser miembro de ninguna organizacion: sus accesos
  // de plataforma no dependen del rol de tenant.
  const roleItems = role
    ? navigationItems.filter((item) => !item.platformOnly && item.roles.includes(role))
    : navigationItems.filter((item) => item.href === "/dashboard");

  return uniqueNavigationItems([...roleItems, ...platformItems]);
}

function uniqueNavigationItems(items: NavigationItem[]): NavigationItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.href)) return false;
    seen.add(item.href);
    return true;
  });
}

export function groupNavigation(
  items: NavigationItem[]
): Array<{ group: NavigationGroup; label: string; items: NavigationItem[] }> {
  return navigationGroups
    .map((group) => ({
      group,
      label: navigationGroupLabels[group],
      items: items.filter((item) => item.group === group)
    }))
    .filter((entry) => entry.items.length > 0);
}

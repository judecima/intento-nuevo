import type { IconName } from "@/components/ui/icons";
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
  /** Una linea que explica que se hace aca. Se muestra en el menu movil. */
  hint: string;
  icon: IconName;
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
    hint: "Alta y configuracion de cada empresa de la plataforma",
    icon: "organizations",
    group: "admin",
    roles: [],
    platformOnly: true
  },
  {
    href: "/dashboard",
    label: "Dashboard",
    hint: "Resumen de cortes y estado general",
    icon: "dashboard",
    group: "general",
    roles: ["customer", "seller", "operator", "admin"],
    platformAccessible: true
  },
  {
    href: "/process",
    // Antes "Proceso pedidos": se confundia con "Mis pedidos" y "Pedidos
    // pendientes". Esta pantalla no procesa nada, muestra el pipeline completo.
    label: "Seguimiento de pedidos",
    hint: "Todos los pedidos y en que etapa esta cada uno",
    icon: "process",
    group: "general",
    roles: ["seller", "operator", "admin"]
  },
  {
    href: "/projects",
    label: "Mis proyectos",
    hint: "Proyectos con sus piezas y su plano de corte",
    icon: "projects",
    group: "projects",
    roles: ["customer", "seller", "admin"],
    platformAccessible: true
  },
  {
    href: "/projects/new",
    label: "Nuevo proyecto",
    hint: "Elegi tablero y arranca una carga de piezas",
    icon: "newProject",
    group: "projects",
    roles: ["customer", "admin"],
    platformAccessible: true
  },
  {
    href: "/orders",
    label: "Mis pedidos",
    hint: "Pedidos que enviaste y su estado",
    icon: "orders",
    group: "projects",
    roles: ["customer", "admin"]
  },
  {
    href: "/sales/orders",
    label: "Pedidos pendientes",
    hint: "Pedidos esperando tu revision",
    icon: "salesOrders",
    group: "sales",
    roles: ["seller", "admin"]
  },
  {
    href: "/sales/approved",
    // Antes "Aprobados", igual que el item de Produccion.
    label: "Pedidos aprobados",
    hint: "Pedidos que ya aprobaste y pasaron a produccion",
    icon: "salesApproved",
    group: "sales",
    roles: ["seller", "admin"]
  },
  {
    href: "/sales/customers",
    label: "Clientes",
    hint: "Cuentas de cliente de la organizacion",
    icon: "customers",
    group: "sales",
    roles: ["seller", "admin"]
  },
  {
    href: "/production",
    label: "Cola de produccion",
    hint: "Trabajos en la maquina ahora mismo",
    icon: "queue",
    group: "production",
    roles: ["operator", "admin"]
  },
  {
    href: "/production/approved",
    // Antes "Aprobados", igual que el item de Ventas.
    label: "Listos para cortar",
    hint: "Aprobados por ventas, todavia sin arrancar",
    icon: "approved",
    group: "production",
    roles: ["operator", "admin"]
  },
  {
    href: "/production/active",
    label: "En produccion",
    hint: "Trabajos con el corte ya iniciado",
    icon: "cutting",
    group: "production",
    roles: ["operator", "admin"]
  },
  {
    href: "/production/edgebanding",
    label: "Pegado de canto",
    hint: "Cortados, esperando tapacanto",
    icon: "edgebanding",
    group: "production",
    roles: ["operator", "admin"]
  },
  {
    href: "/production/completed",
    label: "Finalizados",
    hint: "Trabajos cerrados y listos para entregar",
    icon: "completed",
    group: "production",
    roles: ["operator", "admin"]
  },
  {
    href: "/admin/users",
    label: "Usuarios",
    hint: "Altas, roles y permisos",
    icon: "users",
    group: "admin",
    roles: ["admin"]
  },
  {
    href: "/admin/materials",
    label: "Materiales",
    hint: "Catalogo de tableros y sus medidas",
    icon: "materials",
    group: "admin",
    roles: ["admin"]
  },
  {
    href: "/admin/machines",
    label: "Maquinas",
    hint: "Perfiles de seccionadora y parametros de corte",
    icon: "machines",
    group: "admin",
    roles: ["admin"]
  },
  {
    href: "/admin/settings",
    label: "Configuracion",
    hint: "Marca, tiempos de entrega y preferencias",
    icon: "settings",
    group: "admin",
    roles: ["admin"],
    platformAccessible: true
  },
  {
    href: "/admin/audit",
    label: "Auditoria",
    hint: "Registro de quien hizo que y cuando",
    icon: "audit",
    group: "admin",
    roles: ["admin"]
  }
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

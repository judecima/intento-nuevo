export const PLATFORM_SLUG = "jadsi";

export type RouteScopeKind = "platform" | "organization";

export type RouteScope = {
  slug: string;
  kind: RouteScopeKind;
  basePath: string;
};

export const dashboardRoutePrefixes = [
  "/dashboard",
  "/process",
  "/projects",
  "/orders",
  "/sales",
  "/production",
  "/admin",
  "/logout"
] as const;

export function normalizeSlug(value: string): string {
  return value.trim().toLowerCase();
}

export function routeScopeFromSlug(slug: string): RouteScope {
  const normalized = normalizeSlug(slug);
  return {
    slug: normalized,
    kind: normalized === PLATFORM_SLUG ? "platform" : "organization",
    basePath: `/${encodeURIComponent(normalized)}`
  };
}

export function toScopedPath(basePath: string | null | undefined, path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  if (isExternalPath(path)) return path;

  const normalizedBase = normalizeBasePath(basePath);
  if (!normalizedBase) return path;
  if (path === normalizedBase || path.startsWith(`${normalizedBase}/`) || path.startsWith(`${normalizedBase}?`)) {
    return path;
  }

  return `${normalizedBase}${path}`;
}

export function organizationPath(slug: string, path: string): string {
  return toScopedPath(`/${encodeURIComponent(normalizeSlug(slug))}`, path);
}

export function platformPath(path: string): string {
  return toScopedPath(`/${PLATFORM_SLUG}`, path);
}

export function isDashboardRoutePath(pathname: string): boolean {
  return dashboardRoutePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function normalizeBasePath(basePath: string | null | undefined): string {
  if (!basePath || basePath === "/") return "";
  const trimmed = basePath.trim();
  if (!trimmed || trimmed === "/") return "";
  return trimmed.startsWith("/") ? trimmed.replace(/\/+$/, "") : `/${trimmed.replace(/\/+$/, "")}`;
}

function isExternalPath(path: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(path);
}

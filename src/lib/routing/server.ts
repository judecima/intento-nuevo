import { headers } from "next/headers";
import { routeScopeFromSlug, toScopedPath, type RouteScope } from "./routes";

export function getRouteScopeFromHeaders(): RouteScope | null {
  const slug = headers().get("x-route-scope");
  return slug ? routeScopeFromSlug(slug) : null;
}

export function scopedPath(path: string): string {
  return toScopedPath(getRouteScopeFromHeaders()?.basePath, path);
}

export function scopedReturnPath(path: string): string {
  return scopedPath(path);
}

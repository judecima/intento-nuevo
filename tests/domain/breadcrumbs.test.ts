import { describe, expect, it } from "vitest";
import { buildCrumbs } from "@/lib/domain/breadcrumbs";
import { getNavigationForRole } from "@/lib/domain/navigation";

const adminNav = getNavigationForRole("admin");

function scoped(basePath: string) {
  return adminNav.map((item) => ({ ...item, href: `${basePath}${item.href}` }));
}

describe("buildCrumbs", () => {
  it("muestra grupo y seccion en una ruta de navegacion exacta", () => {
    expect(buildCrumbs("/production/approved", adminNav, "")).toEqual([
      { label: "Produccion" },
      { label: "Listos para cortar" }
    ]);
  });

  it("marca la seccion padre como enlace en una sub-ruta", () => {
    expect(buildCrumbs("/projects/abc-123", adminNav, "")).toEqual([
      { label: "Proyectos" },
      { label: "Mis proyectos", href: "/projects" },
      { label: "Detalle del proyecto" }
    ]);
  });

  it("elige el item mas especifico cuando varios son prefijo", () => {
    const crumbs = buildCrumbs("/projects/abc-123/labels", adminNav, "");
    expect(crumbs[1]).toEqual({ label: "Mis proyectos", href: "/projects" });
    expect(crumbs[2]).toEqual({ label: "Etiquetas" });
  });

  it("resuelve sub-rutas cuando la organizacion prefija el path", () => {
    const basePath = "/o/taller-demo";
    expect(buildCrumbs(`${basePath}/projects/abc-123`, scoped(basePath), basePath)).toEqual([
      { label: "Proyectos" },
      { label: "Mis proyectos", href: `${basePath}/projects` },
      { label: "Detalle del proyecto" }
    ]);
  });

  it("no inventa una ruta para pantallas fuera de la navegacion", () => {
    expect(buildCrumbs("/ui-preview", adminNav, "")).toEqual([]);
  });

  it("solo usa items visibles para el rol", () => {
    const customerNav = getNavigationForRole("customer");
    expect(buildCrumbs("/production/approved", customerNav, "")).toEqual([]);
  });
});

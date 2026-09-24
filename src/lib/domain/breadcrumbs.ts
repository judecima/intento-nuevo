import { navigationGroupLabels, type NavigationItem } from "./navigation";

export type Crumb = { label: string; href?: string };

/**
 * Sub-rutas que no son items de navegacion pero si pantallas donde el usuario
 * puede quedar sin referencia de donde esta. Se comparan contra el path ya sin
 * el prefijo de organizacion.
 */
const nestedLabels: Array<{ match: RegExp; label: string }> = [
  { match: /^\/projects\/[^/]+\/labels$/, label: "Etiquetas" },
  { match: /^\/projects\/[^/]+$/, label: "Detalle del proyecto" },
  { match: /^\/optimizer\/telemetry$/, label: "Telemetria del optimizador" },
  { match: /^\/sales\/review\/[^/]+$/, label: "Revision del pedido" },
  { match: /^\/sales\/review$/, label: "Revision de pedidos" }
];

/**
 * Arma la ruta visible de la pantalla actual.
 *
 * `items` ya viene con el prefijo de organizacion aplicado, asi que para
 * comparar contra los patrones de sub-ruta hace falta el path canonico.
 */
export function buildCrumbs(pathname: string, items: NavigationItem[], basePath: string): Crumb[] {
  const canonical = basePath && pathname.startsWith(basePath) ? pathname.slice(basePath.length) || "/" : pathname;

  const exact = items.find((item) => item.href === pathname);
  if (exact) {
    return [{ label: navigationGroupLabels[exact.group] }, { label: exact.label }];
  }

  // La seccion padre es el item de navegacion mas especifico que sea prefijo.
  const parent = items
    .filter((item) => pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];

  const nested = nestedLabels.find((entry) => entry.match.test(canonical));

  if (parent) {
    return [
      { label: navigationGroupLabels[parent.group] },
      { label: parent.label, href: parent.href },
      { label: nested?.label ?? "Detalle" }
    ];
  }

  return nested ? [{ label: nested.label }] : [];
}

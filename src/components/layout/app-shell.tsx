/* eslint-disable @next/next/no-img-element -- logo URL is tenant-configured and may be external. */
import Link from "next/link";
import type { AppUserContext } from "@/lib/auth/context";
import { brandThemeCssText, brandThemeStyle } from "@/lib/branding/theme";
import { getNavigationForRole } from "@/lib/domain/navigation";
import { roleLabels } from "@/lib/domain/roles";
import { toScopedPath } from "@/lib/routing/routes";
import { RailNav } from "./rail-nav";

type AppShellProps = {
  context: AppUserContext;
  children: React.ReactNode;
};

export function AppShell({ context, children }: AppShellProps) {
  const basePath = context.routeBasePath;
  const platformMode = context.routeScope?.kind === "platform" && context.isPlatformAdmin;
  const nav = getNavigationForRole(context.role, { platformAdmin: platformMode }).map((item) => ({
    ...item,
    href: toScopedPath(basePath, item.href)
  }));
  const displayName = context.profile?.full_name ?? context.profile?.email ?? context.user?.email ?? "Sesion no iniciada";
  // El super usuario no depende de una organizacion: opera sobre todas.
  const organizationName =
    context.activeOrganization?.name ?? (platformMode ? "Todas las organizaciones" : "Sin organizacion");
  const roleName = context.isPlatformAdmin
    ? context.platformBranding.legalName
    : context.role
      ? roleLabels[context.role]
      : "Sin rol";
  const appBranding = platformMode || !context.activeOrganization
    ? {
        name: context.platformBranding.legalName,
        primaryColor: context.platformBranding.primaryColor,
        secondaryColor: context.platformBranding.secondaryColor,
        logoUrl: context.platformBranding.logoUrl
      }
    : {
        name: context.activeOrganization.name,
        primaryColor: context.activeOrganization.primary_color,
        secondaryColor: context.activeOrganization.secondary_color,
        logoUrl: context.activeOrganization.logo_url
      };
  const initials = displayName
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  const brandStyle = brandThemeStyle(appBranding);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `:root{${brandThemeCssText(appBranding)}}` }} />
      <div style={brandStyle} className="min-h-screen bg-[var(--md-surface)] text-[var(--ink)] lg:grid lg:grid-cols-[276px_1fr]">
        {/* Drawer sobre superficie oscura: los tokens `rail-*` son el esquema
            oscuro del sistema, para que el texto claro tenga siempre contraste. */}
        <aside className="no-print border-r border-[var(--rail-outline)] bg-[var(--rail)] px-3 py-5 text-[var(--rail-on)] lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
        <Link href={toScopedPath(basePath, "/dashboard")} className="focus-ring block rounded-[var(--r-lg)] px-4 py-1">
          <div className="flex items-center gap-3">
            {appBranding.logoUrl ? (
              <img src={appBranding.logoUrl} alt={`Logo de ${appBranding.name}`} className="h-10 w-10 rounded-lg bg-transparent object-contain p-1" />
            ) : null}
            <div className="text-[20px] font-medium tracking-[0] text-white">{appBranding.name}</div>
            <div className="text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--accent)]">SaaS</div>
          </div>
          <p className="mt-1.5 max-w-[30ch] text-[12px] leading-[16px] text-[var(--rail-on-variant)]">
            Optimizacion de tableros, pedidos y produccion listos para seccionadora.
          </p>
        </Link>

        <div className="mt-4 border-t border-[var(--rail-outline)] pt-2">
          <RailNav items={nav} />
        </div>
      </aside>

      <div className="min-w-0">
        <header className="no-print sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--md-surface-container-low)]/95 px-5 py-3 shadow-sm backdrop-blur md:px-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="eyebrow-muted">Organizacion</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <span className="truncate text-[15px] font-semibold">{organizationName}</span>
                {platformMode ? (
                  <Link href={toScopedPath(basePath, "/admin/organizations")} className="badge badge-accent focus-ring">
                    {appBranding.name}
                  </Link>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden text-right md:block">
                <div className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-[var(--muted)]">{roleName}</div>
                <div className="max-w-[240px] truncate text-[13px]">{displayName}</div>
              </div>
              <div
                aria-hidden
                className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[var(--md-primary-container)] font-mono text-[13px] font-medium text-[var(--md-on-primary-container)]"
              >
                {initials || "-"}
              </div>
              {context.user ? (
                <form action={toScopedPath(basePath, "/logout")} method="post">
                  <button className="btn btn-sm focus-ring" type="submit">
                    Salir
                  </button>
                </form>
              ) : (
                <Link className="btn btn-sm btn-primary focus-ring" href={toScopedPath(basePath, "/login")}>
                  Ingresar
                </Link>
              )}
            </div>
          </div>
          {context.loadError ? (
            <div className="mt-3 rounded-[var(--r)] border-l-4 border-[var(--danger)] bg-[var(--alerta-suave)] px-3 py-2 text-sm text-[var(--md-on-error-container)]">
              {context.loadError}
            </div>
          ) : null}
        </header>

        <main className="px-5 py-6 md:px-7">{children}</main>
      </div>
      </div>
    </>
  );
}

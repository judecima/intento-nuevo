/* eslint-disable @next/next/no-img-element -- logo URL is tenant-configured and may be external. */
import Link from "next/link";
import type { AppUserContext } from "@/lib/auth/context";
import { getNavigationForRole } from "@/lib/domain/navigation";
import { roleLabels } from "@/lib/domain/roles";
import { RailNav } from "./rail-nav";

type AppShellProps = {
  context: AppUserContext;
  children: React.ReactNode;
};

export function AppShell({ context, children }: AppShellProps) {
  const nav = getNavigationForRole(context.role, { platformAdmin: context.isPlatformAdmin });
  const displayName = context.profile?.full_name ?? context.user?.email ?? "Sesion no iniciada";
  // El super usuario no depende de una organizacion: opera sobre todas.
  const organizationName =
    context.activeOrganization?.name ?? (context.isPlatformAdmin ? "Todas las organizaciones" : "Sin organizacion");
  const roleName = context.role ? roleLabels[context.role] : context.isPlatformAdmin ? "Plataforma" : "Sin rol";
  const appBranding = context.isPlatformAdmin || !context.activeOrganization
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
  const brandStyle = {
    "--brand-primary": appBranding.primaryColor || "#12666b",
    "--brand-secondary": appBranding.secondaryColor || "#f5b301"
  } as React.CSSProperties;

  return (
    <div style={brandStyle} className="min-h-screen text-[var(--ink)] lg:grid lg:grid-cols-[276px_1fr]">
      {/* Drawer sobre superficie oscura: los tokens `rail-*` son el esquema
          oscuro del sistema, para que el texto claro tenga siempre contraste. */}
      <aside className="no-print bg-[var(--rail)] px-3 py-5 text-[var(--rail-on)] lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
        <Link href="/dashboard" className="focus-ring block rounded-[var(--r-lg)] px-4 py-1">
          <div className="flex items-center gap-3">
            {appBranding.logoUrl ? (
              <img src={appBranding.logoUrl} alt={`Logo de ${appBranding.name}`} className="h-10 w-10 rounded-[var(--r)] bg-white object-contain p-1" />
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
        <header className="no-print sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--md-surface-container-low)] px-5 py-3 md:px-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="eyebrow-muted">Organizacion</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <span className="truncate text-[15px] font-semibold">{organizationName}</span>
                {context.isPlatformAdmin ? (
                  <Link href="/admin/organizations" className="badge badge-accent focus-ring">
                    Super usuario
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
                {initials || "—"}
              </div>
              {context.user ? (
                <Link className="btn btn-sm focus-ring" href="/logout">
                  Salir
                </Link>
              ) : (
                <Link className="btn btn-sm btn-primary focus-ring" href="/login">
                  Ingresar
                </Link>
              )}
            </div>
          </div>
          {context.loadError ? (
            <div className="mt-3 rounded-[var(--r)] border-l-4 border-[var(--danger)] bg-[var(--alerta-suave)] px-3 py-2 text-sm text-[#8d3220]">
              {context.loadError}
            </div>
          ) : null}
        </header>

        <main className="px-5 py-6 md:px-7">{children}</main>
      </div>
    </div>
  );
}

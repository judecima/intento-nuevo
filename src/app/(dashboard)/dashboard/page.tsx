import Link from "next/link";
import { CutMetricsPanel } from "@/components/dashboard/cut-metrics-panel";
import { SurfaceTitle } from "@/components/ui/material";
import { getCurrentUserContext } from "@/lib/auth/context";
import { getCutDashboardMetrics } from "@/lib/dashboard/cut-metrics";
import { canManagePlatform } from "@/lib/domain/platform";
import { roleLabels } from "@/lib/domain/roles";
import { toScopedPath } from "@/lib/routing/routes";

export default async function DashboardPage() {
  const context = await getCurrentUserContext();
  const cutMetrics = await getCutDashboardMetrics(context);
  const platformAdmin = canManagePlatform(context);
  const role = context.isPlatformAdmin
    ? context.platformBranding.legalName
    : context.role
      ? roleLabels[context.role]
      : "Sin rol";
  const basePath = context.routeBasePath;

  return (
    <section className="max-w-7xl space-y-5">
      <SurfaceTitle
        eyebrow="Resumen"
        title="Dashboard"
        description="Cortes contabilizados cuando el pedido sale de produccion hacia pegado de canto o finalizado."
      />

      <div className="grid gap-3 md:grid-cols-3">
        <InfoCard label="Rol activo" value={role}>
          {platformAdmin && context.role ? `Ademas podes administrar ${context.platformBranding.legalName}.` : null}
        </InfoCard>
        <InfoCard label="Organizacion" value={context.activeOrganization?.name ?? (platformAdmin ? "Todas" : "Pendiente")} />
        <InfoCard label="Plataforma" value={platformAdmin ? null : "Base lista"}>
          {platformAdmin ? (
            <Link href={toScopedPath(basePath, "/admin/organizations")} className="text-[var(--teal)] hover:underline">
              Administrar organizaciones
            </Link>
          ) : null}
        </InfoCard>
      </div>

      <CutMetricsPanel metrics={cutMetrics} />

      {platformAdmin ? (
        <p className="hint max-w-2xl">
          Desde {context.platformBranding.legalName} podes crear organizaciones, dar de alta usuarios de cualquier rol y
          crear proyectos para cualquiera de ellas desde el selector de organizacion en Proyectos.
        </p>
      ) : null}
    </section>
  );
}

function InfoCard({
  label,
  value,
  children
}: {
  label: string;
  value: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--md-surface-container-lowest)] p-4 shadow-sm">
      <div className="eyebrow-muted">{label}</div>
      {value ? <div className="mt-1 text-lg font-medium text-[var(--ink)]">{value}</div> : null}
      {children ? <div className="hint mt-1">{children}</div> : null}
    </div>
  );
}

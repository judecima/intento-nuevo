import Link from "next/link";
import { SectionPlaceholder } from "@/components/layout/section-placeholder";
import { getCurrentUserContext } from "@/lib/auth/context";
import { canManagePlatform } from "@/lib/domain/platform";
import { roleLabels } from "@/lib/domain/roles";

export default async function DashboardPage() {
  const context = await getCurrentUserContext();
  const platformAdmin = canManagePlatform(context);
  const role = context.role ? roleLabels[context.role] : platformAdmin ? "Super usuario" : "Sin rol";

  return (
    <SectionPlaceholder title="Dashboard" eyebrow="Resumen">
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <div className="eyebrow-muted">Rol activo</div>
          <div className="mt-1 text-lg font-medium text-[var(--ink)]">{role}</div>
          {platformAdmin && context.role ? (
            <div className="hint mt-1">Ademas sos super usuario de la plataforma.</div>
          ) : null}
        </div>
        <div>
          <div className="eyebrow-muted">Organizacion</div>
          <div className="mt-1 text-lg font-medium text-[var(--ink)]">
            {context.activeOrganization?.name ?? (platformAdmin ? "Todas" : "Pendiente")}
          </div>
        </div>
        <div>
          <div className="eyebrow-muted">Plataforma</div>
          <div className="mt-1 text-lg font-medium text-[var(--ink)]">
            {platformAdmin ? (
              <Link href="/admin/organizations" className="text-[var(--teal)] hover:underline">
                Administrar organizaciones
              </Link>
            ) : (
              "Base lista"
            )}
          </div>
        </div>
      </div>

      {platformAdmin ? (
        <p className="hint mt-4 max-w-2xl">
          Como super usuario podes crear organizaciones, dar de alta usuarios de cualquier rol y crear proyectos para
          cualquiera de ellas desde el selector de organizacion en Proyectos.
        </p>
      ) : null}
    </SectionPlaceholder>
  );
}

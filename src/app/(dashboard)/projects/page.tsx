import Link from "next/link";
import { OrganizationScopePicker } from "@/components/projects/organization-scope-picker";
import { ProjectTable } from "@/components/projects/project-table";
import { listPlatformOrganizations } from "@/lib/admin/platform";
import { getCurrentUserContext } from "@/lib/auth/context";
import { canManagePlatform } from "@/lib/domain/platform";
import { listProjectsForOrganization } from "@/lib/projects/queries";

type ProjectsPageProps = {
  searchParams?: {
    organizationId?: string | string[];
  };
};

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const context = await getCurrentUserContext();
  const platformAdmin = canManagePlatform(context);

  const organizations = platformAdmin
    ? (await listPlatformOrganizations(context)).map((organization) => ({
        id: organization.id,
        name: organization.name,
        slug: organization.slug
      }))
    : [];

  const requestedId = Array.isArray(searchParams?.organizationId)
    ? searchParams?.organizationId[0]
    : searchParams?.organizationId;
  const organizationId = platformAdmin
    ? organizations.find((organization) => organization.id === requestedId)?.id ??
      context.activeOrganization?.id ??
      organizations[0]?.id
    : context.activeOrganization?.id;

  if (!organizationId) {
    return (
      <section className="max-w-6xl">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--teal)]">Cliente</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Mis proyectos</h1>
        <div className="mt-5 border border-[var(--line)] bg-white p-5 text-sm text-[var(--muted)]">
          El usuario no tiene una organizacion activa.
        </div>
      </section>
    );
  }

  const projects = await listProjectsForOrganization(organizationId);
  const scopedOrganization = organizations.find((organization) => organization.id === organizationId) ?? null;

  return (
    <section className="max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--teal)]">Cliente</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Mis proyectos</h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
            Proyectos editables con material, parametros de corte y piezas persistidas.
          </p>
        </div>
        <Link href="/projects/new" className="focus-ring rounded bg-[var(--teal)] px-4 py-3 text-sm font-semibold text-white">
          Nuevo proyecto
        </Link>
      </div>

      {platformAdmin ? (
        <OrganizationScopePicker
          action="/projects"
          organizations={organizations}
          selectedId={organizationId}
          label="Ver proyectos de"
        />
      ) : null}

      {scopedOrganization && scopedOrganization.id !== context.activeOrganization?.id ? (
        <p className="hint">Estas viendo los proyectos de {scopedOrganization.name}.</p>
      ) : null}

      <ProjectTable projects={projects} />
    </section>
  );
}

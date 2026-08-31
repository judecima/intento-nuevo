import Link from "next/link";
import { OrganizationScopePicker } from "@/components/projects/organization-scope-picker";
import { ProjectTable } from "@/components/projects/project-table";
import { SurfaceCard, SurfaceTitle } from "@/components/ui/material";
import { listPlatformOrganizations } from "@/lib/admin/platform";
import { getCurrentUserContext } from "@/lib/auth/context";
import { canManagePlatform } from "@/lib/domain/platform";
import { toScopedPath } from "@/lib/routing/routes";
import { listProjectsForOrganization } from "@/lib/projects/queries";

type ProjectsPageProps = {
  searchParams?: {
    organizationId?: string | string[];
  };
};

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const context = await getCurrentUserContext();
  const platformAdmin = canManagePlatform(context);
  const basePath = context.routeBasePath;

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
        <SurfaceTitle eyebrow="Cliente" title="Mis proyectos" />
        <SurfaceCard className="mt-5" bodyClassName="p-5 text-sm text-[var(--muted)]">
          El usuario no tiene una organizacion activa.
        </SurfaceCard>
      </section>
    );
  }

  const projects = await listProjectsForOrganization(organizationId, context.role === "seller" ? context.user?.id : undefined);
  const scopedOrganization = organizations.find((organization) => organization.id === organizationId) ?? null;

  return (
    <section className="max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <SurfaceTitle
          eyebrow="Cliente"
          title="Mis proyectos"
          description="Proyectos editables con material, parametros de corte y piezas persistidas."
        />
        <Link href={toScopedPath(basePath, "/projects/new")} className="btn btn-primary focus-ring">
          Nuevo proyecto
        </Link>
      </div>

      {platformAdmin ? (
        <OrganizationScopePicker
          action={toScopedPath(basePath, "/projects")}
          organizations={organizations}
          selectedId={organizationId}
          label="Ver proyectos de"
        />
      ) : null}

      {scopedOrganization && scopedOrganization.id !== context.activeOrganization?.id ? (
        <p className="hint">Estas viendo los proyectos de {scopedOrganization.name}.</p>
      ) : null}

      <ProjectTable projects={projects} basePath={basePath} />
    </section>
  );
}

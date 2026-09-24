import Link from "next/link";
import { OrganizationScopePicker } from "@/components/projects/organization-scope-picker";
import { ProjectTable } from "@/components/projects/project-table";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
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
      <section className="page">
        <PageHeader eyebrow="Cliente" title="Mis proyectos" />
        <Notice kind="error">El usuario no tiene una organizacion activa.</Notice>
      </section>
    );
  }

  const projects = await listProjectsForOrganization(organizationId, context.role === "seller" ? context.user?.id : undefined);
  const scopedOrganization = organizations.find((organization) => organization.id === organizationId) ?? null;

  return (
    <section className="page">
      <PageHeader
        eyebrow="Cliente"
        title="Mis proyectos"
        description="Cada proyecto guarda su tablero, sus piezas y su plano de corte. Abri uno para seguir editandolo o enviarlo como pedido."
        actions={
          <Link href={toScopedPath(basePath, "/projects/new")} className="btn btn-primary focus-ring">
            Nuevo proyecto
          </Link>
        }
      />

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

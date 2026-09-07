import { NewProjectForm } from "@/components/projects/new-project-form";
import { OrganizationScopePicker } from "@/components/projects/organization-scope-picker";
import { SurfaceCard, SurfaceTitle } from "@/components/ui/material";
import { listPlatformOrganizations } from "@/lib/admin/platform";
import { getCurrentUserContext } from "@/lib/auth/context";
import { canManagePlatform } from "@/lib/domain/platform";
import { toScopedPath } from "@/lib/routing/routes";
import { listBoardMaterialsForOrganization } from "@/lib/materials/queries";
import { getDefaultMachineCutSettings } from "@/lib/production/queries";
import { listOrganizationCustomers } from "@/lib/customers/queries";

type NewProjectPageProps = {
  searchParams?: {
    organizationId?: string | string[];
  };
};

export default async function NewProjectPage({ searchParams }: NewProjectPageProps) {
  const context = await getCurrentUserContext();
  const platformAdmin = canManagePlatform(context);
  const basePath = context.routeBasePath;

  // El super usuario puede crear el proyecto para cualquier organizacion.
  const organizations = platformAdmin
    ? (await listPlatformOrganizations(context))
        .filter((organization) => organization.active)
        .map((organization) => ({ id: organization.id, name: organization.name, slug: organization.slug }))
    : [];

  const requestedId = first(searchParams?.organizationId);
  const targetOrganizationId = platformAdmin
    ? organizations.find((organization) => organization.id === requestedId)?.id ??
      context.activeOrganization?.id ??
      organizations[0]?.id
    : context.activeOrganization?.id;

  if (!targetOrganizationId) {
    return (
      <section className="max-w-6xl">
        <SurfaceTitle eyebrow="Cliente" title="Nuevo proyecto" />
        <SurfaceCard className="mt-5" bodyClassName="p-5 text-sm text-[var(--muted)]">
          El usuario no tiene una organizacion activa.
        </SurfaceCard>
      </section>
    );
  }

  const targetOrganization = organizations.find((organization) => organization.id === targetOrganizationId) ?? null;
  const boardMaterials = await listBoardMaterialsForOrganization(targetOrganizationId);
  const machineSettings = await getDefaultMachineCutSettings(targetOrganizationId);
  const salesUser = context.role === "seller" || context.role === "admin";
  const customers = salesUser ? await listOrganizationCustomers(targetOrganizationId) : [];

  return (
    <section className="mx-auto max-w-[1200px] space-y-5">
      <SurfaceTitle
        eyebrow="Cliente"
        title="Nuevo proyecto"
        description={`Elegi el tablero del catalogo y crea un proyecto editable con sus piezas${
          targetOrganization ? ` para ${targetOrganization.name}.` : "."
        }`}
      />

      {platformAdmin ? (
        <OrganizationScopePicker
          action={toScopedPath(basePath, "/projects/new")}
          organizations={organizations}
          selectedId={targetOrganizationId}
          label="Crear el proyecto para"
        />
      ) : null}

      <NewProjectForm
        organizationId={platformAdmin ? targetOrganizationId : undefined}
        customers={customers}
        requiresCustomer={context.role === "seller"}
        machineSettings={machineSettings}
        materials={boardMaterials.map((material) => ({
          id: material.id,
          code: material.code,
          description: material.description,
          width: Number(material.width),
          height: Number(material.height),
          thickness: Number(material.thickness),
          hasGrain: Boolean(material.has_grain),
          dimensionsLabel: material.dimensionsLabel,
          imageUrl: material.displayImageUrl
        }))}
      />
    </section>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

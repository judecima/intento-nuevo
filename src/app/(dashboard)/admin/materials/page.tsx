import Link from "next/link";
import { MaterialAdminForm } from "@/components/materials/material-admin-form";
import { MaterialAdminTable } from "@/components/materials/material-admin-table";
import { MaterialGallery } from "@/components/materials/material-gallery";
import { OrganizationScopePicker } from "@/components/projects/organization-scope-picker";
import { createMaterialAction, disableMaterialAction, updateMaterialAction } from "@/lib/admin/material-actions";
import { copyOrganizationCatalogAction } from "@/lib/admin/platform-actions";
import { listPlatformOrganizations } from "@/lib/admin/platform";
import { getCurrentUserContext } from "@/lib/auth/context";
import { materialFiltersFromSearchParams, getMaterialByIdForOrganization, listMaterialsForOrganization, type MaterialSearchParams } from "@/lib/materials/queries";
import { canAdminister } from "@/lib/domain/admin";
import { canManagePlatform } from "@/lib/domain/platform";

type AdminMaterialsPageProps = {
  searchParams?: MaterialSearchParams;
};

export default async function AdminMaterialsPage({ searchParams }: AdminMaterialsPageProps) {
  const context = await getCurrentUserContext();
  const platformAdmin = canManagePlatform(context);
  const platformOrganizations = platformAdmin
    ? (await listPlatformOrganizations(context)).filter((organization) => organization.active)
    : [];
  const requestedOrganizationId = first(searchParams?.organizationId);
  const organization = platformAdmin
    ? platformOrganizations.find((item) => item.id === requestedOrganizationId) ?? platformOrganizations[0] ?? null
    : context.activeOrganization;

  if (!organization || (!platformAdmin && !canAdminister(context.role))) {
    return (
      <section className="max-w-6xl">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--teal)]">Administrador</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Materiales</h1>
        <div className="mt-5 border border-[var(--line)] bg-white p-5 text-sm text-[var(--muted)]">
          El usuario no tiene una organizacion activa. Si sos super usuario, entra desde{" "}
          <Link href="/admin/organizations" className="text-[var(--teal)] hover:underline">
            Organizaciones
          </Link>
          .
        </div>
      </section>
    );
  }

  const filters = materialFiltersFromSearchParams(searchParams);
  const result = await listMaterialsForOrganization(organization.id, filters, 1000);
  const editId = first(searchParams?.edit);
  const editingMaterial = editId ? await getMaterialByIdForOrganization(organization.id, editId) : null;
  const notice = first(searchParams?.notice);

  return (
    <section className="max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--teal)]">Administrador</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Materiales</h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
            Catalogo habilitado para seleccionar tableros, texturas, espesores y dimensiones de corte.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
          <Metric label="Habilitados" value={result.sourceCount} />
          <Metric label="Filtrados" value={result.matchingCount} />
          <Metric label="Mostrados" value={result.materials.length} />
        </div>
      </div>

      {platformAdmin ? (
        <OrganizationScopePicker
          action="/admin/materials"
          organizations={platformOrganizations}
          selectedId={organization.id}
          label="Administrar catálogo de"
        />
      ) : null}

      {notice ? <div className="operation-banner">{noticeLabel(notice)}</div> : null}

      {platformAdmin ? <CatalogMigration organizations={platformOrganizations} targetOrganizationId={organization.id} /> : null}

      <section className="card overflow-hidden">
        <div className="card-head">
          <div>
            <div className="eyebrow-muted">ABM</div>
            <h2 className="mt-1 text-[19px] font-semibold">{editingMaterial ? "Editar material" : "Nuevo material"}</h2>
            <p className="hint mt-1.5">Los cambios afectan solamente al catálogo de tu organización.</p>
          </div>
          {editingMaterial ? <Link href="/admin/materials" className="btn focus-ring">Cancelar edición</Link> : null}
        </div>
        <MaterialAdminForm
          organizationId={organization.id}
          action={editingMaterial ? updateMaterialAction : createMaterialAction}
          material={editingMaterial}
          submitLabel={editingMaterial ? "Guardar material" : "Crear material"}
        />
      </section>

      <section className="card overflow-hidden">
        <div className="card-head">
          <div>
            <div className="eyebrow-muted">Catálogo</div>
            <h2 className="mt-1 text-[19px] font-semibold">Gestión de materiales</h2>
          </div>
        </div>
        <MaterialAdminTable materials={result.materials} organizationId={organization.id} disableAction={disableMaterialAction} />
      </section>

      <MaterialGallery
        basePath="/admin/materials"
        filters={filters}
        facets={result.facets}
        materials={result.materials}
        matchingCount={result.matchingCount}
        sourceCount={result.sourceCount}
      />
    </section>
  );
}

function CatalogMigration({
  organizations,
  targetOrganizationId
}: {
  organizations: Array<{ id: string; name: string; materialCount: number }>;
  targetOrganizationId: string;
}) {
  const sources = organizations.filter((organization) => organization.id !== targetOrganizationId && organization.materialCount > 0);
  if (sources.length === 0) return null;

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <div className="eyebrow-muted">Migración</div>
          <h2 className="mt-1 text-[19px] font-semibold">Migrar catálogo de materiales</h2>
          <p className="hint mt-1.5">Copia todos los materiales de otra organización al catálogo seleccionado.</p>
        </div>
      </div>
      <form action={copyOrganizationCatalogAction} className="flex flex-wrap items-end gap-3 p-4">
        <input type="hidden" name="targetOrganizationId" value={targetOrganizationId} />
        <label className="block min-w-[280px] flex-1">
          <span className="field-label">Organización origen</span>
          <select name="sourceOrganizationId" className="select mt-1.5" defaultValue={sources[0].id}>
            {sources.map((source) => <option key={source.id} value={source.id}>{source.name} ({source.materialCount} materiales)</option>)}
          </select>
        </label>
        <button type="submit" className="btn btn-primary focus-ring">Migrar materiales</button>
      </form>
    </section>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function noticeLabel(notice: string) {
  const labels: Record<string, string> = {
    material_created: "Material creado.",
    material_updated: "Material actualizado.",
    material_disabled: "Material deshabilitado.",
    material_duplicate: "Ya existe un material con ese identificador externo.",
    material_invalid: "Revisa los datos del material.",
    material_save_failed: "No se pudo guardar el material."
  };
  return labels[notice] ?? notice;
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-[var(--line)] bg-white px-4 py-3">
      <div className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

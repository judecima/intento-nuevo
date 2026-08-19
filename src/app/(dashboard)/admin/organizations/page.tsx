import Link from "next/link";
import { PendingSubmitButton } from "@/components/forms/pending-submit-button";
import { OrganizationBrandingForm } from "@/components/admin/organization-branding-form";
import {
  createOrganizationAction,
  copyOrganizationCatalogAction,
  deleteOrganizationAction,
  linkOrganizationMemberAction,
  removeOrganizationMembershipAction,
  updateOrganizationAction,
  updateOrganizationMembershipAction
} from "@/lib/admin/platform-actions";
import { listPlatformOrganizations, type PlatformOrganization } from "@/lib/admin/platform";
import { getCurrentUserContext } from "@/lib/auth/context";
import { canManagePlatform, platformNoticeMessages } from "@/lib/domain/platform";
import { organizationRoles, roleLabels } from "@/lib/domain/roles";

type AdminOrganizationsPageProps = {
  searchParams?: {
    notice?: string | string[];
  };
};

export default async function AdminOrganizationsPage({ searchParams }: AdminOrganizationsPageProps) {
  const context = await getCurrentUserContext();
  const notice = noticeMessage(first(searchParams?.notice));

  if (!canManagePlatform(context)) {
    return (
      <section className="mx-auto max-w-[900px] space-y-4">
        <Header />
        <div className="card p-5 text-sm text-[var(--muted)]">
          Esta seccion es exclusiva del super usuario de la plataforma.
        </div>
      </section>
    );
  }

  const organizations = await listPlatformOrganizations(context);
  const totalMembers = organizations.reduce((total, organization) => total + organization.members.length, 0);

  return (
    <section className="mx-auto max-w-[1200px] space-y-5">
      <Header />

      {notice ? <div className="operation-banner">{notice}</div> : null}

      <div className="metric-grid max-w-[560px]">
        <div className="metric">
          <div className="metric-value">{organizations.length}</div>
          <div className="metric-label">Organizaciones</div>
        </div>
        <div className="metric">
          <div className="metric-value">{organizations.filter((item) => item.active).length}</div>
          <div className="metric-label">Activas</div>
        </div>
        <div className="metric">
          <div className="metric-value">{totalMembers}</div>
          <div className="metric-label">Membresias</div>
        </div>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <div className="eyebrow-muted">Alta</div>
            <h2 className="mt-1 text-[19px] font-semibold">Nueva organizacion</h2>
            <p className="hint mt-1.5">
              El identificador se deriva del nombre si lo dejas vacio y debe ser unico en la plataforma.
            </p>
          </div>
        </div>
        <form action={createOrganizationAction} className="flex flex-wrap items-end gap-3 p-4">
          <label className="block min-w-[240px] flex-1">
            <span className="field-label">Razón social / nombre</span>
            <input name="name" required minLength={2} className="input mt-1.5" placeholder="Mueblería del Sur" />
          </label>
          <label className="block w-[240px]">
            <span className="field-label">Identificador (opcional)</span>
            <input name="slug" className="input mt-1.5" placeholder="muebleria-del-sur" />
          </label>
          <PendingSubmitButton pendingLabel="Creando..." className="btn btn-primary focus-ring">
            Crear organizacion
          </PendingSubmitButton>
        </form>
      </section>

      {organizations.map((organization) => (
        <OrganizationCard key={organization.id} organization={organization} organizations={organizations} />
      ))}
    </section>
  );
}

function OrganizationCard({
  organization,
  organizations
}: {
  organization: PlatformOrganization;
  organizations: PlatformOrganization[];
}) {
  const deletable = organization.projectCount === 0 && organization.materialCount === 0;

  return (
    <section className="card">
      <div className="card-head">
        <div className="min-w-0">
          <div className="eyebrow-muted">Organizacion</div>
          <h2 className="mt-1 truncate text-[19px] font-semibold">{organization.name}</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className={`badge ${organization.active ? "badge-ok" : "badge-danger"}`}>
              {organization.active ? "Activa" : "Inactiva"}
            </span>
            <span className="badge chip-mono">{organization.slug}</span>
            <span className="badge">{organization.members.length} miembros</span>
            <span className="badge">{organization.projectCount} proyectos</span>
            <span className="badge">{organization.materialCount} materiales</span>
          </div>
        </div>
      </div>

      <div className="space-y-5 p-4">
        {organization.materialCount === 0 && organizations.some((source) => source.id !== organization.id && source.materialCount > 0) ? (
          <form action={copyOrganizationCatalogAction} className="flex flex-wrap items-end gap-3 rounded-[var(--r-md)] bg-[var(--md-surface-container-low)] px-4 py-3">
            <input type="hidden" name="targetOrganizationId" value={organization.id} />
            <label className="block min-w-[260px] flex-1">
              <span className="field-label">Catalogo base</span>
              <select
                name="sourceOrganizationId"
                className="select mt-1.5"
                defaultValue={organizations.find((source) => source.id !== organization.id && source.materialCount > 0)?.id}
              >
                {organizations
                  .filter((source) => source.id !== organization.id && source.materialCount > 0)
                  .map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.name} ({source.materialCount} materiales)
                    </option>
                  ))}
              </select>
            </label>
            <PendingSubmitButton pendingLabel="Copiando catalogo..." className="btn btn-primary focus-ring">
              Copiar catalogo
            </PendingSubmitButton>
          </form>
        ) : null}

        <form action={updateOrganizationAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="organizationId" value={organization.id} />
          <label className="block min-w-[220px] flex-1">
            <span className="field-label">Razón social / nombre</span>
            <input name="name" defaultValue={organization.name} required className="input mt-1.5" />
          </label>
          <label className="block w-[220px]">
            <span className="field-label">Identificador</span>
            <input name="slug" defaultValue={organization.slug} className="input mt-1.5" />
          </label>
          <label className="flex h-[44px] items-center gap-2 text-[13px]">
            <input type="checkbox" name="active" value="true" defaultChecked={organization.active} />
            Activa
          </label>
          <label className="flex h-[44px] items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              name="allowCustomerSignup"
              value="true"
              defaultChecked={organization.allowCustomerSignup}
            />
            Alta de clientes
          </label>
          <PendingSubmitButton pendingLabel="Guardando..." className="btn focus-ring">
            Guardar
          </PendingSubmitButton>
        </form>

        <div className="border-t border-[var(--line)] pt-4">
          <div className="mb-3">
            <h3 className="text-[15px] font-semibold">Identidad visual</h3>
            <p className="hint mt-1">Se aplicará cuando los usuarios trabajen dentro de esta organización.</p>
          </div>
          <OrganizationBrandingForm
            organizationId={organization.id}
            primaryColor={organization.primaryColor}
            secondaryColor={organization.secondaryColor}
            logoUrl={organization.logoUrl}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-[var(--r-md)] bg-[var(--md-surface-container-low)] px-4 py-3">
          <span className="field-label">Ruta de acceso</span>
          <Link href={`/o/${organization.slug}`} className="chip-mono text-[var(--teal)] hover:underline">
            /o/{organization.slug}
          </Link>
          <span className="hint">
            {organization.allowCustomerSignup
              ? "Los clientes pueden crear su cuenta desde ahi; el resto de los roles los das de alta vos."
              : "Solo ingreso: el alta de clientes esta cerrada."}
          </span>
        </div>

        <div>
          <h3 className="mb-2 text-[15px] font-semibold">Usuarios de la organizacion</h3>
          {organization.members.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="data-table min-w-[760px]">
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>Email</th>
                    <th>Rol</th>
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {organization.members.map((member) => (
                    <tr key={member.userId}>
                      <td className="txt">{member.fullName ?? "Sin nombre"}</td>
                      <td className="txt">{member.email ?? "Sin email"}</td>
                      <td colSpan={3} className="txt">
                        <form action={updateOrganizationMembershipAction} className="flex flex-wrap items-center gap-2">
                          <input type="hidden" name="organizationId" value={organization.id} />
                          <input type="hidden" name="userId" value={member.userId} />
                          <select name="role" defaultValue={member.role} className="select h-9 w-[150px] py-0">
                            {organizationRoles.map((role) => (
                              <option key={role} value={role}>
                                {roleLabels[role]}
                              </option>
                            ))}
                          </select>
                          <label className="flex items-center gap-2 text-[13px]">
                            <input type="checkbox" name="active" value="true" defaultChecked={member.active} />
                            Activo
                          </label>
                          <PendingSubmitButton pendingLabel="..." className="btn btn-sm focus-ring">
                            Guardar
                          </PendingSubmitButton>
                          <PendingSubmitButton
                            pendingLabel="..."
                            formAction={removeOrganizationMembershipAction}
                            className="btn btn-sm btn-danger focus-ring"
                          >
                            Desvincular
                          </PendingSubmitButton>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="hint">Todavia no hay usuarios vinculados.</p>
          )}
        </div>

        <form action={linkOrganizationMemberAction} className="flex flex-wrap items-end gap-3 border-t border-[var(--line)] pt-4">
          <input type="hidden" name="organizationId" value={organization.id} />
          <label className="block min-w-[220px] flex-1">
            <span className="field-label">Email</span>
            <input name="email" type="email" required className="input mt-1.5" autoComplete="off" />
          </label>
          <label className="block w-[200px]">
            <span className="field-label">Nombre (si es nuevo)</span>
            <input name="fullName" className="input mt-1.5" autoComplete="off" />
          </label>
          <label className="block w-[180px]">
            <span className="field-label">Password (si es nuevo)</span>
            <input name="password" type="password" minLength={8} className="input mt-1.5" autoComplete="new-password" />
          </label>
          <label className="block w-[160px]">
            <span className="field-label">Rol</span>
            <select name="role" defaultValue="customer" className="select mt-1.5">
              {organizationRoles.map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role]}
                </option>
              ))}
            </select>
          </label>
          <PendingSubmitButton pendingLabel="Vinculando..." className="btn btn-primary focus-ring">
            Vincular usuario
          </PendingSubmitButton>
        </form>

        <form action={deleteOrganizationAction} className="border-t border-[var(--line)] pt-4">
          <input type="hidden" name="organizationId" value={organization.id} />
          <PendingSubmitButton
            pendingLabel="Eliminando..."
            disabled={!deletable}
            className="btn btn-sm btn-danger focus-ring"
          >
            Eliminar organizacion
          </PendingSubmitButton>
          <span className="hint ml-3">
            {deletable
              ? "Solo se puede eliminar mientras no tenga datos cargados."
              : "Tiene datos cargados: desactivala en lugar de eliminarla."}
          </span>
        </form>
      </div>
    </section>
  );
}

function Header() {
  return (
    <header>
      <div className="eyebrow">Plataforma</div>
      <h1 className="mt-1.5 text-[30px] font-semibold tracking-[-0.02em]">Organizaciones</h1>
      <p className="hint mt-2 max-w-3xl text-[13px]">
        Alta, edicion y baja de organizaciones, y que usuarios pertenecen a cada una.
      </p>
    </header>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function noticeMessage(notice: string | undefined) {
  if (!notice) return null;
  return platformNoticeMessages[notice] ?? null;
}

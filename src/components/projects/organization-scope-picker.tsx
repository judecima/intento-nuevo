import { PendingSubmitButton } from "@/components/forms/pending-submit-button";

export type OrganizationScopeOption = {
  id: string;
  name: string;
  slug: string;
};

/**
 * Selector de organizacion para el super usuario. Navega por query string
 * (`?organizationId=`) para que la pagina server vuelva a cargar el catalogo y
 * los proyectos de esa organizacion.
 */
export function OrganizationScopePicker({
  action,
  organizations,
  selectedId,
  label = "Trabajando sobre"
}: {
  action: string;
  organizations: OrganizationScopeOption[];
  selectedId: string;
  label?: string;
}) {
  if (organizations.length === 0) return null;

  return (
    <form
      action={action}
      method="get"
      className="card flex flex-wrap items-end gap-3 p-4"
    >
      <span className="badge badge-accent">Super usuario</span>
      <label className="block min-w-[260px] flex-1">
        <span className="field-label">{label}</span>
        <select name="organizationId" defaultValue={selectedId} className="select mt-1.5">
          {organizations.map((organization) => (
            <option key={organization.id} value={organization.id}>
              {organization.name} ({organization.slug})
            </option>
          ))}
        </select>
      </label>
      <PendingSubmitButton pendingLabel="Cambiando..." className="btn focus-ring">
        Cambiar organizacion
      </PendingSubmitButton>
    </form>
  );
}

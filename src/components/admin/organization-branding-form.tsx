/* eslint-disable @next/next/no-img-element -- logo URL is tenant-configured and may be external. */
import { PendingSubmitButton } from "@/components/forms/pending-submit-button";
import { updateOrganizationBrandingAction } from "@/lib/admin/branding-actions";

export function OrganizationBrandingForm({
  organizationId,
  primaryColor,
  secondaryColor,
  logoUrl
}: {
  organizationId: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string | null;
}) {
  return (
    <form action={updateOrganizationBrandingAction} className="space-y-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Color principal
          <input name="primaryColor" type="color" defaultValue={primaryColor} className="mt-2 h-11 w-full cursor-pointer border border-[var(--line)] bg-white p-1" />
        </label>
        <label className="block text-sm font-medium">
          Color secundario
          <input name="secondaryColor" type="color" defaultValue={secondaryColor} className="mt-2 h-11 w-full cursor-pointer border border-[var(--line)] bg-white p-1" />
        </label>
      </div>
      <label className="block text-sm font-medium">
        Logo de la organización
        <input name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="input mt-2 w-full py-2" />
        <span className="hint mt-1 block">PNG, JPG, WEBP o SVG. Máximo 2 MB.</span>
      </label>
      {logoUrl ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="removeLogo" value="true" />
          Quitar logo actual
        </label>
      ) : null}
      {logoUrl ? <img src={logoUrl} alt="Logo actual" className="h-14 max-w-[220px] object-contain object-left" /> : <p className="hint">Todavía no hay un logo cargado.</p>}
      <PendingSubmitButton pendingLabel="Guardando identidad..." className="btn btn-primary focus-ring">
        Guardar identidad visual
      </PendingSubmitButton>
    </form>
  );
}

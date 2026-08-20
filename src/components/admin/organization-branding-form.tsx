/* eslint-disable @next/next/no-img-element -- logo URL is tenant-configured and may be external. */
import { PendingSubmitButton } from "@/components/forms/pending-submit-button";
import { updateOrganizationBrandingAction } from "@/lib/admin/branding-actions";

export function OrganizationBrandingForm({
  organizationId,
  primaryColor,
  secondaryColor,
  deliveryTimeDays,
  logoUrl
}: {
  organizationId: string;
  primaryColor: string;
  secondaryColor: string;
  deliveryTimeDays: number;
  logoUrl: string | null;
}) {
  return (
    <form action={updateOrganizationBrandingAction} className="space-y-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Color principal
          <input
            name="primaryColor"
            type="color"
            defaultValue={primaryColor}
            className="mt-2 h-11 w-full cursor-pointer border border-[var(--line)] bg-white p-1"
          />
        </label>
        <label className="block text-sm font-medium">
          Color secundario
          <input
            name="secondaryColor"
            type="color"
            defaultValue={secondaryColor}
            className="mt-2 h-11 w-full cursor-pointer border border-[var(--line)] bg-white p-1"
          />
        </label>
      </div>
      <label className="block max-w-[240px] text-sm font-medium">
        Tiempo de entrega (dias)
        <input
          name="deliveryTimeDays"
          type="number"
          min={1}
          max={365}
          step={1}
          required
          defaultValue={deliveryTimeDays}
          className="input mt-2"
        />
      </label>
      <label className="block text-sm font-medium">
        Logo de la organizacion
        <input name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="input mt-2 w-full py-2" />
        <span className="hint mt-1 block">PNG, JPG, WEBP o SVG. Maximo 2 MB.</span>
      </label>
      {logoUrl ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="removeLogo" value="true" />
          Quitar logo actual
        </label>
      ) : null}
      {logoUrl ? (
        <img src={logoUrl} alt="Logo actual" className="h-14 max-w-[220px] object-contain object-left" />
      ) : (
        <p className="hint">Todavia no hay un logo cargado.</p>
      )}
      <PendingSubmitButton pendingLabel="Guardando configuracion..." className="btn btn-primary focus-ring">
        Guardar configuracion
      </PendingSubmitButton>
    </form>
  );
}

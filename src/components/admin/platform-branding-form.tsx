/* eslint-disable @next/next/no-img-element -- logo URL is platform-configured and may be external. */
import { PendingSubmitButton } from "@/components/forms/pending-submit-button";
import { updatePlatformBrandingAction } from "@/lib/admin/branding-actions";

export function PlatformBrandingForm({ legalName, primaryColor, secondaryColor, logoUrl }: { legalName: string; primaryColor: string; secondaryColor: string; logoUrl: string | null }) {
  return (
    <form action={updatePlatformBrandingAction} className="space-y-4">
      <label className="block text-sm font-medium">Razón social / nombre del SaaS<input name="legalName" required minLength={2} defaultValue={legalName} className="input mt-2 w-full" /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium">Color principal<input name="primaryColor" type="color" defaultValue={primaryColor || "#12666b"} className="mt-2 h-11 w-full cursor-pointer border border-[var(--line)] bg-white p-1" /></label>
        <label className="block text-sm font-medium">Color secundario<input name="secondaryColor" type="color" defaultValue={secondaryColor || "#f5b301"} className="mt-2 h-11 w-full cursor-pointer border border-[var(--line)] bg-white p-1" /></label>
      </div>
      <label className="block text-sm font-medium">Logo del SaaS<input name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="input mt-2 w-full py-2" /><span className="hint mt-1 block">PNG, JPG, WEBP o SVG. Máximo 2 MB.</span></label>
      {logoUrl ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="removeLogo" value="true" />Quitar logo actual</label> : null}
      {logoUrl ? <img src={logoUrl} alt="Logo actual del SaaS" className="h-14 max-w-[220px] object-contain object-left" /> : <p className="hint">Se utilizará el nombre del SaaS si no hay logo.</p>}
      <PendingSubmitButton pendingLabel="Guardando identidad..." className="btn btn-primary focus-ring">Guardar identidad del SaaS</PendingSubmitButton>
    </form>
  );
}

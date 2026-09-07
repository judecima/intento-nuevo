import { PendingSubmitButton } from "@/components/forms/pending-submit-button";
import { materialKindLabels, materialKinds } from "@/lib/domain/materials";
import type { MaterialListItem } from "@/lib/materials/queries";

export function MaterialAdminForm({
  organizationId,
  action,
  material,
  submitLabel
}: {
  organizationId: string;
  action: (formData: FormData) => Promise<never>;
  material?: MaterialListItem | null;
  submitLabel: string;
}) {
  return (
    <form action={action} className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
      {material ? <input type="hidden" name="materialId" value={material.id} /> : null}
      <input type="hidden" name="organizationId" value={organizationId} />
      <Field label="Código" name="code" defaultValue={material?.code ?? ""} required />
      <Field label="Código externo" name="externalId" defaultValue={material?.external_id ?? ""} />
      <Field label="Descripción" name="description" defaultValue={material?.description ?? ""} required className="sm:col-span-2" />
      <label className="block">
        <span className="field-label">Tipo</span>
        <select name="type" defaultValue={material?.type ?? "board"} className="select mt-1.5">
          {materialKinds.map((kind) => <option key={kind} value={kind}>{materialKindLabels[kind]}</option>)}
        </select>
      </label>
      <Field label="Ancho (mm)" name="width" type="number" defaultValue={material?.width ?? ""} required />
      <Field label="Alto (mm)" name="height" type="number" defaultValue={material?.height ?? ""} required />
      <Field label="Espesor (mm)" name="thickness" type="number" defaultValue={material?.thickness ?? ""} required />
      <Field label="ID textura" name="textureId" type="number" defaultValue={material?.texture_id ?? ""} />
      <Field label="Precio por m²" name="priceM2" type="number" defaultValue={material?.price_m2 ?? 0} />
      <Field label="Refilado X" name="refX" type="number" defaultValue={material?.ref_x ?? 0} />
      <Field label="Refilado Y" name="refY" type="number" defaultValue={material?.ref_y ?? 0} />
      <Field label="Corte mínimo" name="minCut" type="number" defaultValue={material?.min_cut ?? 0} />
      <Field label="URL de imagen" name="imageUrl" defaultValue={material?.image_url ?? ""} className="sm:col-span-2" />
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input type="checkbox" name="hasGrain" value="true" defaultChecked={material?.has_grain ?? false} />
        Tiene veta
      </label>
      <div className="flex items-end justify-end gap-2 sm:col-span-2 lg:col-span-4">
        <PendingSubmitButton pendingLabel="Guardando..." className="btn btn-primary focus-ring">
          {submitLabel}
        </PendingSubmitButton>
      </div>
    </form>
  );
}

function Field({ label, name, defaultValue, type = "text", required = false, className = "" }: { label: string; name: string; defaultValue: string | number; type?: string; required?: boolean; className?: string }) {
  return <label className={`block ${className}`}><span className="field-label">{label}</span><input name={name} type={type} defaultValue={defaultValue} required={required} min={type === "number" ? "0" : undefined} step={type === "number" ? "0.01" : undefined} className="input mt-1.5" /></label>;
}

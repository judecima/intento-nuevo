import { PendingSubmitButton } from "@/components/forms/pending-submit-button";
import { createMachineProfileAction, updateMachineProfileAction } from "@/lib/admin/actions";
import { listAdminMachineProfiles } from "@/lib/admin/queries";
import { getCurrentUserContext } from "@/lib/auth/context";
import { adminDomainErrors, canAdminister } from "@/lib/domain/admin";

type AdminMachinesPageProps = {
  searchParams?: {
    notice?: string | string[];
  };
};

export default async function AdminMachinesPage({ searchParams }: AdminMachinesPageProps) {
  const context = await getCurrentUserContext();
  const organizationId = context.activeOrganization?.id;
  const notice = noticeMessage(first(searchParams?.notice));

  if (!organizationId || !canAdminister(context.role)) {
    return (
      <section className="max-w-6xl">
        <Header />
        <div className="mt-5 border border-[var(--line)] bg-white p-5 text-sm text-[var(--muted)]">
          No tenes permisos de administrador para gestionar maquinas.
        </div>
      </section>
    );
  }

  const profiles = await listAdminMachineProfiles(context, organizationId);

  return (
    <section className="max-w-7xl space-y-5">
      <Header />
      {notice ? (
        <div className="border-l-4 border-[var(--teal)] bg-white px-4 py-3 text-sm text-[var(--ink)]">{notice}</div>
      ) : null}

      <section className="border border-[var(--line)] bg-white p-4">
        <h2 className="text-lg font-semibold">Nuevo perfil</h2>
        <MachineProfileForm action={createMachineProfileAction} organizationId={organizationId} submitLabel="Crear perfil" />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Perfiles existentes</h2>
        {profiles.length === 0 ? (
          <div className="border border-[var(--line)] bg-white p-5 text-sm text-[var(--muted)]">
            No hay perfiles de maquina configurados.
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {profiles.map((profile) => (
              <article key={profile.id} className="border border-[var(--line)] bg-white p-4">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <div className="font-mono text-xs text-[var(--muted)]">{profile.id.slice(0, 8)}</div>
                    <h3 className="mt-1 text-lg font-semibold">{profile.name}</h3>
                    <div className="mt-1 text-sm text-[var(--muted)]">
                      {[profile.manufacturer, profile.model].filter(Boolean).join(" / ") || "Sin fabricante/modelo"}
                    </div>
                  </div>
                  <span className="rounded border border-[var(--line)] px-2 py-1 text-xs">
                    {profile.active ? "Activo" : "Inactivo"}
                  </span>
                </div>
                <MachineProfileForm
                  action={updateMachineProfileAction}
                  profile={{
                    id: profile.id,
                    name: profile.name,
                    manufacturer: profile.manufacturer ?? "",
                    model: profile.model ?? "",
                    xmlFormat: profile.xml_format,
                    kerf: profile.kerf,
                    minPieceWidth: profile.min_piece_width,
                    minPieceHeight: profile.min_piece_height,
                    configuration: formatJson(profile.configuration),
                    active: profile.active
                  }}
                  submitLabel="Guardar cambios"
                />
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

type MachineProfileFormProps = {
  action: (formData: FormData) => Promise<void>;
  organizationId?: string;
  submitLabel: string;
  profile?: {
    id: string;
    name: string;
    manufacturer: string;
    model: string;
    xmlFormat: string;
    kerf: number;
    minPieceWidth: number;
    minPieceHeight: number;
    configuration: string;
    active: boolean;
  };
};

function MachineProfileForm({ action, organizationId, profile, submitLabel }: MachineProfileFormProps) {
  return (
    <form action={action} className="mt-4 grid gap-3 text-sm md:grid-cols-2">
      {organizationId ? <input type="hidden" name="organizationId" value={organizationId} /> : null}
      {profile?.id ? <input type="hidden" name="id" value={profile.id} /> : null}
      <input type="hidden" name="returnTo" value="/admin/machines" />

      <TextInput label="Nombre" name="name" defaultValue={profile?.name ?? ""} required />
      <TextInput label="Fabricante" name="manufacturer" defaultValue={profile?.manufacturer ?? ""} />
      <TextInput label="Modelo" name="model" defaultValue={profile?.model ?? ""} />
      <TextInput label="Formato XML" name="xmlFormat" defaultValue={profile?.xmlFormat ?? "legacy_project_xml"} required />
      <NumberInput label="Kerf" name="kerf" defaultValue={profile?.kerf ?? 4.5} />
      <NumberInput label="Min. ancho pieza" name="minPieceWidth" defaultValue={profile?.minPieceWidth ?? 0} />
      <NumberInput label="Min. alto pieza" name="minPieceHeight" defaultValue={profile?.minPieceHeight ?? 0} />

      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Estado</span>
        <select
          name="active"
          defaultValue={profile?.active === false ? "false" : "true"}
          className="mt-2 w-full rounded border border-[var(--line)] bg-white px-3 py-2 focus-ring"
        >
          <option value="true">Activo</option>
          <option value="false">Inactivo</option>
        </select>
      </label>

      <label className="block md:col-span-2">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Configuracion JSON</span>
        <textarea
          name="configuration"
          rows={5}
          defaultValue={profile?.configuration ?? "{}"}
          className="mt-2 w-full rounded border border-[var(--line)] px-3 py-2 font-mono text-xs focus-ring"
        />
      </label>

      <div className="md:col-span-2">
        <PendingSubmitButton
          pendingLabel="Guardando perfil..."
          className="focus-ring rounded bg-[var(--teal)] px-4 py-3 text-sm font-semibold text-white"
        >
          {submitLabel}
        </PendingSubmitButton>
      </div>
    </form>
  );
}

function Header() {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--teal)]">Administrador</div>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Maquinas</h1>
      <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
        Perfiles de seccionadora usados para parametrizar la generacion de XML de produccion.
      </p>
    </div>
  );
}

function TextInput({
  label,
  name,
  defaultValue,
  required = false
}: {
  label: string;
  name: string;
  defaultValue: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        required={required}
        className="mt-2 w-full rounded border border-[var(--line)] px-3 py-2 focus-ring"
      />
    </label>
  );
}

function NumberInput({ label, name, defaultValue }: { label: string; name: string; defaultValue: number }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{label}</span>
      <input
        name={name}
        type="number"
        min="0"
        step="0.01"
        defaultValue={defaultValue}
        className="mt-2 w-full rounded border border-[var(--line)] px-3 py-2 focus-ring"
      />
    </label>
  );
}

function formatJson(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function noticeMessage(notice: string | undefined) {
  if (!notice) return null;
  const messages: Record<string, string> = {
    machine_profile_created: "Perfil de maquina creado.",
    machine_profile_updated: "Perfil de maquina actualizado.",
    [adminDomainErrors.invalidInput]: "Los datos enviados no son validos.",
    [adminDomainErrors.invalidConfiguration]: "La configuracion debe ser un objeto JSON valido.",
    [adminDomainErrors.forbidden]: "No tenes permisos para esta accion.",
    [adminDomainErrors.machineProfileNotFound]: "No se encontro el perfil de maquina.",
    [adminDomainErrors.machineProfileSaveFailed]: "No se pudo guardar el perfil de maquina."
  };

  return messages[notice] ?? null;
}

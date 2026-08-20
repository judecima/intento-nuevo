import { listAuditLog } from "@/lib/admin/queries";
import { getCurrentUserContext } from "@/lib/auth/context";
import { canAdminister } from "@/lib/domain/admin";
import { formatDateTimeEsAr } from "@/lib/format/dates";

export default async function AdminAuditPage() {
  const context = await getCurrentUserContext();
  const organizationId = context.activeOrganization?.id;

  if (!organizationId || !canAdminister(context.role)) {
    return (
      <section className="max-w-6xl">
        <Header />
        <div className="mt-5 border border-[var(--line)] bg-white p-5 text-sm text-[var(--muted)]">
          No tenes permisos de administrador para ver auditoria.
        </div>
      </section>
    );
  }

  const rows = await listAuditLog(context, organizationId);

  return (
    <section className="max-w-7xl space-y-5">
      <Header />

      {rows.length === 0 ? (
        <div className="border border-[var(--line)] bg-white p-5 text-sm text-[var(--muted)]">
          Todavia no hay eventos de auditoria registrados.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <article key={row.id} className="border border-[var(--line)] bg-white p-4">
              <div className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)_170px] lg:items-start">
                <div>
                  <div className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">Accion</div>
                  <div className="mt-1 font-semibold">{auditActionLabel(row.action)}</div>
                </div>
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">Entidad</div>
                  <div className="mt-1 font-mono text-xs text-[var(--ink)]">
                    {row.entity_type}
                    {row.entity_id ? ` / ${row.entity_id}` : ""}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">Fecha</div>
                  <div className="mt-1 text-sm">{formatDateTimeEsAr(row.created_at)}</div>
                </div>
              </div>

              <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                <Detail label="Actor" value={row.actor_id ?? "Sistema"} />
                <Detail label="Evento" value={row.id} mono />
              </div>

              <details className="mt-3 border border-[var(--line)] bg-[#f7f9f7] p-3 text-xs">
                <summary className="cursor-pointer font-semibold">Datos auditados</summary>
                <div className="mt-3 grid gap-3 lg:grid-cols-3">
                  <JsonBlock label="Metadata" value={row.metadata} />
                  <JsonBlock label="Anterior" value={row.old_data} />
                  <JsonBlock label="Nuevo" value={row.new_data} />
                </div>
              </details>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function Header() {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--teal)]">Administrador</div>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Auditoria</h1>
      <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
        Eventos sensibles de pedidos, produccion, XML, usuarios y perfiles de maquina.
      </p>
    </div>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">{label}</div>
      <div className={`mt-1 break-all ${mono ? "font-mono text-xs" : "font-semibold"}`}>{value}</div>
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <div className="mb-2 font-semibold">{label}</div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words border border-[var(--line)] bg-white p-3 font-mono text-[11px]">
        {formatJson(value)}
      </pre>
    </div>
  );
}

function auditActionLabel(action: string) {
  const labels: Record<string, string> = {
    order_pending: "Pedido pendiente",
    order_submitted: "Pedido enviado",
    order_under_review: "Pedido en revision",
    order_changes_requested: "Correcciones solicitadas",
    order_approved: "Pedido aprobado",
    order_in_production: "Produccion iniciada",
    order_edgebanding: "Pegado de canto",
    order_completed: "Produccion finalizada",
    order_delivered: "Pedido entregado",
    order_cancelled: "Pedido cancelado",
    xml_generated: "XML generado",
    xml_downloaded: "XML descargado",
    file_generated: "Archivo generado",
    file_downloaded: "Archivo descargado",
    organization_member_updated: "Usuario actualizado",
    machine_profile_created: "Perfil de maquina creado",
    machine_profile_updated: "Perfil de maquina actualizado"
  };

  return labels[action] ?? action;
}

function formatJson(value: unknown) {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return "null";
  }
}

import { AuditLogTable } from "@/components/admin/audit-log-table";
import { listAuditLog } from "@/lib/admin/queries";
import { getCurrentUserContext } from "@/lib/auth/context";
import { canAdminister } from "@/lib/domain/admin";
import { PageHeader } from "@/components/ui/page-header";

export default async function AdminAuditPage() {
  const context = await getCurrentUserContext();
  const organizationId = context.activeOrganization?.id;

  if (!organizationId || !canAdminister(context.role)) {
    return (
      <section className="page">
        <Header />
        <div className="mt-5 border border-[var(--line)] bg-[var(--md-surface-container-lowest)] p-5 text-sm text-[var(--muted)]">
          No tenes permisos de administrador para ver auditoria.
        </div>
      </section>
    );
  }

  const rows = await listAuditLog(context, organizationId);

  return (
    <section className="page">
      <Header />
      <AuditLogTable rows={rows} />
    </section>
  );
}

function Header() {
  return (
    <div>
      <PageHeader
        eyebrow="Administrador"
        title="Auditoria"
          description="Registro de quien hizo cada cambio y cuando."
        />
      <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
        Eventos sensibles de pedidos, produccion, XML, usuarios y perfiles de maquina.
      </p>
    </div>
  );
}

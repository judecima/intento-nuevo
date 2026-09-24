import { OrderProcessTable } from "@/components/process/order-process-table";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUserContext } from "@/lib/auth/context";
import { orderDomainErrors, orderStatusLabels, type OrderStatus } from "@/lib/domain/orders";
import { DEFAULT_ORGANIZATION_DELIVERY_TIME_DAYS } from "@/lib/domain/platform";
import { canAccessOrderProcess, processDomainErrors } from "@/lib/domain/process";
import { listProcessOrders } from "@/lib/process/queries";

type ProcessPageProps = {
  searchParams?: {
    notice?: string | string[];
  };
};

export default async function ProcessPage({ searchParams }: ProcessPageProps) {
  const context = await getCurrentUserContext();
  const organizationId = context.activeOrganization?.id;

  if (!organizationId || !canAccessOrderProcess(context.role)) {
    return (
      <section className="page">
        <PageHeader eyebrow="Proceso" title="Seguimiento de pedidos" />
        <Notice kind="error">No tenes permisos para acceder al proceso de pedidos.</Notice>
      </section>
    );
  }

  const rows = await listProcessOrders(
    organizationId,
    context.role,
    context.activeOrganization?.delivery_time_days ?? DEFAULT_ORGANIZATION_DELIVERY_TIME_DAYS
  );
  const notice = noticeMessage(first(searchParams?.notice));
  const counts = countByStatus(rows.map((row) => row.status));

  return (
    <section className="page page-wide">
      <PageHeader
        eyebrow="Proceso"
        title="Seguimiento de pedidos"
        description="Todos los pedidos de la organizacion y en que etapa esta cada uno."
        aside={
          <div className="grid grid-cols-3 gap-2 md:grid-cols-6 xl:min-w-[820px]">
            <Metric label="Pendientes" value={((counts.pending ?? 0) + (counts.submitted ?? 0) + (counts.under_review ?? 0)).toString()} />
            <Metric label="Aprobados" value={(counts.approved ?? 0).toString()} />
            <Metric label="Produccion" value={(counts.production ?? 0).toString()} />
            <Metric label="Pegado" value={(counts.edgebanding ?? 0).toString()} />
            <Metric label="Finalizados" value={(counts.completed ?? 0).toString()} />
            <Metric label="Entregados" value={(counts.delivered ?? 0).toString()} />
          </div>
        }
      />

      {notice ? (
        <Notice kind="ok">{notice}</Notice>
      ) : null}

      <OrderProcessTable rows={rows} role={context.role} />
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--r)] border border-[var(--line)] bg-white px-3 py-2">
      <div className="font-mono text-xl font-semibold leading-none">{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">{label}</div>
    </div>
  );
}

function countByStatus(statuses: OrderStatus[]): Partial<Record<OrderStatus, number>> {
  return statuses.reduce<Partial<Record<OrderStatus, number>>>((counts, status) => {
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {});
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function noticeMessage(notice: string | undefined) {
  if (!notice) return null;
  const messages: Record<string, string> = {
    process_saved: "Proceso actualizado.",
    order_approved: "Pedido aprobado y listo para produccion.",
    production_started: "Produccion iniciada.",
    production_edgebanding: "Pedido pasado a pegado de canto.",
    production_completed: "Produccion finalizada.",
    order_delivered: "Pedido marcado como entregado.",
    [orderDomainErrors.forbidden]: "No tenes permisos para realizar esa accion.",
    [orderDomainErrors.invalidStatus]: "El pedido ya no esta en un estado valido para esa accion.",
    [orderDomainErrors.versionConflict]: "El pedido cambio en otra operacion. Actualiza la tabla.",
    [processDomainErrors.processUpdateFailed]: "No se pudo guardar el proceso.",
    [processDomainErrors.transitionFailed]: "No se pudo cambiar el estado del pedido."
  };

  if (notice in orderStatusLabels) return null;
  return messages[notice] ?? null;
}

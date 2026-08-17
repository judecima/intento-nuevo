import { OrderProcessTable } from "@/components/process/order-process-table";
import { getCurrentUserContext } from "@/lib/auth/context";
import { orderDomainErrors, orderStatusLabels, type OrderStatus } from "@/lib/domain/orders";
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
      <section className="max-w-6xl">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--teal)]">Proceso</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Proceso de pedidos</h1>
        <div className="mt-5 border border-[var(--line)] bg-white p-5 text-sm text-[var(--muted)]">
          No tenes permisos para acceder al proceso de pedidos.
        </div>
      </section>
    );
  }

  const rows = await listProcessOrders(organizationId, context.role);
  const notice = noticeMessage(first(searchParams?.notice));
  const counts = countByStatus(rows.map((row) => row.status));

  return (
    <section className="max-w-[1680px] space-y-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--teal)]">Proceso</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Proceso de pedidos</h1>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:min-w-[560px]">
          <Metric label="Aprobados" value={(counts.approved ?? 0).toString()} />
          <Metric label="Produccion" value={(counts.production ?? 0).toString()} />
          <Metric label="Finalizados" value={(counts.completed ?? 0).toString()} />
          <Metric label="Entregados" value={(counts.delivered ?? 0).toString()} />
        </div>
      </div>

      {notice ? (
        <div className="border-l-4 border-[var(--teal)] bg-white px-4 py-3 text-sm text-[var(--ink)]">{notice}</div>
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
    order_under_review: "Pedido tomado en revision.",
    order_changes_requested: "Pedido devuelto para correcciones.",
    order_approved: "Pedido aprobado y listo para produccion.",
    production_started: "Produccion iniciada.",
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

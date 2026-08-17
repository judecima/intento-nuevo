import {
  approveOrderAction,
  requestOrderChangesAction,
  startOrderReviewAction
} from "@/lib/orders/actions";
import { PendingSubmitButton } from "@/components/forms/pending-submit-button";
import type { OrderRow } from "@/lib/orders/queries";
import { getOrderSnapshotSummary, orderStatusLabels } from "@/lib/domain/orders";
import { formatDateTimeEsAr } from "@/lib/format/dates";

type OrderListMode = "customer" | "pending" | "review" | "approved";

type OrderListProps = {
  orders: OrderRow[];
  mode: OrderListMode;
};

export function OrderList({ orders, mode }: OrderListProps) {
  if (orders.length === 0) {
    return (
      <div className="rounded-[var(--r)] border border-dashed border-[var(--linea-fuerte)] bg-[rgba(255,255,255,.45)] p-8 text-center text-sm text-[var(--muted)]">
        No hay pedidos para mostrar.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {orders.map((order) => (
        <OrderCard key={order.id} order={order} mode={mode} />
      ))}
    </div>
  );
}

function OrderCard({ order, mode }: { order: OrderRow; mode: OrderListMode }) {
  const summary = getOrderSnapshotSummary(order.snapshot);

  return (
    <article className="overflow-hidden rounded-[var(--r)] border border-[var(--line)] bg-white">
      <div className="flex flex-col gap-3 border-b border-[var(--line)] px-4 py-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="font-mono text-xs text-[var(--muted)]">{order.id.slice(0, 8)}</div>
          <h2 className="mt-1 text-[20px] font-bold">{summary.projectName}</h2>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
            <span className="rounded-[var(--r)] border border-[var(--line)] bg-[#f7f8f6] px-2 py-1">{orderStatusLabels[order.status]}</span>
            <span className="rounded-[var(--r)] border border-[var(--line)] bg-[#f7f8f6] px-2 py-1">Version {order.version}</span>
            <span className="rounded-[var(--r)] border border-[var(--line)] bg-[#f7f8f6] px-2 py-1">{formatDateTimeEsAr(order.created_at)}</span>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-px overflow-hidden rounded-[var(--r)] border border-[var(--line)] bg-[var(--line)] text-sm">
          <Metric label="Placas" value={summary.boardCount.toString()} />
          <Metric label="Piezas" value={summary.totalPieces.toString()} />
          <Metric label="Aprov." value={`${summary.utilizationPercentage.toFixed(1)}%`} />
          <Metric label="Filas" value={summary.itemRows.toString()} />
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <dl className="grid gap-3 text-sm md:grid-cols-2">
          <Detail label="Material" value={summary.materialDescription} />
          <Detail label="Cliente" value={customerLabel(summary.customerName, summary.customerEmail)} />
          <Detail label="Nota cliente" value={order.notes_customer || "Sin nota"} />
          <Detail label="Nota vendedor" value={order.notes_seller || "Sin nota"} />
        </dl>

        <OrderActions order={order} mode={mode} />
      </div>
    </article>
  );
}

function OrderActions({ order, mode }: { order: OrderRow; mode: OrderListMode }) {
  if (mode === "pending") {
    return (
      <div className="space-y-3">
        <form action={approveOrderAction} className="space-y-3">
          <input type="hidden" name="orderId" value={order.id} />
          <input type="hidden" name="expectedOrderVersion" value={order.version} />
          <TextArea label="Comentario de validacion" name="comment" />
          <PendingSubmitButton
            pendingLabel="Aprobando pedido..."
            className="focus-ring w-full rounded bg-[var(--teal)] px-4 py-3 text-sm font-semibold text-white"
          >
            Aprobar pedido
          </PendingSubmitButton>
        </form>
        <form action={startOrderReviewAction} className="space-y-3 border-t border-[var(--line)] pt-3">
          <input type="hidden" name="orderId" value={order.id} />
          <input type="hidden" name="expectedOrderVersion" value={order.version} />
          <TextArea label="Comentario interno" name="comment" />
          <PendingSubmitButton
            pendingLabel="Tomando revision..."
            className="focus-ring w-full rounded border border-[var(--linea-fuerte)] px-4 py-3 text-sm font-semibold text-[var(--ink)]"
          >
            Tomar revision
          </PendingSubmitButton>
        </form>
      </div>
    );
  }

  if (mode === "review") {
    return (
      <div className="space-y-3">
        <form action={approveOrderAction} className="space-y-3">
          <input type="hidden" name="orderId" value={order.id} />
          <input type="hidden" name="expectedOrderVersion" value={order.version} />
          <TextArea label="Comentario aprobacion" name="comment" />
          <PendingSubmitButton
            pendingLabel="Aprobando pedido..."
            className="focus-ring w-full rounded bg-[var(--teal)] px-4 py-3 text-sm font-semibold text-white"
          >
            Aprobar pedido
          </PendingSubmitButton>
        </form>
        <form action={requestOrderChangesAction} className="space-y-3 border-t border-[var(--line)] pt-3">
          <input type="hidden" name="orderId" value={order.id} />
          <input type="hidden" name="expectedOrderVersion" value={order.version} />
          <TextArea label="Correcciones solicitadas" name="comment" required />
          <PendingSubmitButton
            pendingLabel="Enviando correcciones..."
            className="focus-ring w-full rounded border border-[var(--danger)] px-4 py-3 text-sm font-semibold text-[var(--danger)]"
          >
            Solicitar cambios
          </PendingSubmitButton>
        </form>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--r)] border border-[var(--line)] bg-[#f7f9f7] p-4 text-sm text-[var(--muted)]">
      Pedido disponible para la siguiente etapa del flujo.
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[68px] bg-white px-3 py-2 text-center">
      <div className="font-mono text-[17px] font-semibold leading-none tracking-[-0.02em]">{value}</div>
      <div className="mt-1 text-[9.5px] uppercase tracking-[0.11em] text-[var(--muted)]">{label}</div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}

function TextArea({
  label,
  name,
  required = false
}: {
  label: string;
  name: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{label}</span>
      <textarea
        name={name}
        rows={3}
        required={required}
        className="mt-2 w-full rounded border border-[var(--line)] px-3 py-2 text-sm focus-ring"
      />
    </label>
  );
}

function customerLabel(name: string, email: string) {
  return email ? `${name} - ${email}` : name;
}

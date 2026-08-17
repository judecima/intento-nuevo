import { SalesOrdersTable } from "@/components/orders/sales-orders-table";
import { getCurrentUserContext } from "@/lib/auth/context";
import { orderDomainErrors } from "@/lib/domain/orders";
import { listSalesOrders } from "@/lib/orders/queries";

type SalesReviewPageProps = {
  searchParams?: {
    notice?: string | string[];
  };
};

export default async function SalesReviewPage({ searchParams }: SalesReviewPageProps) {
  const context = await getCurrentUserContext();
  const orders = context.activeOrganization ? await listSalesOrders(context.activeOrganization.id, ["under_review"]) : [];
  const notice = noticeMessage(first(searchParams?.notice));

  return (
    <section className="max-w-7xl space-y-5">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--teal)]">Vendedor</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Pedidos en revision</h1>
      </div>

      {notice ? (
        <div className="border-l-4 border-[var(--teal)] bg-white px-4 py-3 text-sm text-[var(--ink)]">{notice}</div>
      ) : null}

      <SalesOrdersTable orders={orders} mode="review" />
    </section>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function noticeMessage(notice: string | undefined) {
  if (!notice) return null;
  const messages: Record<string, string> = {
    order_under_review: "Pedido tomado para revision.",
    [orderDomainErrors.forbidden]: "No tenes permisos para revisar ese pedido.",
    [orderDomainErrors.invalidStatus]: "El pedido ya no esta en un estado valido para esa accion.",
    [orderDomainErrors.versionConflict]: "El pedido cambio en otra operacion. Revisa la lista actual.",
    [orderDomainErrors.transitionFailed]: "No se pudo cambiar el estado del pedido."
  };

  return messages[notice] ?? null;
}

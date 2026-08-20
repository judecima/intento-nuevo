import { OrderList } from "@/components/orders/order-list";
import { getCurrentUserContext } from "@/lib/auth/context";
import { listCustomerOrders } from "@/lib/orders/queries";

type OrdersPageProps = {
  searchParams?: {
    notice?: string | string[];
  };
};

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const context = await getCurrentUserContext();
  const orders =
    context.activeOrganization && context.user
      ? await listCustomerOrders(context.activeOrganization.id, context.user.id)
      : [];
  const notice = noticeMessage(first(searchParams?.notice));

  return (
    <section className="max-w-7xl space-y-5">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--teal)]">Cliente</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Mis pedidos</h1>
      </div>

      {notice ? (
        <div className="border-l-4 border-[var(--teal)] bg-white px-4 py-3 text-sm text-[var(--ink)]">{notice}</div>
      ) : null}

      <OrderList orders={orders} mode="customer" />
    </section>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function noticeMessage(notice: string | undefined) {
  if (!notice) return null;
  const messages: Record<string, string> = {
    order_submitted: "Pedido cargado y pendiente de aprobacion."
  };

  return messages[notice] ?? null;
}

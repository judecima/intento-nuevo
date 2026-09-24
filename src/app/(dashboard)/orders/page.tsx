import { OrderList } from "@/components/orders/order-list";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
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
    <section className="page">
      <PageHeader
        eyebrow="Cliente"
        title="Mis pedidos"
          description="Pedidos que enviaste al vendedor, con la etapa en la que esta cada uno."
        />

      {notice ? (
        <Notice kind="ok">{notice}</Notice>
      ) : null}

      <OrderList orders={orders} />
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

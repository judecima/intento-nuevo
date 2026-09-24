import { PendingOrdersTable } from "@/components/orders/pending-orders-table";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUserContext } from "@/lib/auth/context";
import { orderDomainErrors } from "@/lib/domain/orders";
import { listSalesOrders } from "@/lib/orders/queries";

type SalesOrdersPageProps = {
  searchParams?: {
    notice?: string | string[];
  };
};

export default async function SalesOrdersPage({ searchParams }: SalesOrdersPageProps) {
  const context = await getCurrentUserContext();
  const orders = context.activeOrganization ? await listSalesOrders(context.activeOrganization.id, ["pending", "submitted"]) : [];
  const notice = noticeMessage(first(searchParams?.notice));

  return (
    <section className="page">
      <PageHeader
        eyebrow="Vendedor"
        title="Pedidos pendientes"
          description="Pedidos que esperan tu revision antes de pasar a produccion."
        />

      {notice ? (
        <Notice kind="ok">{notice}</Notice>
      ) : null}

      <PendingOrdersTable orders={orders} />
    </section>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function noticeMessage(notice: string | undefined) {
  if (!notice) return null;
  const messages: Record<string, string> = {
    order_approved: "Pedido aprobado y listo para produccion.",
    order_changes_requested: "Pedido devuelto para correcciones.",
    [orderDomainErrors.forbidden]: "No tenes permisos para revisar ese pedido.",
    [orderDomainErrors.invalidStatus]: "El pedido ya no esta en un estado valido para esa accion.",
    [orderDomainErrors.versionConflict]: "El pedido cambio en otra operacion. Revisa la lista actual.",
    [orderDomainErrors.transitionFailed]: "No se pudo cambiar el estado del pedido."
  };

  return messages[notice] ?? null;
}

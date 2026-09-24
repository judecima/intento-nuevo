import { SalesOrdersTable } from "@/components/orders/sales-orders-table";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUserContext } from "@/lib/auth/context";
import { orderDomainErrors } from "@/lib/domain/orders";
import { listSalesOrders } from "@/lib/orders/queries";

type SalesApprovedPageProps = {
  searchParams?: {
    notice?: string | string[];
  };
};

export default async function SalesApprovedPage({ searchParams }: SalesApprovedPageProps) {
  const context = await getCurrentUserContext();
  const orders = context.activeOrganization ? await listSalesOrders(context.activeOrganization.id, ["approved"]) : [];
  const notice = noticeMessage(first(searchParams?.notice));

  return (
    <section className="page">
      <PageHeader
        eyebrow="Vendedor"
        title="Pedidos aprobados"
          description="Pedidos que ya aprobaste y siguieron a produccion."
        />

      {notice ? (
        <Notice kind="ok">{notice}</Notice>
      ) : null}

      <SalesOrdersTable orders={orders} mode="approved" />
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
    [orderDomainErrors.forbidden]: "No tenes permisos para aprobar ese pedido.",
    [orderDomainErrors.invalidStatus]: "El pedido ya no esta en un estado valido para esa accion.",
    [orderDomainErrors.versionConflict]: "El pedido cambio en otra operacion. Revisa la lista actual.",
    [orderDomainErrors.optimizationInvalid]: "La optimizacion seleccionada ya no es valida.",
    [orderDomainErrors.transitionFailed]: "No se pudo cambiar el estado del pedido."
  };

  return messages[notice] ?? null;
}

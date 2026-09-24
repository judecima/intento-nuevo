import { ProductionOrderList } from "@/components/production/production-order-list";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUserContext } from "@/lib/auth/context";
import { DEFAULT_ORGANIZATION_DELIVERY_TIME_DAYS } from "@/lib/domain/platform";
import { canAccessProduction, productionDomainErrors } from "@/lib/domain/production";
import { listActiveMachineProfiles, listProductionOrders } from "@/lib/production/queries";

type ProductionActivePageProps = {
  searchParams?: {
    notice?: string | string[];
  };
};

export default async function ProductionActivePage({ searchParams }: ProductionActivePageProps) {
  const context = await getCurrentUserContext();
  const organizationId = context.activeOrganization?.id;

  if (!organizationId || !canAccessProduction(context.role)) {
    return (
      <section className="page">
        <PageHeader eyebrow="Operario" title="En produccion" />
        <Notice kind="error">No tenes permisos para acceder a produccion.</Notice>
      </section>
    );
  }

  const [items, profiles] = organizationId
    ? await Promise.all([
        listProductionOrders(
          organizationId,
          ["production"],
          context.activeOrganization?.delivery_time_days ?? DEFAULT_ORGANIZATION_DELIVERY_TIME_DAYS
        ),
        listActiveMachineProfiles(organizationId)
      ])
    : [[], []];
  const notice = noticeMessage(first(searchParams?.notice));

  return (
    <section className="page">
      <PageHeader
        eyebrow="Operario"
        title="En produccion"
          description="Trabajos con el corte ya iniciado."
        />
      {notice ? (
        <Notice kind="ok">{notice}</Notice>
      ) : null}
      <ProductionOrderList items={items} machineProfiles={profiles} mode="active" returnTo="/production/active" />
    </section>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function noticeMessage(notice: string | undefined) {
  if (!notice) return null;
  const messages: Record<string, string> = {
    xml_generated: "XML generado y guardado en Storage privado.",
    production_edgebanding: "Pedido pasado a pegado de canto.",
    production_completed: "Produccion finalizada.",
    [productionDomainErrors.forbidden]: "No tenes permisos para realizar esta accion.",
    [productionDomainErrors.invalidOrderStatus]: "El pedido ya no esta en un estado valido.",
    [productionDomainErrors.orderVersionConflict]: "El pedido cambio en otra operacion. Revisa la cola actual.",
    [productionDomainErrors.xmlGenerationFailed]: "No se pudo generar el XML desde el snapshot aprobado.",
    [productionDomainErrors.storageUploadFailed]: "No se pudo guardar el XML en Storage.",
    [productionDomainErrors.auditFailed]: "No se pudo registrar la auditoria de la descarga.",
    [productionDomainErrors.transitionFailed]: "No se pudo cambiar el estado de produccion."
  };

  return messages[notice] ?? null;
}

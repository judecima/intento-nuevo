import { ProductionOrderList } from "@/components/production/production-order-list";
import { getCurrentUserContext } from "@/lib/auth/context";
import { canAccessProduction, productionDomainErrors } from "@/lib/domain/production";
import { listActiveMachineProfiles, listProductionOrders } from "@/lib/production/queries";

type ProductionCompletedPageProps = {
  searchParams?: {
    notice?: string | string[];
  };
};

export default async function ProductionCompletedPage({ searchParams }: ProductionCompletedPageProps) {
  const context = await getCurrentUserContext();
  const organizationId = context.activeOrganization?.id;

  if (!organizationId || !canAccessProduction(context.role)) {
    return (
      <section className="max-w-6xl">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--teal)]">Operario</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Finalizados</h1>
        <div className="mt-5 border border-[var(--line)] bg-white p-5 text-sm text-[var(--muted)]">
          No tenes permisos para acceder a produccion.
        </div>
      </section>
    );
  }

  const [items, profiles] = organizationId
    ? await Promise.all([listProductionOrders(organizationId, ["completed"]), listActiveMachineProfiles(organizationId)])
    : [[], []];
  const notice = noticeMessage(first(searchParams?.notice));

  return (
    <section className="max-w-7xl space-y-5">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--teal)]">Operario</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Finalizados</h1>
      </div>
      {notice ? (
        <div className="border-l-4 border-[var(--teal)] bg-white px-4 py-3 text-sm text-[var(--ink)]">{notice}</div>
      ) : null}
      <ProductionOrderList items={items} machineProfiles={profiles} mode="completed" returnTo="/production/completed" />
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
    [productionDomainErrors.fileNotFound]: "No se encontro el archivo solicitado.",
    [productionDomainErrors.forbidden]: "No tenes permisos para realizar esta accion.",
    [productionDomainErrors.xmlGenerationFailed]: "No se pudo generar el XML desde el snapshot aprobado.",
    [productionDomainErrors.storageUploadFailed]: "No se pudo guardar el XML en Storage.",
    [productionDomainErrors.auditFailed]: "No se pudo registrar la auditoria de la descarga."
  };

  return messages[notice] ?? null;
}

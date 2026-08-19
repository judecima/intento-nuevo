import Link from "next/link";
import { notFound } from "next/navigation";
import { PendingSubmitButton } from "@/components/forms/pending-submit-button";
import { MaterialImage } from "@/components/materials/material-image";
import { ProjectWorkspace } from "@/components/projects/project-workspace";
import { getCurrentUserContext } from "@/lib/auth/context";
import { canEditProject, projectDomainErrors, projectStatusLabels, type ProjectStatus } from "@/lib/domain/projects";
import { optimizationDomainErrors } from "@/lib/domain/optimizations";
import { canSubmitOrder, orderDomainErrors, orderStatusLabels } from "@/lib/domain/orders";
import { canManagePlatform } from "@/lib/domain/platform";
import { buildCutPlanView } from "@/lib/optimizations/plan-view";
import { getLatestOptimizationAttempt, getLatestOptimizationForProject } from "@/lib/optimizations/queries";
import { submitProjectOrderAction } from "@/lib/orders/actions";
import { getActiveOrderForProject } from "@/lib/orders/queries";
import { listBoardMaterialsForOrganization } from "@/lib/materials/queries";
import { getProjectEditorData } from "@/lib/projects/queries";
import { formatDateTimeEsAr } from "@/lib/format/dates";

type ProjectPageProps = {
  params: {
    projectId: string;
  };
  searchParams?: {
    notice?: string | string[];
  };
};

export default async function ProjectPage({ params, searchParams }: ProjectPageProps) {
  const [context, data, optimization, lastAttempt, activeOrder] = await Promise.all([
    getCurrentUserContext(),
    getProjectEditorData(params.projectId),
    getLatestOptimizationForProject(params.projectId),
    getLatestOptimizationAttempt(params.projectId),
    getActiveOrderForProject(params.projectId)
  ]);

  if (!data) notFound();

  // El catalogo es el de la organizacion DEL PROYECTO, no el de la sesion: el
  // super usuario puede estar editando un proyecto de otra organizacion.
  const boardMaterials = await listBoardMaterialsForOrganization(data.project.organization_id);
  const editableBoardMaterials =
    data.material && !boardMaterials.some((material) => material.id === data.material?.id)
      ? [
          {
            ...data.material,
            width: Number(data.project.board_width),
            height: Number(data.project.board_height),
            thickness: Number(data.project.board_thickness),
            has_grain: Boolean(data.project.grain_enabled),
            dimensionsLabel: `${Number(data.project.board_width)} x ${Number(data.project.board_height)} mm`,
            displayImageUrl: data.material.displayImageUrl
          },
          ...boardMaterials
        ]
      : boardMaterials;
  const editable = canEditProject(context.role, data.project.status, { platformAdmin: canManagePlatform(context) });
  const planIsCurrent = optimization?.result.project_version === Number(data.project.version);
  const submittable =
    canSubmitOrder(context.role, { platformAdmin: canManagePlatform(context) }) &&
    data.project.status === "optimized" &&
    planIsCurrent &&
    !activeOrder;
  const notice = noticeMessage(first(searchParams?.notice));

  const storedPlan = optimization
    ? buildCutPlanView({
        job: optimization.job,
        result: optimization.result,
        boards: optimization.boards,
        pieces: optimization.pieces,
        cuts: optimization.cuts,
        remnants: optimization.remnants,
        project: {
          version: Number(data.project.version),
          board_width: Number(data.project.board_width),
          board_height: Number(data.project.board_height),
          board_thickness: Number(data.project.board_thickness),
          kerf: Number(data.project.kerf),
          trim_x: Number(data.project.trim_x),
          trim_y: Number(data.project.trim_y),
          min_remnant: Number(data.project.min_remnant),
          grain_enabled: Boolean(data.project.grain_enabled)
        },
        material: data.material ? { code: data.material.code, description: data.material.description } : null
      })
    : null;

  return (
    <section className="mx-auto max-w-[1500px] space-y-5">
      <header className="no-print flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Link href="/projects" className="focus-ring text-[12px] text-[var(--teal)] hover:underline">
            ← Volver a proyectos
          </Link>
          <div className="mt-3 eyebrow">Proyecto</div>
          <h1 className="mt-1.5 truncate text-[30px] font-bold tracking-[-0.025em]">{data.project.name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className={`badge ${statusBadgeClass(data.project.status)}`}>
              {projectStatusLabels[data.project.status]}
            </span>
            <span className="badge chip-mono">v{data.project.version}</span>
            <span className="badge chip-mono">
              {Math.round(Number(data.project.board_width))} × {Math.round(Number(data.project.board_height))} mm
            </span>
            <span className="badge chip-mono">{Number(data.project.board_thickness)} mm</span>
            {data.project.grain_enabled ? <span className="badge badge-accent">con veta</span> : null}
            {!editable ? <span className="badge">Solo lectura</span> : null}
          </div>
        </div>

        <div className="metric-grid w-full max-w-[430px]">
          <Metric label="Filas" value={data.metrics.itemRows.toString()} />
          <Metric label="Piezas" value={data.metrics.totalPieces.toString()} />
          <Metric label="m² a cortar" value={data.metrics.totalAreaM2.toFixed(2)} />
        </div>
      </header>

      {notice ? (
        <div className="no-print rounded-[var(--r-md)] border border-[var(--line)] border-l-4 border-l-[var(--teal)] bg-white px-4 py-3 text-sm shadow-panel">
          {notice}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <ProjectWorkspace
            projectId={data.project.id}
            version={Number(data.project.version)}
            editable={editable}
            settings={{
              materialId: data.project.material_id,
              boardWidth: Number(data.project.board_width),
              boardHeight: Number(data.project.board_height),
              boardThickness: Number(data.project.board_thickness),
              grainEnabled: Boolean(data.project.grain_enabled),
              name: data.project.name,
              description: data.project.description ?? "",
              kerf: Number(data.project.kerf),
              trimX: Number(data.project.trim_x),
              trimY: Number(data.project.trim_y),
              minRemnant: Number(data.project.min_remnant),
              minCutSize: Number(data.project.min_cut_size)
            }}
            boardMaterials={editableBoardMaterials.map((material) => ({
              id: material.id,
              code: material.code,
              description: material.description,
              width: Number(material.width),
              height: Number(material.height),
              thickness: Number(material.thickness),
              hasGrain: Boolean(material.has_grain),
              dimensionsLabel: material.dimensionsLabel,
              imageUrl: material.displayImageUrl
            }))}
            items={data.items.map((item) => ({
              id: item.id,
              reference: item.reference,
              description: item.description ?? "",
              quantity: Number(item.quantity),
              width: Number(item.width),
              height: Number(item.height),
              grain: Boolean(item.grain),
              canRotate: Boolean(item.can_rotate),
              edgeTop: Boolean(item.edge_top),
              edgeBottom: Boolean(item.edge_bottom),
              edgeLeft: Boolean(item.edge_left),
              edgeRight: Boolean(item.edge_right)
            }))}
            storedPlan={storedPlan}
            storedPlanSavedAt={storedPlan ? formatDateTimeEsAr(storedPlan.meta.createdAt) : null}
            lastAttempt={
              lastAttempt
                ? {
                    status: lastAttempt.status,
                    error: lastAttempt.error,
                    at: lastAttempt.completed_at ?? lastAttempt.created_at,
                    strategy: lastAttempt.strategy
                  }
                : null
            }
          />

          <section className="card no-print">
            <div className="card-head">
              <div>
                <div className="eyebrow-muted">Pedido</div>
                <h2 className="mt-1 text-[19px] font-bold">Envio a vendedor</h2>
              </div>
              {activeOrder ? <span className="badge badge-teal">{orderStatusLabels[activeOrder.status]}</span> : null}
            </div>
            <div className="p-4">
              {activeOrder ? (
                <p className="text-sm text-[var(--muted)]">
                  Ya existe un pedido activo para este proyecto. Segui su estado desde{" "}
                  <Link href="/orders" className="text-[var(--teal)] hover:underline">
                    Mis pedidos
                  </Link>
                  .
                </p>
              ) : submittable && optimization ? (
                <form action={submitProjectOrderAction} className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                  <input type="hidden" name="projectId" value={data.project.id} />
                  <input type="hidden" name="optimizationResultId" value={optimization.result.id} />
                  <input type="hidden" name="expectedProjectVersion" value={data.project.version} />
                  <label className="block">
                    <span className="field-label">Nota para el vendedor</span>
                    <textarea name="notesCustomer" rows={3} className="textarea mt-1.5" />
                  </label>
                  <PendingSubmitButton
                    pendingLabel="Enviando pedido..."
                    className="btn btn-primary focus-ring"
                  >
                    Enviar pedido
                  </PendingSubmitButton>
                </form>
              ) : (
                <p className="text-sm text-[var(--muted)]">
                  {!optimization
                    ? "Este proyecto todavia no tiene una optimizacion guardada. Usa \"Optimizar para enviar\" en el panel del plano."
                    : !planIsCurrent
                      ? "Hay cambios pendientes. Usa \"Guardar y optimizar\" para actualizar el plano antes de enviar."
                      : "El proyecto debe estar optimizado para enviarse como pedido. Usa \"Reoptimizar\" y espera a que finalice."}
                </p>
              )}
            </div>
          </section>
        </div>

        <aside className="no-print h-fit space-y-5 xl:sticky xl:top-[86px]">
          <section className="card overflow-hidden">
            <div className="relative aspect-[4/3] overflow-hidden border-b border-[var(--line)] bg-[#dfe5df]">
              <MaterialImage src={data.material?.displayImageUrl ?? null} alt={data.material?.description ?? "Material"} />
            </div>
            <div className="space-y-3 p-4">
              <div>
                <div className="font-mono text-[10.5px] text-[var(--muted)]">{data.material?.code ?? "Sin codigo"}</div>
                <h2 className="mt-1 text-[16px] font-bold leading-tight">
                  {data.material?.description ?? "Material no disponible"}
                </h2>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-[13px]">
                <Detail
                  label="Tablero"
                  value={`${Number(data.project.board_width)} × ${Number(data.project.board_height)} mm`}
                />
                <Detail label="Espesor" value={`${Number(data.project.board_thickness)} mm`} />
                <Detail label="Veta" value={data.project.grain_enabled ? "Con veta" : "Sin veta"} />
                <Detail label="Catalogo" value={data.material?.dimensionsLabel ?? "Snapshot"} />
              </dl>
              <p className="hint">
                Mientras el proyecto este editable, podes cambiar el tablero desde Parametros y volver a optimizar.
              </p>
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="field-label">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}

function statusBadgeClass(status: ProjectStatus): string {
  if (status === "optimized" || status === "approved" || status === "completed") return "badge-ok";
  if (status === "rejected" || status === "cancelled") return "badge-danger";
  if (status === "draft") return "";
  return "badge-teal";
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function noticeMessage(notice: string | undefined) {
  if (!notice) return null;

  const messages: Record<string, string> = {
    project_saved: "Proyecto guardado.",
    optimization_completed: "Optimizacion completada y guardada.",
    [optimizationDomainErrors.failed]: "La optimizacion fallo. Los datos del proyecto se conservaron sin cambios.",
    [optimizationDomainErrors.noItems]: "Carga al menos una pieza antes de optimizar.",
    [optimizationDomainErrors.projectNotFound]: "Proyecto no encontrado.",
    [orderDomainErrors.alreadyExists]: "Ya existe un pedido activo para esta optimizacion.",
    [orderDomainErrors.forbidden]: "No tenes permisos para realizar esta accion.",
    [orderDomainErrors.projectInvalidStatus]: "El proyecto debe estar optimizado antes de enviarse como pedido.",
    [orderDomainErrors.optimizationInvalid]: "La optimizacion seleccionada no es valida para enviar el pedido.",
    [orderDomainErrors.transitionFailed]: "No se pudo enviar el pedido.",
    [projectDomainErrors.versionConflict]:
      "El proyecto cambio en otra operacion. Actualiza la pagina para ver los datos vigentes."
  };

  return messages[notice] ?? null;
}

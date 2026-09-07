"use client";

import { useMemo } from "react";
import {
  MaterialReactTable,
  useMaterialReactTable,
  type MRT_ColumnDef,
  type MRT_Row
} from "material-react-table";
import { MRT_Localization_ES } from "material-react-table/locales/es";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { SxProps, Theme } from "@mui/material/styles";
import {
  BrandedMuiThemeProvider,
  brandedTableBodyCellSx,
  brandedTableContainerSx,
  brandedTableHeadCellSx,
  brandedTablePaperSx
} from "@/components/ui/branded-mui-theme";
import { PendingSubmitButton } from "@/components/forms/pending-submit-button";
import {
  completeProductionAction,
  downloadGeneratedFileAction,
  generateProductionXmlAction,
  startEdgebandingAction,
  startProductionAction
} from "@/lib/production/actions";
import type {
  GeneratedFileRow,
  MachineProfileRow,
  ProductionOrderItem
} from "@/lib/production/queries";
import { getOrderSnapshotSummary, orderStatusLabels, type OrderStatus } from "@/lib/domain/orders";
import { processDeliveryStatusLabels } from "@/lib/domain/process";
import { generatedFileTypeLabels, productionJobStatusLabels } from "@/lib/domain/production";
import { formatDateOnlyEsAr, formatDateTimeEsAr } from "@/lib/format/dates";

type ProductionMode = "queue" | "approved" | "active" | "edgebanding" | "completed";

type ProductionOrderListProps = {
  items: ProductionOrderItem[];
  machineProfiles: MachineProfileRow[];
  mode: ProductionMode;
  returnTo: string;
};

const modeCountLabels: Record<ProductionMode, string> = {
  queue: "trabajos activos",
  approved: "pedidos aprobados",
  active: "pedidos en produccion",
  edgebanding: "pedidos en pegado de canto",
  completed: "pedidos finalizados"
};

export function ProductionOrderList({ items, machineProfiles, mode, returnTo }: ProductionOrderListProps) {
  const columns = useMemo<MRT_ColumnDef<ProductionOrderItem>[]>(
    () => [
      {
        id: "order",
        accessorFn: (item) => item.order.id.slice(0, 8),
        header: "Pedido",
        size: 100,
        Cell: ({ cell }) => <Typography sx={{ fontFamily: "monospace", fontSize: 12, fontWeight: 800 }}>{cell.getValue<string>()}</Typography>
      },
      {
        id: "status",
        accessorFn: (item) => orderStatusLabels[item.order.status],
        header: "Estado",
        size: 150,
        Cell: ({ row }) => (
          <Chip
            size="small"
            color={productionStatusChipColor(row.original.order.status)}
            label={orderStatusLabels[row.original.order.status]}
          />
        )
      },
      {
        id: "deliveryOn",
        accessorFn: (item) => item.deliveryOn ?? "",
        header: "Fecha entrega",
        size: 140,
        enableHiding: false,
        Cell: ({ row }) => formatDateOnlyEsAr(row.original.deliveryOn)
      },
      {
        id: "deliveryStatus",
        accessorFn: (item) => item.deliveryStatus,
        header: "Estado entrega",
        size: 170,
        enableHiding: false,
        Cell: ({ row }) => <DeliveryStatusChip status={row.original.deliveryStatus} />
      },
      {
        id: "project",
        accessorFn: (item) => getOrderSnapshotSummary(item.order.snapshot).projectName,
        header: "Proyecto",
        size: 220
      },
      {
        id: "customer",
        accessorFn: (item) => getOrderSnapshotSummary(item.order.snapshot).customerName,
        header: "Cliente",
        size: 220,
        Cell: ({ row }) => {
          const summary = getOrderSnapshotSummary(row.original.order.snapshot);
          return <Stack spacing={0.25}><Typography sx={{ fontSize: 14, fontWeight: 800 }}>{summary.customerName}</Typography><Typography sx={{ color: "var(--md-on-surface-variant)", fontSize: 12 }}>{summary.customerEmail}</Typography></Stack>;
        }
      },
      {
        id: "material",
        accessorFn: (item) => getOrderSnapshotSummary(item.order.snapshot).materialDescription,
        header: "Material",
        size: 250
      },
      { id: "boards", accessorFn: (item) => getOrderSnapshotSummary(item.order.snapshot).boardCount, header: "Placas", size: 85 },
      { id: "pieces", accessorFn: (item) => getOrderSnapshotSummary(item.order.snapshot).totalPieces, header: "Piezas", size: 85 },
      {
        id: "edgeBand045Meters",
        accessorFn: (item) => getOrderSnapshotSummary(item.order.snapshot).edgeBand045Meters,
        header: "ML canto 0,45",
        size: 125,
        Cell: ({ cell }) => `${cell.getValue<number>().toFixed(2)} m`
      },
      {
        id: "edgeBand2mmMeters",
        accessorFn: (item) => getOrderSnapshotSummary(item.order.snapshot).edgeBand2mmMeters,
        header: "ML canto 2 mm",
        size: 125,
        Cell: ({ cell }) => `${cell.getValue<number>().toFixed(2)} m`
      },
      {
        id: "updated",
        accessorKey: "order.updated_at",
        header: "Actualizado",
        size: 160,
        Cell: ({ row }) => formatDateTimeEsAr(row.original.order.updated_at)
      }
    ],
    []
  );

  const table = useMaterialReactTable({
    columns,
    data: items,
    layoutMode: "grid",
    localization: MRT_Localization_ES,
    enableColumnFilters: true,
    enableColumnPinning: true,
    enableColumnResizing: true,
    enableDensityToggle: true,
    enableExpanding: true,
    enableFullScreenToggle: true,
    enableRowActions: true,
    enableStickyHeader: true,
    getRowId: (row) => row.order.id,
    initialState: {
      density: "compact",
      pagination: { pageIndex: 0, pageSize: 25 },
      showColumnFilters: true,
      sorting: [{ id: "updated", desc: true }],
      columnPinning: { left: ["order", "status", "deliveryOn", "deliveryStatus"], right: ["mrt-row-actions"] }
    },
    muiTablePaperProps: { sx: brandedTablePaperSx },
    muiTableContainerProps: { sx: brandedTableContainerSx("calc(100vh - 300px)") },
    muiTableHeadCellProps: { sx: brandedTableHeadCellSx },
    muiTableBodyCellProps: { sx: brandedTableBodyCellSx },
    muiTableBodyRowProps: ({ row }) => ({
      sx: deliveryAlertRowSx(row.original.deliveryAlert)
    }),
    renderRowActions: ({ row }) => <Button size="small" variant="outlined" onClick={() => row.toggleExpanded()}>{row.getIsExpanded() ? "Cerrar" : "Detalle"}</Button>,
    renderDetailPanel: ({ row }) => <ProductionOrderCard row={row} machineProfiles={machineProfiles} mode={mode} returnTo={returnTo} />,
    renderTopToolbarCustomActions: () => <Typography sx={{ color: "var(--md-on-surface-variant)", fontSize: 13, fontWeight: 700 }}>{items.length} {modeCountLabels[mode]}</Typography>
  });

  if (items.length === 0) {
    return (
      <div className="rounded-[var(--r)] border border-dashed border-[var(--linea-fuerte)] bg-[rgba(255,255,255,.45)] p-8 text-center text-sm text-[var(--muted)]">
        No hay pedidos en esta cola.
      </div>
    );
  }

  return <BrandedMuiThemeProvider><MaterialReactTable table={table} /></BrandedMuiThemeProvider>;
}

function ProductionOrderCard({
  row,
  machineProfiles,
  mode,
  returnTo
}: {
  row: MRT_Row<ProductionOrderItem>;
  machineProfiles: MachineProfileRow[];
  mode: ProductionMode;
  returnTo: string;
}) {
  const item = row.original;
  const summary = getOrderSnapshotSummary(item.order.snapshot);

  return (
    <article className="overflow-hidden rounded-[var(--r)] border border-[var(--line)] bg-[var(--md-surface-container-lowest)]">
      <div className="flex flex-col gap-3 border-b border-[var(--line)] px-4 py-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="font-mono text-xs text-[var(--muted)]">{item.order.id.slice(0, 8)}</div>
          <h2 className="mt-1 text-[20px] font-bold">{summary.projectName}</h2>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
            <span className="rounded-[var(--r)] border border-[var(--line)] bg-[var(--md-surface-container)] px-2 py-1">
              {orderStatusLabels[item.order.status]}
            </span>
            {item.job ? (
              <span className="rounded-[var(--r)] border border-[var(--line)] bg-[var(--md-surface-container)] px-2 py-1">
                {productionJobStatusLabels[item.job.status]}
              </span>
            ) : null}
            <span className="rounded-[var(--r)] border border-[var(--line)] bg-[var(--md-surface-container)] px-2 py-1">Version {item.order.version}</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-[var(--r)] border border-[var(--line)] bg-[var(--line)] text-sm md:grid-cols-5">
          <Metric label="Placas" value={summary.boardCount.toString()} />
          <Metric label="Piezas" value={summary.totalPieces.toString()} />
          <Metric label="Aprov." value={`${summary.utilizationPercentage.toFixed(1)}%`} />
          <Metric label="Canto 0,45" value={`${summary.edgeBand045Meters.toFixed(2)} m`} />
          <Metric label="Canto 2 mm" value={`${summary.edgeBand2mmMeters.toFixed(2)} m`} />
        </div>
      </div>

      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <dl className="grid gap-3 text-sm md:grid-cols-2">
            <Detail label="Material" value={summary.materialDescription} />
            <Detail label="Cliente" value={customerLabel(summary.customerName, summary.customerEmail)} />
            <Detail label="Fecha entrega" value={formatDateOnlyEsAr(item.deliveryOn) || "Sin aprobacion"} />
            <Detail label="Estado entrega" value={processDeliveryStatusLabels[item.deliveryStatus]} />
            <Detail label="Canto 0,45" value={`${summary.edgeBand045Meters.toFixed(2)} m`} />
            <Detail label="Canto 2 mm" value={`${summary.edgeBand2mmMeters.toFixed(2)} m`} />
            <Detail label="Inicio" value={item.job?.started_at ? formatDateTimeEsAr(item.job.started_at) : "Sin iniciar"} />
            <Detail label="Fin" value={item.job?.completed_at ? formatDateTimeEsAr(item.job.completed_at) : "Pendiente"} />
          </dl>

          <GeneratedFiles files={item.files} returnTo={returnTo} />
        </div>

        <div className="space-y-3">
          <GenerateXmlForm orderId={item.order.id} machineProfiles={machineProfiles} returnTo={returnTo} />
          {(mode === "approved" || mode === "queue") && item.order.status === "approved" ? (
            <StartProductionForm
              orderId={item.order.id}
              expectedOrderVersion={item.order.version}
              machineProfiles={machineProfiles}
              returnTo={returnTo}
            />
          ) : null}
          {(mode === "active" || mode === "queue") && item.order.status === "production" ? (
            <StartEdgebandingForm orderId={item.order.id} expectedOrderVersion={item.order.version} returnTo={returnTo} />
          ) : null}
          {(mode === "active" || mode === "edgebanding" || mode === "queue") &&
          (item.order.status === "production" || item.order.status === "edgebanding") ? (
            <CompleteProductionForm
              orderId={item.order.id}
              expectedOrderVersion={item.order.version}
              orderStatus={item.order.status}
              returnTo={returnTo}
            />
          ) : null}
        </div>
      </div>
    </article>
  );
}

function GenerateXmlForm({
  orderId,
  machineProfiles,
  returnTo
}: {
  orderId: string;
  machineProfiles: MachineProfileRow[];
  returnTo: string;
}) {
  return (
    <form action={generateProductionXmlAction} className="space-y-3 rounded-[var(--r)] border border-[var(--line)] p-3">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <MachineProfileSelect profiles={machineProfiles} />
      <PendingSubmitButton
        pendingLabel="Generando XML..."
        className="focus-ring w-full rounded-[var(--r)] border border-[var(--teal)] px-4 py-3 text-sm font-semibold text-[var(--teal)] hover:bg-[var(--brand-primary-hover-surface)]"
      >
        Generar XML
      </PendingSubmitButton>
    </form>
  );
}

function StartProductionForm({
  orderId,
  expectedOrderVersion,
  machineProfiles,
  returnTo
}: {
  orderId: string;
  expectedOrderVersion: number;
  machineProfiles: MachineProfileRow[];
  returnTo: string;
}) {
  return (
    <form action={startProductionAction} className="space-y-3 rounded-[var(--r)] border border-[var(--line)] p-3">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="expectedOrderVersion" value={expectedOrderVersion} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <MachineProfileSelect profiles={machineProfiles} />
      <TextArea label="Notas produccion" name="notes" />
      <PendingSubmitButton
        pendingLabel="Iniciando produccion..."
        className="focus-ring w-full rounded-[var(--r)] bg-[var(--teal)] px-4 py-3 text-sm font-semibold text-white hover:bg-[var(--teal-claro)]"
      >
        Iniciar produccion
      </PendingSubmitButton>
    </form>
  );
}

function StartEdgebandingForm({
  orderId,
  expectedOrderVersion,
  returnTo
}: {
  orderId: string;
  expectedOrderVersion: number;
  returnTo: string;
}) {
  return (
    <form action={startEdgebandingAction} className="space-y-3 rounded-[var(--r)] border border-[var(--line)] p-3">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="expectedOrderVersion" value={expectedOrderVersion} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <TextArea label="Notas pegado" name="notes" />
      <PendingSubmitButton
        pendingLabel="Pasando a pegado..."
        className="focus-ring w-full rounded-[var(--r)] border border-[var(--teal)] px-4 py-3 text-sm font-semibold text-[var(--teal)] hover:bg-[var(--brand-primary-hover-surface)]"
      >
        Pasar a pegado de canto
      </PendingSubmitButton>
    </form>
  );
}

function CompleteProductionForm({
  orderId,
  expectedOrderVersion,
  orderStatus,
  returnTo
}: {
  orderId: string;
  expectedOrderVersion: number;
  orderStatus: OrderStatus;
  returnTo: string;
}) {
  const isEdgebanding = orderStatus === "edgebanding";

  return (
    <form action={completeProductionAction} className="space-y-3 rounded-[var(--r)] border border-[var(--line)] p-3">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="expectedOrderVersion" value={expectedOrderVersion} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <TextArea label="Notas cierre" name="notes" />
      <PendingSubmitButton
        pendingLabel={isEdgebanding ? "Finalizando pegado..." : "Finalizando produccion..."}
        className="focus-ring w-full rounded-[var(--r)] bg-[var(--teal)] px-4 py-3 text-sm font-semibold text-white hover:bg-[var(--teal-claro)]"
      >
        {isEdgebanding ? "Finalizar pegado" : "Finalizar produccion"}
      </PendingSubmitButton>
    </form>
  );
}

function MachineProfileSelect({ profiles }: { profiles: MachineProfileRow[] }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Maquina</span>
      <select
        name="machineProfileId"
        className="mt-2 w-full rounded-[var(--r)] border border-[var(--line)] bg-[var(--md-surface-container-lowest)] px-3 py-2 text-sm focus-ring"
      >
        <option value="">Perfil por defecto</option>
        {profiles.map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function GeneratedFiles({ files, returnTo }: { files: GeneratedFileRow[]; returnTo: string }) {
  if (files.length === 0) {
    return (
      <div className="border border-[var(--line)] bg-[var(--md-surface-container)] p-3 text-sm text-[var(--muted)]">
        No hay XML generado para este pedido.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {files.map((file) => (
        <div key={file.id} className="flex flex-col gap-2 rounded-[var(--r)] border border-[var(--line)] p-3 text-sm md:flex-row md:items-center md:justify-between">
          <div>
            <div className="font-semibold">{generatedFileTypeLabels[file.type]}</div>
            <div className="mt-1 font-mono text-xs text-[var(--muted)]">{file.checksum.slice(0, 16)}</div>
          </div>
          <form action={downloadGeneratedFileAction}>
            <input type="hidden" name="fileId" value={file.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <PendingSubmitButton
              pendingLabel="Preparando..."
              className="focus-ring rounded-[var(--r)] border border-[var(--line)] px-3 py-2 text-sm hover:border-[var(--linea-fuerte)]"
            >
              Descargar
            </PendingSubmitButton>
          </form>
        </div>
      ))}
    </div>
  );
}

function TextArea({ label, name }: { label: string; name: string }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{label}</span>
      <textarea
        name={name}
        rows={3}
        className="mt-2 w-full rounded-[var(--r)] border border-[var(--line)] px-3 py-2 text-sm focus-ring"
      />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[68px] bg-[var(--md-surface-container-lowest)] px-3 py-2 text-center">
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

function deliveryAlertRowSx(alert: ProductionOrderItem["deliveryAlert"]): SxProps<Theme> | undefined {
  if (alert === "overdue") {
    return {
      "& > td": { backgroundColor: "#ef4444", color: "#ffffff" },
      "&:hover > td": { backgroundColor: "#dc2626", color: "#ffffff" }
    };
  }

  if (alert === "due_soon") {
    return {
      "& > td": { backgroundColor: "#facc15", color: "#1f2937" },
      "&:hover > td": { backgroundColor: "#eab308", color: "#111827" }
    };
  }

  return undefined;
}

function DeliveryStatusChip({ status }: { status: ProductionOrderItem["deliveryStatus"] }) {
  const colorByStatus: Record<ProductionOrderItem["deliveryStatus"], "default" | "error" | "success" | "warning"> = {
    overdue: "error",
    due_soon: "warning",
    on_time: "default",
    delivered: "success"
  };

  return (
    <Chip
      size="small"
      label={processDeliveryStatusLabels[status]}
      color={colorByStatus[status]}
      variant={status === "on_time" ? "outlined" : "filled"}
    />
  );
}

function customerLabel(name: string, email: string) {
  return email ? `${name} - ${email}` : name;
}

function productionStatusChipColor(status: OrderStatus): "default" | "primary" | "success" | "warning" {
  if (status === "production") return "warning";
  if (status === "edgebanding") return "primary";
  if (status === "completed" || status === "delivered") return "success";
  return "default";
}

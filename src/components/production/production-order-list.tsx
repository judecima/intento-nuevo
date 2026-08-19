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
import { createTheme, ThemeProvider } from "@mui/material/styles";
import {
  PendingSubmitButton
} from "@/components/forms/pending-submit-button";
import {
  completeProductionAction,
  downloadGeneratedFileAction,
  generateProductionXmlAction,
  startProductionAction
} from "@/lib/production/actions";
import type {
  GeneratedFileRow,
  MachineProfileRow,
  ProductionOrderItem
} from "@/lib/production/queries";
import { getOrderSnapshotSummary, orderStatusLabels } from "@/lib/domain/orders";
import { generatedFileTypeLabels, productionJobStatusLabels } from "@/lib/domain/production";
import { formatDateTimeEsAr } from "@/lib/format/dates";

type ProductionMode = "queue" | "approved" | "active" | "completed";

type ProductionOrderListProps = {
  items: ProductionOrderItem[];
  machineProfiles: MachineProfileRow[];
  mode: ProductionMode;
  returnTo: string;
};

export function ProductionOrderList({ items, machineProfiles, mode, returnTo }: ProductionOrderListProps) {
  const theme = useMemo(
    () => createTheme({
      palette: {
        primary: { main: "#0f766e" },
        background: { default: "#dde6e3", paper: "#ffffff" },
        text: { primary: "#17201f", secondary: "#5f6f6c" }
      },
      shape: { borderRadius: 8 },
      typography: { fontFamily: "inherit" },
      components: { MuiButton: { styleOverrides: { root: { textTransform: "none", fontWeight: 700 } } } }
    }),
    []
  );

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
        Cell: ({ row }) => <Chip size="small" color={row.original.order.status === "production" ? "warning" : "success"} label={orderStatusLabels[row.original.order.status]} />
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
          return <Stack spacing={0.25}><Typography sx={{ fontSize: 14, fontWeight: 800 }}>{summary.customerName}</Typography><Typography sx={{ color: "#5f6f6c", fontSize: 12 }}>{summary.customerEmail}</Typography></Stack>;
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
      columnPinning: { left: ["order", "status"], right: ["mrt-row-actions"] }
    },
    muiTablePaperProps: { sx: { border: "1px solid var(--line)", borderRadius: "8px", overflow: "hidden" } },
    muiTableContainerProps: { sx: { maxHeight: "calc(100vh - 300px)", backgroundColor: "#fff" } },
    muiTableHeadCellProps: { sx: { backgroundColor: "#eef3f1", color: "#17201f", fontSize: 12, fontWeight: 800 } },
    muiTableBodyCellProps: { sx: { borderColor: "var(--line)", fontSize: 13 } },
    renderRowActions: ({ row }) => <Button size="small" variant="outlined" onClick={() => row.toggleExpanded()}>{row.getIsExpanded() ? "Cerrar" : "Detalle"}</Button>,
    renderDetailPanel: ({ row }) => <ProductionOrderCard row={row} machineProfiles={machineProfiles} mode={mode} returnTo={returnTo} />,
    renderTopToolbarCustomActions: () => <Typography sx={{ color: "#5f6f6c", fontSize: 13, fontWeight: 700 }}>{items.length} pedidos en cola</Typography>
  });

  if (items.length === 0) {
    return (
      <div className="rounded-[var(--r)] border border-dashed border-[var(--linea-fuerte)] bg-[rgba(255,255,255,.45)] p-8 text-center text-sm text-[var(--muted)]">
        No hay pedidos en esta cola.
      </div>
    );
  }

  return <ThemeProvider theme={theme}><MaterialReactTable table={table} /></ThemeProvider>;
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
    <article className="overflow-hidden rounded-[var(--r)] border border-[var(--line)] bg-white">
      <div className="flex flex-col gap-3 border-b border-[var(--line)] px-4 py-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="font-mono text-xs text-[var(--muted)]">{item.order.id.slice(0, 8)}</div>
          <h2 className="mt-1 text-[20px] font-bold">{summary.projectName}</h2>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
            <span className="rounded-[var(--r)] border border-[var(--line)] bg-[#f7f8f6] px-2 py-1">
              {orderStatusLabels[item.order.status]}
            </span>
            {item.job ? (
              <span className="rounded-[var(--r)] border border-[var(--line)] bg-[#f7f8f6] px-2 py-1">
                {productionJobStatusLabels[item.job.status]}
              </span>
            ) : null}
            <span className="rounded-[var(--r)] border border-[var(--line)] bg-[#f7f8f6] px-2 py-1">Version {item.order.version}</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-[var(--r)] border border-[var(--line)] bg-[var(--line)] text-sm">
          <Metric label="Placas" value={summary.boardCount.toString()} />
          <Metric label="Piezas" value={summary.totalPieces.toString()} />
          <Metric label="Aprov." value={`${summary.utilizationPercentage.toFixed(1)}%`} />
        </div>
      </div>

      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <dl className="grid gap-3 text-sm md:grid-cols-2">
            <Detail label="Material" value={summary.materialDescription} />
            <Detail label="Cliente" value={customerLabel(summary.customerName, summary.customerEmail)} />
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
            <CompleteProductionForm orderId={item.order.id} expectedOrderVersion={item.order.version} returnTo={returnTo} />
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
        className="focus-ring w-full rounded-[var(--r)] border border-[var(--teal)] px-4 py-3 text-sm font-semibold text-[var(--teal)] hover:bg-[#f1fbf8]"
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

function CompleteProductionForm({
  orderId,
  expectedOrderVersion,
  returnTo
}: {
  orderId: string;
  expectedOrderVersion: number;
  returnTo: string;
}) {
  return (
    <form action={completeProductionAction} className="space-y-3 rounded-[var(--r)] border border-[var(--line)] p-3">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="expectedOrderVersion" value={expectedOrderVersion} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <TextArea label="Notas cierre" name="notes" />
      <PendingSubmitButton
        pendingLabel="Finalizando produccion..."
        className="focus-ring w-full rounded-[var(--r)] bg-[var(--teal)] px-4 py-3 text-sm font-semibold text-white hover:bg-[var(--teal-claro)]"
      >
        Finalizar produccion
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
        className="mt-2 w-full rounded-[var(--r)] border border-[var(--line)] bg-white px-3 py-2 text-sm focus-ring"
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
      <div className="border border-[var(--line)] bg-[#f7f9f7] p-3 text-sm text-[var(--muted)]">
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

function customerLabel(name: string, email: string) {
  return email ? `${name} - ${email}` : name;
}

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
import {
  BrandedMuiThemeProvider,
  brandedTableBodyCellSx,
  brandedTableContainerSx,
  brandedTableHeadCellSx,
  brandedTablePaperSx
} from "@/components/ui/branded-mui-theme";
import { getOrderSnapshotSummary, orderStatusLabels } from "@/lib/domain/orders";
import { formatDateTimeEsAr } from "@/lib/format/dates";
import type { OrderRow } from "@/lib/orders/queries";

type OrderListProps = {
  orders: OrderRow[];
};

type CustomerOrderTableRow = {
  id: string;
  shortId: string;
  version: number;
  statusLabel: string;
  projectName: string;
  materialDescription: string;
  submittedAt: string;
  createdAt: string;
  boardCount: number;
  totalPieces: number;
  itemRows: number;
  cutCount: number;
  sawMeters: number;
  utilizationPercentage: number;
  edgeBand045Meters: number;
  edgeBand2mmMeters: number;
  notesCustomer: string;
  notesSeller: string;
  order: OrderRow;
};

export function OrderList({ orders }: OrderListProps) {
  const rows = useMemo<CustomerOrderTableRow[]>(
    () =>
      orders.map((order) => {
        const summary = getOrderSnapshotSummary(order.snapshot);

        return {
          id: order.id,
          shortId: order.id.slice(0, 8),
          version: order.version,
          statusLabel: orderStatusLabels[order.status],
          projectName: summary.projectName,
          materialDescription: summary.materialDescription,
          submittedAt: order.submitted_at,
          createdAt: order.created_at,
          boardCount: summary.boardCount,
          totalPieces: summary.totalPieces,
          itemRows: summary.itemRows,
          cutCount: summary.cutCount,
          sawMeters: summary.sawMeters,
          utilizationPercentage: summary.utilizationPercentage,
          edgeBand045Meters: summary.edgeBand045Meters,
          edgeBand2mmMeters: summary.edgeBand2mmMeters,
          notesCustomer: order.notes_customer ?? "",
          notesSeller: order.notes_seller ?? "",
          order
        };
      }),
    [orders]
  );

  const columns = useMemo<MRT_ColumnDef<CustomerOrderTableRow>[]>(
    () => [
      {
        accessorKey: "shortId",
        header: "Pedido",
        size: 90,
        Cell: ({ cell }) => (
          <Typography component="span" sx={{ fontFamily: "monospace", fontSize: 12, fontWeight: 800 }}>
            {cell.getValue<string>()}
          </Typography>
        )
      },
      {
        accessorKey: "statusLabel",
        header: "Estado",
        size: 140,
        Cell: ({ row }) => (
          <Chip
            size="small"
            color={statusColor(row.original.order.status)}
            variant={row.original.order.status === "completed" || row.original.order.status === "delivered" ? "filled" : "outlined"}
            label={row.original.statusLabel}
          />
        )
      },
      {
        accessorKey: "projectName",
        header: "Proyecto",
        size: 260,
        Cell: ({ row }) => (
          <Stack spacing={0.25}>
            <Typography sx={{ fontSize: 14, fontWeight: 800 }}>{row.original.projectName}</Typography>
            <Typography sx={{ color: "var(--md-on-surface-variant)", fontSize: 12 }}>
              {row.original.materialDescription}
            </Typography>
          </Stack>
        )
      },
      {
        accessorKey: "boardCount",
        header: "Placas",
        size: 90
      },
      {
        accessorKey: "totalPieces",
        header: "Piezas",
        size: 90
      },
      {
        accessorKey: "cutCount",
        header: "Cortes",
        size: 90
      },
      {
        accessorKey: "sawMeters",
        header: "ML sierra",
        size: 110,
        Cell: ({ cell }) => `${cell.getValue<number>().toFixed(2)} m`
      },
      {
        accessorKey: "utilizationPercentage",
        header: "Aprov.",
        size: 100,
        Cell: ({ cell }) => `${cell.getValue<number>().toFixed(1)}%`
      },
      {
        accessorKey: "createdAt",
        header: "Creado",
        size: 160,
        Cell: ({ cell }) => formatDateTimeEsAr(cell.getValue<string>())
      },
      {
        accessorKey: "version",
        header: "Version",
        size: 100,
        Cell: ({ cell }) => (
          <Typography sx={{ fontFamily: "monospace", fontSize: 13 }}>v{cell.getValue<number>()}</Typography>
        )
      }
    ],
    []
  );

  const table = useMaterialReactTable({
    columns,
    data: rows,
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
    getRowId: (row) => row.id,
    initialState: {
      density: "compact",
      pagination: { pageIndex: 0, pageSize: 25 },
      showColumnFilters: true,
      sorting: [{ id: "createdAt", desc: true }],
      columnPinning: { left: ["shortId", "statusLabel"], right: ["mrt-row-actions"] }
    },
    muiTablePaperProps: { sx: brandedTablePaperSx },
    muiTableContainerProps: { sx: brandedTableContainerSx("calc(100vh - 275px)") },
    muiTableHeadCellProps: { sx: brandedTableHeadCellSx },
    muiTableBodyCellProps: { sx: brandedTableBodyCellSx },
    renderRowActions: ({ row }) => (
      <Button size="small" variant="outlined" onClick={() => row.toggleExpanded()}>
        {row.getIsExpanded() ? "Cerrar" : "Detalle"}
      </Button>
    ),
    renderDetailPanel: ({ row }) => <CustomerOrderDetail row={row} />,
    renderTopToolbarCustomActions: () => (
      <Typography sx={{ color: "var(--md-on-surface-variant)", fontSize: 13, fontWeight: 700 }}>
        {orders.length} pedidos
      </Typography>
    )
  });

  if (orders.length === 0) {
    return (
      <div className="rounded-[var(--r)] border border-dashed border-[var(--linea-fuerte)] bg-[rgba(255,255,255,.45)] p-8 text-center text-sm text-[var(--muted)]">
        No hay pedidos para mostrar.
      </div>
    );
  }

  return (
    <BrandedMuiThemeProvider>
      <MaterialReactTable table={table} />
    </BrandedMuiThemeProvider>
  );
}

function CustomerOrderDetail({ row }: { row: MRT_Row<CustomerOrderTableRow> }) {
  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <dl className="grid gap-3 text-sm md:grid-cols-2">
        <Detail label="Material" value={row.original.materialDescription} />
        <Detail label="Filas" value={`${row.original.itemRows}`} />
        <Detail label="Canto 0,45" value={`${row.original.edgeBand045Meters.toFixed(2)} m`} />
        <Detail label="Canto 2 mm" value={`${row.original.edgeBand2mmMeters.toFixed(2)} m`} />
        <Detail label="Enviado" value={formatDateTimeEsAr(row.original.submittedAt)} />
        <Detail label="Pedido" value={row.original.id} mono />
      </dl>

      <div className="space-y-3">
        <Note label="Nota cliente" value={row.original.notesCustomer || "Sin nota"} />
        <Note label="Nota vendedor" value={row.original.notesSeller || "Sin nota"} />
      </div>
    </div>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-[var(--r)] border border-[var(--line)] bg-[var(--md-surface-container)] p-3">
      <dt className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">{label}</dt>
      <dd className={`mt-1 break-all font-semibold ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}

function Note({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--r)] border border-[var(--line)] bg-[var(--md-surface-container-lowest)] p-3 text-sm">
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{label}</div>
      <div className="mt-2 text-[var(--ink)]">{value}</div>
    </div>
  );
}

function statusColor(status: OrderRow["status"]): "default" | "primary" | "success" | "warning" | "error" {
  if (status === "cancelled" || status === "changes_requested") return "error";
  if (status === "submitted" || status === "under_review" || status === "pending") return "warning";
  if (status === "production" || status === "edgebanding") return "primary";
  if (status === "completed" || status === "delivered") return "success";
  return "default";
}

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
import { PendingSubmitButton } from "@/components/forms/pending-submit-button";
import { getOrderSnapshotSummary, orderStatusLabels } from "@/lib/domain/orders";
import { formatDateTimeEsAr } from "@/lib/format/dates";
import { approveOrderAction, requestOrderChangesAction } from "@/lib/orders/actions";
import type { OrderRow } from "@/lib/orders/queries";

type SalesOrdersTableMode = "review" | "approved";

type SalesOrdersTableProps = {
  orders: OrderRow[];
  mode: SalesOrdersTableMode;
};

type SalesOrderTableRow = {
  id: string;
  shortId: string;
  version: number;
  statusLabel: string;
  projectName: string;
  customerName: string;
  customerEmail: string;
  materialDescription: string;
  submittedAt: string;
  reviewedAt: string | null;
  approvedAt: string | null;
  boardCount: number;
  totalPieces: number;
  itemRows: number;
  utilizationPercentage: number;
  edgeBand045Meters: number;
  edgeBand2mmMeters: number;
  wastePercentage: number;
  notesCustomer: string;
  notesSeller: string;
  order: OrderRow;
};

const modeLabels: Record<SalesOrdersTableMode, { count: string; empty: string }> = {
  review: {
    count: "pedidos en revision",
    empty: "No hay pedidos en revision."
  },
  approved: {
    count: "pedidos aprobados",
    empty: "No hay pedidos aprobados."
  }
};

export function SalesOrdersTable({ orders, mode }: SalesOrdersTableProps) {
  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          primary: { main: "#0f766e" },
          background: { default: "#dde6e3", paper: "#ffffff" },
          text: { primary: "#17201f", secondary: "#5f6f6c" }
        },
        shape: { borderRadius: 8 },
        typography: { fontFamily: "inherit" },
        components: {
          MuiButton: {
            styleOverrides: { root: { textTransform: "none", fontWeight: 700 } }
          }
        }
      }),
    []
  );

  const rows = useMemo<SalesOrderTableRow[]>(
    () =>
      orders.map((order) => {
        const summary = getOrderSnapshotSummary(order.snapshot);
        return {
          id: order.id,
          shortId: order.id.slice(0, 8),
          version: order.version,
          statusLabel: orderStatusLabels[order.status],
          projectName: summary.projectName,
          customerName: summary.customerName,
          customerEmail: summary.customerEmail,
          materialDescription: summary.materialDescription,
          submittedAt: order.submitted_at,
          reviewedAt: order.reviewed_at,
          approvedAt: order.approved_at,
          boardCount: summary.boardCount,
          totalPieces: summary.totalPieces,
          itemRows: summary.itemRows,
          utilizationPercentage: summary.utilizationPercentage,
          edgeBand045Meters: summary.edgeBand045Meters,
          edgeBand2mmMeters: summary.edgeBand2mmMeters,
          wastePercentage: summary.wastePercentage,
          notesCustomer: order.notes_customer ?? "",
          notesSeller: order.notes_seller ?? "",
          order
        };
      }),
    [orders]
  );

  const columns = useMemo<MRT_ColumnDef<SalesOrderTableRow>[]>(
    () => [
      {
        accessorKey: "shortId",
        header: "Orden",
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
            color={row.original.order.status === "approved" ? "success" : "primary"}
            variant={row.original.order.status === "approved" ? "filled" : "outlined"}
            label={row.original.statusLabel}
          />
        )
      },
      {
        accessorKey: "customerName",
        header: "Cliente",
        size: 220,
        Cell: ({ row }) => (
          <Stack spacing={0.25}>
            <Typography sx={{ fontSize: 14, fontWeight: 800 }}>{row.original.customerName}</Typography>
            {row.original.customerEmail ? (
              <Typography sx={{ color: "#5f6f6c", fontSize: 12 }}>{row.original.customerEmail}</Typography>
            ) : null}
          </Stack>
        )
      },
      {
        accessorKey: "projectName",
        header: "Proyecto",
        size: 240
      },
      {
        accessorKey: "materialDescription",
        header: "Material",
        size: 260
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
        accessorKey: "edgeBand045Meters",
        header: "ML canto 0,45",
        size: 125,
        Cell: ({ cell }) => `${cell.getValue<number>().toFixed(2)} m`
      },
      {
        accessorKey: "edgeBand2mmMeters",
        header: "ML canto 2 mm",
        size: 125,
        Cell: ({ cell }) => `${cell.getValue<number>().toFixed(2)} m`
      },
      {
        accessorKey: "utilizationPercentage",
        header: "Aprov.",
        size: 100,
        Cell: ({ cell }) => `${cell.getValue<number>().toFixed(1)}%`
      },
      {
        accessorKey: "submittedAt",
        header: "Enviado",
        size: 160,
        Cell: ({ cell }) => formatDateTimeEsAr(cell.getValue<string>())
      },
      {
        accessorKey: mode === "approved" ? "approvedAt" : "reviewedAt",
        header: mode === "approved" ? "Aprobado" : "Tomado",
        size: 160,
        Cell: ({ cell }) => formatDateTimeEsAr(cell.getValue<string | null>())
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
    [mode]
  );

  const table = useMaterialReactTable({
    columns,
    data: rows,
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
      sorting: [{ id: mode === "approved" ? "approvedAt" : "reviewedAt", desc: true }],
      columnPinning: { left: ["shortId", "statusLabel"], right: ["mrt-row-actions"] }
    },
    muiTablePaperProps: {
      sx: {
        border: "1px solid var(--line)",
        borderRadius: "8px",
        overflow: "hidden"
      }
    },
    muiTableContainerProps: {
      sx: { maxHeight: "calc(100vh - 285px)", backgroundColor: "#fff" }
    },
    muiTableHeadCellProps: {
      sx: {
        backgroundColor: "#eef3f1",
        color: "#17201f",
        fontSize: 12,
        fontWeight: 800
      }
    },
    muiTableBodyCellProps: {
      sx: { borderColor: "var(--line)", fontSize: 13 }
    },
    renderRowActions: ({ row }) => (
      <Button size="small" variant="outlined" onClick={() => row.toggleExpanded()}>
        {row.getIsExpanded() ? "Cerrar" : "Detalle"}
      </Button>
    ),
    renderDetailPanel: ({ row }) => <SalesOrderDetail row={row} mode={mode} />,
    renderTopToolbarCustomActions: () => (
      <Typography sx={{ color: "#5f6f6c", fontSize: 13, fontWeight: 700 }}>
        {orders.length} {modeLabels[mode].count}
      </Typography>
    )
  });

  if (orders.length === 0) {
    return (
      <div className="rounded-[var(--r)] border border-dashed border-[var(--linea-fuerte)] bg-[rgba(255,255,255,.45)] p-8 text-center text-sm text-[var(--muted)]">
        {modeLabels[mode].empty}
      </div>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <MaterialReactTable table={table} />
    </ThemeProvider>
  );
}

function SalesOrderDetail({ row, mode }: { row: MRT_Row<SalesOrderTableRow>; mode: SalesOrdersTableMode }) {
  const order = row.original.order;

  if (mode === "approved") {
    return (
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <OrderNotes row={row.original} />
        <div className="rounded-[var(--r)] border border-[var(--line)] bg-white p-3 text-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Validacion</div>
          <div className="mt-2 font-semibold text-[var(--ink)]">Listo para produccion</div>
          <div className="mt-1 text-[var(--muted)]">
            Aprobado {formatDateTimeEsAr(order.approved_at)}. El pedido ya es visible para operarios.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_320px_320px]">
      <OrderNotes row={row.original} />

      <form action={approveOrderAction} className="space-y-3 rounded-[var(--r)] border border-[var(--line)] bg-white p-3">
        <input type="hidden" name="orderId" value={order.id} />
        <input type="hidden" name="expectedOrderVersion" value={order.version} />
        <TextArea label="Comentario aprobacion" name="comment" />
        <PendingSubmitButton
          pendingLabel="Aprobando pedido..."
          className="focus-ring w-full rounded bg-[var(--teal)] px-4 py-3 text-sm font-semibold text-white"
        >
          Aprobar pedido
        </PendingSubmitButton>
      </form>

      <form action={requestOrderChangesAction} className="space-y-3 rounded-[var(--r)] border border-[var(--line)] bg-white p-3">
        <input type="hidden" name="orderId" value={order.id} />
        <input type="hidden" name="expectedOrderVersion" value={order.version} />
        <TextArea label="Correcciones solicitadas" name="comment" required />
        <PendingSubmitButton
          pendingLabel="Enviando correcciones..."
          className="focus-ring w-full rounded border border-[var(--danger)] px-4 py-3 text-sm font-semibold text-[var(--danger)]"
        >
          Solicitar cambios
        </PendingSubmitButton>
      </form>
    </div>
  );
}

function OrderNotes({ row }: { row: SalesOrderTableRow }) {
  return (
    <div className="grid gap-3 text-sm md:grid-cols-2">
      <Detail label="Nota cliente" value={row.notesCustomer || "Sin nota"} />
      <Detail label="Nota vendedor" value={row.notesSeller || "Sin nota"} />
      <Detail label="Filas" value={`${row.itemRows}`} />
      <Detail label="Desperdicio" value={`${row.wastePercentage.toFixed(1)}%`} />
      <Detail label="Canto 0,45" value={`${row.edgeBand045Meters.toFixed(2)} m`} />
      <Detail label="Canto 2 mm" value={`${row.edgeBand2mmMeters.toFixed(2)} m`} />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--r)] border border-[var(--line)] bg-[#f7f9f7] p-3">
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{label}</div>
      <div className="mt-2 text-[var(--ink)]">{value}</div>
    </div>
  );
}

function TextArea({
  label,
  name,
  required = false
}: {
  label: string;
  name: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{label}</span>
      <textarea
        name={name}
        rows={3}
        required={required}
        className="mt-2 w-full rounded border border-[var(--line)] px-3 py-2 text-sm focus-ring"
      />
    </label>
  );
}

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
import { orderStatusLabels, getOrderSnapshotSummary } from "@/lib/domain/orders";
import { formatDateTimeEsAr } from "@/lib/format/dates";
import { approveOrderAction, startOrderReviewAction } from "@/lib/orders/actions";
import type { OrderRow } from "@/lib/orders/queries";

type PendingOrdersTableProps = {
  orders: OrderRow[];
};

type PendingOrderRow = {
  id: string;
  shortId: string;
  version: number;
  statusLabel: string;
  projectName: string;
  customerName: string;
  customerEmail: string;
  materialDescription: string;
  submittedAt: string;
  boardCount: number;
  totalPieces: number;
  itemRows: number;
  utilizationPercentage: number;
  notesCustomer: string;
  order: OrderRow;
};

export function PendingOrdersTable({ orders }: PendingOrdersTableProps) {
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

  const rows = useMemo<PendingOrderRow[]>(
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
          boardCount: summary.boardCount,
          totalPieces: summary.totalPieces,
          itemRows: summary.itemRows,
          utilizationPercentage: summary.utilizationPercentage,
          notesCustomer: order.notes_customer ?? "",
          order
        };
      }),
    [orders]
  );

  const columns = useMemo<MRT_ColumnDef<PendingOrderRow>[]>(
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
        size: 130,
        Cell: ({ cell }) => <Chip size="small" color="warning" variant="outlined" label={cell.getValue<string>()} />
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
      sorting: [{ id: "submittedAt", desc: true }],
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
        {row.getIsExpanded() ? "Cerrar" : "Acciones"}
      </Button>
    ),
    renderDetailPanel: ({ row }) => <PendingOrderActions row={row} />,
    renderTopToolbarCustomActions: () => (
      <Typography sx={{ color: "#5f6f6c", fontSize: 13, fontWeight: 700 }}>
        {orders.length} pedidos pendientes
      </Typography>
    )
  });

  if (orders.length === 0) {
    return (
      <div className="rounded-[var(--r)] border border-dashed border-[var(--linea-fuerte)] bg-[rgba(255,255,255,.45)] p-8 text-center text-sm text-[var(--muted)]">
        No hay pedidos pendientes.
      </div>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <MaterialReactTable table={table} />
    </ThemeProvider>
  );
}

function PendingOrderActions({ row }: { row: MRT_Row<PendingOrderRow> }) {
  const order = row.original.order;

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_320px_320px]">
      <div className="rounded-[var(--r)] border border-[var(--line)] bg-[#f7f9f7] p-3 text-sm">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Nota cliente</div>
        <div className="mt-2 text-[var(--ink)]">{row.original.notesCustomer || "Sin nota"}</div>
      </div>

      <form action={approveOrderAction} className="space-y-3 rounded-[var(--r)] border border-[var(--line)] bg-white p-3">
        <input type="hidden" name="orderId" value={order.id} />
        <input type="hidden" name="expectedOrderVersion" value={order.version} />
        <TextArea label="Comentario de validacion" name="comment" />
        <PendingSubmitButton
          pendingLabel="Aprobando pedido..."
          className="focus-ring w-full rounded bg-[var(--teal)] px-4 py-3 text-sm font-semibold text-white"
        >
          Aprobar pedido
        </PendingSubmitButton>
      </form>

      <form action={startOrderReviewAction} className="space-y-3 rounded-[var(--r)] border border-[var(--line)] bg-white p-3">
        <input type="hidden" name="orderId" value={order.id} />
        <input type="hidden" name="expectedOrderVersion" value={order.version} />
        <TextArea label="Comentario interno" name="comment" />
        <PendingSubmitButton
          pendingLabel="Tomando revision..."
          className="focus-ring w-full rounded border border-[var(--linea-fuerte)] px-4 py-3 text-sm font-semibold text-[var(--ink)]"
        >
          Tomar revision
        </PendingSubmitButton>
      </form>
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
        className="mt-2 w-full rounded border border-[var(--line)] px-3 py-2 text-sm focus-ring"
      />
    </label>
  );
}

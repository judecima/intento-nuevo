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
import type { AuditLogRow } from "@/lib/admin/queries";
import { formatDateTimeEsAr } from "@/lib/format/dates";

type AuditLogTableProps = {
  rows: AuditLogRow[];
};

type AuditTableRow = {
  id: string;
  action: string;
  actionLabel: string;
  entityType: string;
  entityId: string;
  actorId: string;
  createdAt: string;
  row: AuditLogRow;
};

export function AuditLogTable({ rows }: AuditLogTableProps) {
  const tableRows = useMemo<AuditTableRow[]>(
    () =>
      rows.map((row) => ({
        id: row.id,
        action: row.action,
        actionLabel: auditActionLabel(row.action),
        entityType: row.entity_type,
        entityId: row.entity_id ?? "",
        actorId: row.actor_id ?? "Sistema",
        createdAt: row.created_at,
        row
      })),
    [rows]
  );

  const columns = useMemo<MRT_ColumnDef<AuditTableRow>[]>(
    () => [
      {
        accessorKey: "actionLabel",
        header: "Accion",
        size: 220,
        Cell: ({ row }) => (
          <Stack spacing={0.25}>
            <Typography sx={{ fontSize: 14, fontWeight: 800 }}>{row.original.actionLabel}</Typography>
            <Typography sx={{ color: "var(--md-on-surface-variant)", fontFamily: "monospace", fontSize: 11 }}>
              {row.original.action}
            </Typography>
          </Stack>
        )
      },
      {
        accessorKey: "entityType",
        header: "Entidad",
        size: 160,
        Cell: ({ row }) => (
          <Stack spacing={0.25}>
            <Chip size="small" variant="outlined" label={row.original.entityType} />
            {row.original.entityId ? (
              <Typography sx={{ color: "var(--md-on-surface-variant)", fontFamily: "monospace", fontSize: 11 }}>
                {row.original.entityId.slice(0, 8)}
              </Typography>
            ) : null}
          </Stack>
        )
      },
      {
        accessorKey: "actorId",
        header: "Actor",
        size: 220,
        Cell: ({ cell }) => (
          <Typography component="span" sx={{ fontFamily: "monospace", fontSize: 12 }}>
            {cell.getValue<string>()}
          </Typography>
        )
      },
      {
        accessorKey: "createdAt",
        header: "Fecha",
        size: 170,
        Cell: ({ cell }) => formatDateTimeEsAr(cell.getValue<string>())
      }
    ],
    []
  );

  const table = useMaterialReactTable({
    columns,
    data: tableRows,
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
      columnPinning: { left: ["actionLabel"], right: ["mrt-row-actions"] }
    },
    muiTablePaperProps: { sx: brandedTablePaperSx },
    muiTableContainerProps: { sx: brandedTableContainerSx("calc(100vh - 300px)") },
    muiTableHeadCellProps: { sx: brandedTableHeadCellSx },
    muiTableBodyCellProps: { sx: brandedTableBodyCellSx },
    renderRowActions: ({ row }) => (
      <Button size="small" variant="outlined" onClick={() => row.toggleExpanded()}>
        {row.getIsExpanded() ? "Cerrar" : "Datos"}
      </Button>
    ),
    renderDetailPanel: ({ row }) => <AuditDetail row={row} />,
    renderTopToolbarCustomActions: () => (
      <Typography sx={{ color: "var(--md-on-surface-variant)", fontSize: 13, fontWeight: 700 }}>
        {rows.length} eventos
      </Typography>
    )
  });

  if (rows.length === 0) {
    return (
      <div className="border border-[var(--line)] bg-[var(--md-surface-container-lowest)] p-5 text-sm text-[var(--muted)]">
        Todavia no hay eventos de auditoria registrados.
      </div>
    );
  }

  return (
    <BrandedMuiThemeProvider>
      <MaterialReactTable table={table} />
    </BrandedMuiThemeProvider>
  );
}

function AuditDetail({ row }: { row: MRT_Row<AuditTableRow> }) {
  return (
    <div className="grid gap-3 p-4 text-xs lg:grid-cols-3">
      <JsonBlock label="Metadata" value={row.original.row.metadata} />
      <JsonBlock label="Anterior" value={row.original.row.old_data} />
      <JsonBlock label="Nuevo" value={row.original.row.new_data} />
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <div className="mb-2 font-semibold">{label}</div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words border border-[var(--line)] bg-[var(--md-surface-container-lowest)] p-3 font-mono text-[11px]">
        {formatJson(value)}
      </pre>
    </div>
  );
}

function auditActionLabel(action: string) {
  const labels: Record<string, string> = {
    order_pending: "Pedido pendiente",
    order_submitted: "Pedido enviado",
    order_under_review: "Pedido en revision",
    order_changes_requested: "Correcciones solicitadas",
    order_approved: "Pedido aprobado",
    order_in_production: "Produccion iniciada",
    order_edgebanding: "Pegado de canto",
    order_completed: "Produccion finalizada",
    order_delivered: "Pedido entregado",
    order_cancelled: "Pedido cancelado",
    xml_generated: "XML generado",
    xml_downloaded: "XML descargado",
    file_generated: "Archivo generado",
    file_downloaded: "Archivo descargado",
    organization_member_updated: "Usuario actualizado",
    machine_profile_created: "Perfil de maquina creado",
    machine_profile_updated: "Perfil de maquina actualizado"
  };

  return labels[action] ?? action;
}

function formatJson(value: unknown) {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return "null";
  }
}

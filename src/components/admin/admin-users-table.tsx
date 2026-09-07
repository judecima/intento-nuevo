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
import { PendingSubmitButton } from "@/components/forms/pending-submit-button";
import {
  BrandedMuiThemeProvider,
  brandedTableBodyCellSx,
  brandedTableHeadCellSx,
  brandedTablePaperSx
} from "@/components/ui/branded-mui-theme";
import { updateOrganizationMemberAction } from "@/lib/admin/actions";
import type { AdminOrganizationMember } from "@/lib/admin/queries";
import { organizationRoles, roleLabels } from "@/lib/domain/roles";
import { formatDateOnlyEsAr } from "@/lib/format/dates";

type AdminUsersTableProps = {
  members: AdminOrganizationMember[];
};

export function AdminUsersTable({ members }: AdminUsersTableProps) {
  const columns = useMemo<MRT_ColumnDef<AdminOrganizationMember>[]>(
    () => [
      {
        id: "user",
        accessorFn: (member) => member.profile?.full_name ?? "Sin nombre",
        header: "Usuario",
        size: 240,
        Cell: ({ row }) => (
          <Stack spacing={0.25}>
            <Typography sx={{ fontSize: 14, fontWeight: 800 }}>
              {row.original.profile?.full_name ?? "Sin nombre"}
            </Typography>
            <Typography sx={{ color: "var(--md-on-surface-variant)", fontSize: 12 }}>
              {row.original.profile?.email ?? row.original.user_id}
            </Typography>
          </Stack>
        )
      },
      {
        accessorKey: "role",
        header: "Rol",
        size: 140,
        Cell: ({ row }) => <Chip size="small" label={roleLabels[row.original.role]} variant="outlined" />
      },
      {
        accessorKey: "active",
        header: "Estado",
        size: 120,
        Cell: ({ cell }) => (
          <Chip
            size="small"
            label={cell.getValue<boolean>() ? "Activo" : "Inactivo"}
            color={cell.getValue<boolean>() ? "success" : "default"}
            variant={cell.getValue<boolean>() ? "filled" : "outlined"}
          />
        )
      },
      {
        accessorKey: "created_at",
        header: "Alta",
        size: 140,
        Cell: ({ cell }) => formatDateOnlyEsAr(cell.getValue<string>())
      }
    ],
    []
  );

  const table = useMaterialReactTable({
    columns,
    data: members,
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
    getRowId: (row) => row.user_id,
    initialState: {
      density: "compact",
      pagination: { pageIndex: 0, pageSize: 20 },
      sorting: [{ id: "created_at", desc: false }]
    },
    muiTablePaperProps: { sx: brandedTablePaperSx },
    muiTableHeadCellProps: { sx: brandedTableHeadCellSx },
    muiTableBodyCellProps: { sx: brandedTableBodyCellSx },
    renderRowActions: ({ row }) => (
      <Button size="small" variant="outlined" onClick={() => row.toggleExpanded()}>
        {row.getIsExpanded() ? "Cerrar" : "Actualizar"}
      </Button>
    ),
    renderDetailPanel: ({ row }) => <MemberUpdateForm row={row} />,
    renderTopToolbarCustomActions: () => (
      <Typography sx={{ color: "var(--md-on-surface-variant)", fontSize: 13, fontWeight: 700 }}>
        {members.length} usuarios
      </Typography>
    )
  });

  return (
    <BrandedMuiThemeProvider>
      <MaterialReactTable table={table} />
    </BrandedMuiThemeProvider>
  );
}

function MemberUpdateForm({ row }: { row: MRT_Row<AdminOrganizationMember> }) {
  const member = row.original;

  return (
    <form action={updateOrganizationMemberAction} className="grid gap-3 p-4 text-sm md:grid-cols-[180px_150px_minmax(0,1fr)_auto] md:items-end">
      <input type="hidden" name="organizationId" value={member.organization_id} />
      <input type="hidden" name="userId" value={member.user_id} />
      <input type="hidden" name="returnTo" value="/admin/users" />

      <label className="block font-medium">
        Rol
        <select
          name="role"
          defaultValue={member.role}
          className="mt-2 w-full rounded border border-[var(--line)] bg-white px-3 py-2 focus-ring"
        >
          {organizationRoles.map((role) => (
            <option key={role} value={role}>
              {roleLabels[role]}
            </option>
          ))}
        </select>
      </label>

      <label className="block font-medium">
        Estado
        <select
          name="active"
          defaultValue={member.active ? "true" : "false"}
          className="mt-2 w-full rounded border border-[var(--line)] bg-white px-3 py-2 focus-ring"
        >
          <option value="true">Activo</option>
          <option value="false">Inactivo</option>
        </select>
      </label>

      <label className="block font-medium">
        Comentario de auditoria
        <input
          name="comment"
          className="mt-2 w-full rounded border border-[var(--line)] px-3 py-2 focus-ring"
          placeholder="Motivo del cambio"
        />
      </label>

      <PendingSubmitButton
        pendingLabel="Guardando..."
        className="focus-ring rounded bg-[var(--teal)] px-4 py-2 text-sm font-semibold text-white"
      >
        Guardar
      </PendingSubmitButton>
    </form>
  );
}

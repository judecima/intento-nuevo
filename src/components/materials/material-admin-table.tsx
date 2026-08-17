"use client";

import Link from "next/link";
import { MaterialReactTable, useMaterialReactTable, type MRT_ColumnDef } from "material-react-table";
import type { MaterialListItem } from "@/lib/materials/queries";

export function MaterialAdminTable({
  materials,
  organizationId,
  disableAction
}: {
  materials: MaterialListItem[];
  organizationId: string;
  disableAction: (formData: FormData) => Promise<never>;
}) {
  const columns: MRT_ColumnDef<MaterialListItem>[] = [
    {
      accessorKey: "description",
      header: "Material",
      Cell: ({ row }) => (
        <div>
          <div className="font-semibold">{row.original.description}</div>
          <div className="font-mono text-xs text-[var(--muted)]">{row.original.code}</div>
        </div>
      )
    },
    { accessorKey: "type", header: "Tipo" },
    { accessorKey: "dimensionsLabel", header: "Dimensiones" },
    { accessorKey: "thickness", header: "Espesor" },
    { accessorKey: "has_grain", header: "Veta", Cell: ({ cell }) => (cell.getValue<boolean>() ? "Si" : "No") },
    { accessorKey: "external_id", header: "ID externo" }
  ];

  const table = useMaterialReactTable({
    columns,
    data: materials,
    enableRowActions: true,
    positionActionsColumn: "last",
    renderRowActions: ({ row }) => (
      <div className="flex items-center gap-2">
        <Link href={`/admin/materials?edit=${row.original.id}`} className="btn btn-sm focus-ring">
          Editar
        </Link>
        <form action={disableAction}>
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="materialId" value={row.original.id} />
          <button type="submit" className="btn btn-sm btn-danger focus-ring">
            Deshabilitar
          </button>
        </form>
      </div>
    )
  });

  return <MaterialReactTable table={table} />;
}

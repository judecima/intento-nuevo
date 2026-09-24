"use client";

import { useMemo } from "react";
import { MaterialReactTable, useMaterialReactTable, type MRT_ColumnDef } from "material-react-table";
import Chip from "@mui/material/Chip";
import {
  BrandedMuiThemeProvider,
  brandedTableBodyCellSx,
  brandedTableHeadCellSx,
  brandedTablePaperSx,
  deliveryAlertRowSx,
  type DeliveryRowAlert
} from "@/components/ui/branded-mui-theme";

type DemoRow = {
  shortId: string;
  statusLabel: string;
  customer: string;
  project: string;
  deliveryOn: string;
  deliveryLabel: string;
  deliveryAlert: DeliveryRowAlert;
};

const ROWS: DemoRow[] = [
  {
    shortId: "a1b2c3d4",
    statusLabel: "En produccion",
    customer: "Mueblería del Sur",
    project: "Cocina Rivadavia",
    deliveryOn: "02/10/26",
    deliveryLabel: "En fecha",
    deliveryAlert: null
  },
  {
    shortId: "e5f6a7b8",
    statusLabel: "Aprobado",
    customer: "Carpintería Norte",
    project: "Placard dormitorio",
    deliveryOn: "25/09/26",
    deliveryLabel: "Por vencer",
    deliveryAlert: "due_soon"
  },
  {
    shortId: "c9d0e1f2",
    statusLabel: "En revision",
    customer: "Taller Belgrano",
    project: "Mostrador local",
    deliveryOn: "18/09/26",
    deliveryLabel: "Vencido",
    deliveryAlert: "overdue"
  }
];

/**
 * Caso de prueba del resaltado de filas.
 *
 * Reproduce la combinacion que fallaba: columnas fijas a izquierda y derecha
 * sobre una fila con fondo de alerta. Con el `::before` de MRT sin pintar, esas
 * columnas se quedaban con el fondo base y el texto desaparecia.
 */
export function AlertRowsDemo() {
  const columns = useMemo<MRT_ColumnDef<DemoRow>[]>(
    () => [
      { accessorKey: "shortId", header: "Pedido", size: 110 },
      { accessorKey: "statusLabel", header: "Estado", size: 130 },
      { accessorKey: "customer", header: "Cliente", size: 190 },
      { accessorKey: "project", header: "Proyecto", size: 190 },
      { accessorKey: "deliveryOn", header: "Entrega", size: 110 },
      {
        accessorKey: "deliveryLabel",
        header: "Estado entrega",
        size: 150,
        Cell: ({ row }) => (
          <Chip
            size="small"
            label={row.original.deliveryLabel}
            color={row.original.deliveryAlert === "overdue" ? "error" : row.original.deliveryAlert === "due_soon" ? "warning" : "default"}
            variant={row.original.deliveryAlert ? "filled" : "outlined"}
          />
        )
      }
    ],
    []
  );

  const table = useMaterialReactTable({
    columns,
    data: ROWS,
    enableColumnPinning: true,
    enablePagination: false,
    enableBottomToolbar: false,
    enableTopToolbar: false,
    enableSorting: false,
    enableColumnActions: false,
    initialState: {
      columnPinning: { left: ["shortId", "statusLabel"], right: ["deliveryLabel"] }
    },
    muiTablePaperProps: { sx: brandedTablePaperSx },
    muiTableHeadCellProps: { sx: brandedTableHeadCellSx },
    muiTableBodyCellProps: { sx: brandedTableBodyCellSx },
    muiTableBodyRowProps: ({ row }) => ({ sx: deliveryAlertRowSx(row.original.deliveryAlert) })
  });

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <div className="eyebrow-muted">Tablas</div>
          <h2 className="mt-1 text-[17px] font-bold">Filas resaltadas por fecha de entrega</h2>
          <p className="hint mt-1.5">Pedido y Estado quedan fijos a la izquierda; Estado entrega, a la derecha.</p>
        </div>
      </div>
      <div className="p-4">
        <BrandedMuiThemeProvider>
          <MaterialReactTable table={table} />
        </BrandedMuiThemeProvider>
      </div>
    </section>
  );
}

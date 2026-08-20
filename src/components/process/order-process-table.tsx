"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  MaterialReactTable,
  useMaterialReactTable,
  type MRT_ColumnDef,
  type MRT_Row
} from "material-react-table";
import { MRT_Localization_ES } from "material-react-table/locales/es";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import MenuItem from "@mui/material/MenuItem";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { createTheme, ThemeProvider, type SxProps, type Theme } from "@mui/material/styles";
import {
  canRunProcessAction,
  listAvailableProcessActions,
  processActionLabels,
  processDeliveryStatusLabels,
  type ProcessActionId
} from "@/lib/domain/process";
import type { OrganizationRole } from "@/lib/domain/roles";
import { formatDateOnlyEsAr, formatDateTimeEsAr } from "@/lib/format/dates";
import {
  runOrderProcessTransitionAction,
  saveOrderProcessEntryAction
} from "@/lib/process/actions";
import type { ProcessOrderRow } from "@/lib/process/queries";

type OrderProcessTableProps = {
  rows: ProcessOrderRow[];
  role: OrganizationRole | null;
};

type NoticeState = {
  ok: boolean;
  message: string;
};

export function OrderProcessTable({ rows, role }: OrderProcessTableProps) {
  const router = useRouter();
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          primary: { main: "#0f766e" },
          background: { default: "#dde6e3", paper: "#ffffff" },
          text: { primary: "#17201f", secondary: "#5f6f6c" }
        },
        shape: { borderRadius: 8 },
        typography: {
          fontFamily: "inherit"
        },
        components: {
          MuiButton: {
            styleOverrides: {
              root: {
                textTransform: "none",
                fontWeight: 700
              }
            }
          },
          MuiPaper: {
            styleOverrides: {
              root: {
                boxShadow: "0 18px 48px rgba(19, 31, 30, 0.12)"
              }
            }
          }
        }
      }),
    []
  );

  const columns = useMemo<MRT_ColumnDef<ProcessOrderRow>[]>(
    () => [
      {
        accessorKey: "shortId",
        header: "Orden",
        size: 84,
        enableEditing: false,
        Cell: ({ cell }) => (
          <Typography component="span" sx={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>
            {cell.getValue<string>()}
          </Typography>
        )
      },
      {
        accessorKey: "stageLabel",
        header: "Estado",
        size: 150,
        enableEditing: false,
        Cell: ({ row }) => <StatusChip row={row.original} />
      },
      {
        accessorKey: "deliveryOn",
        header: "Fecha entrega",
        size: 140,
        enableHiding: false,
        enableEditing: false,
        Cell: ({ cell }) => formatDateOnlyEsAr(cell.getValue<string | null>())
      },
      {
        accessorKey: "deliveryStatus",
        header: "Estado entrega",
        size: 170,
        enableHiding: false,
        enableEditing: false,
        Cell: ({ row }) => <DeliveryStatusChip status={row.original.deliveryStatus} />
      },
      {
        accessorKey: "customerName",
        header: "Cliente",
        size: 220,
        enableEditing: false
      },
      {
        accessorKey: "approvedByName",
        header: "Aprobo",
        size: 160,
        enableEditing: false
      },
      {
        accessorKey: "submittedAt",
        header: "Fecha",
        size: 140,
        enableEditing: false,
        Cell: ({ cell }) => formatDateTimeEsAr(cell.getValue<string>())
      },
      {
        id: "invoiceNumber",
        accessorFn: (row) => row.process.invoiceNumber,
        header: "Factura",
        size: 140,
        muiEditTextFieldProps: {
          placeholder: "Nro factura"
        }
      },
      {
        accessorKey: "materialDescription",
        header: "Material",
        size: 260,
        enableEditing: false
      },
      {
        accessorKey: "boardCount",
        header: "Cant",
        size: 80,
        enableEditing: false
      },
      {
        accessorKey: "cutCount",
        header: "Cortes",
        size: 90,
        enableEditing: false
      },
      {
        accessorKey: "edgeBand045Meters",
        header: "ML canto 0,45",
        size: 120,
        enableEditing: false,
        Cell: ({ cell }) => `${cell.getValue<number>().toFixed(2)} m`
      },
      {
        accessorKey: "edgeBand2mmMeters",
        header: "ML canto 2 mm",
        size: 120,
        enableEditing: false,
        Cell: ({ cell }) => `${cell.getValue<number>().toFixed(2)} m`
      },
      {
        id: "edgeBand045Count",
        accessorFn: (row) => row.process.edgeBand045Count,
        header: "Canto 0,45",
        size: 110,
        muiEditTextFieldProps: {
          type: "number",
          inputProps: { min: 0, step: "0.01" }
        }
      },
      {
        id: "edgeBand2mmCount",
        accessorFn: (row) => row.process.edgeBand2mmCount,
        header: "Canto 2mm",
        size: 110,
        muiEditTextFieldProps: {
          type: "number",
          inputProps: { min: 0, step: "0.01" }
        }
      },
      {
        id: "remitted",
        accessorFn: (row) => (row.process.remitted ? "true" : "false"),
        header: "Remitado",
        size: 120,
        Cell: ({ row }) => (
          <Chip
            size="small"
            label={row.original.process.remitted ? "REMITIDO" : "PENDIENTE"}
            color={row.original.process.remitted ? "success" : "default"}
            variant={row.original.process.remitted ? "filled" : "outlined"}
          />
        ),
        muiEditTextFieldProps: {
          select: true,
          children: [
            <MenuItem key="false" value="false">
              Pendiente
            </MenuItem>,
            <MenuItem key="true" value="true">
              Remitido
            </MenuItem>
          ]
        }
      },
      {
        id: "remittanceNumber",
        accessorFn: (row) => row.process.remittanceNumber,
        header: "Remito",
        size: 130,
        muiEditTextFieldProps: {
          placeholder: "Nro remito"
        }
      },
      {
        id: "promisedOn",
        accessorFn: (row) => row.process.promisedOn ?? "",
        header: "Fecha pact.",
        size: 140,
        Cell: ({ cell }) => formatDateOnlyEsAr(cell.getValue<string>()),
        muiEditTextFieldProps: {
          type: "date",
          InputLabelProps: { shrink: true }
        }
      },
      {
        id: "deadlineOn",
        accessorFn: (row) => row.process.deadlineOn ?? "",
        header: "Fecha limite",
        size: 140,
        Cell: ({ cell }) => formatDateOnlyEsAr(cell.getValue<string>()),
        muiEditTextFieldProps: {
          type: "date",
          InputLabelProps: { shrink: true }
        }
      },
      {
        id: "cutCompletedOn",
        accessorFn: (row) => row.process.cutCompletedOn ?? "",
        header: "Corte",
        size: 120,
        Cell: ({ cell, row }) => formatDateOnlyEsAr(cell.getValue<string>() || datePart(row.original.productionStartedAt)),
        muiEditTextFieldProps: {
          type: "date",
          InputLabelProps: { shrink: true }
        }
      },
      {
        id: "edgebandingCompletedOn",
        accessorFn: (row) => row.process.edgebandingCompletedOn ?? "",
        header: "Pegado",
        size: 120,
        Cell: ({ cell }) => formatDateOnlyEsAr(cell.getValue<string>()),
        muiEditTextFieldProps: {
          type: "date",
          InputLabelProps: { shrink: true }
        }
      },
      {
        id: "processNotes",
        accessorFn: (row) => row.process.processNotes,
        header: "Comentarios",
        size: 260,
        muiEditTextFieldProps: {
          multiline: true,
          minRows: 3
        }
      },
      {
        accessorKey: "operatorName",
        header: "Operario",
        size: 160,
        enableEditing: false
      },
      {
        accessorKey: "hasMachineXml",
        header: "XML",
        size: 80,
        enableEditing: false,
        Cell: ({ cell }) => (
          <Chip
            size="small"
            label={cell.getValue<boolean>() ? "SI" : "NO"}
            color={cell.getValue<boolean>() ? "success" : "default"}
            variant={cell.getValue<boolean>() ? "filled" : "outlined"}
          />
        )
      },
      {
        accessorKey: "updatedAt",
        header: "Actualizado",
        size: 160,
        enableEditing: false,
        Cell: ({ cell }) => formatDateTimeEsAr(cell.getValue<string>())
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
    enableEditing: true,
    enableFullScreenToggle: true,
    enableGrouping: true,
    enableRowActions: true,
    enableStickyHeader: true,
    editDisplayMode: "modal",
    positionActionsColumn: "last",
    getRowId: (row) => row.orderId,
    initialState: {
      density: "compact",
      pagination: { pageIndex: 0, pageSize: 25 },
      showColumnFilters: true,
      columnPinning: { left: ["shortId", "stageLabel", "deliveryOn", "deliveryStatus"], right: ["mrt-row-actions"] },
      sorting: [{ id: "updatedAt", desc: true }]
    },
    muiTablePaperProps: {
      sx: {
        border: "1px solid var(--line)",
        borderRadius: "8px",
        overflow: "hidden"
      }
    },
    muiTableContainerProps: {
      sx: {
        maxHeight: "calc(100vh - 285px)",
        backgroundColor: "#fff"
      }
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
      sx: {
        fontSize: 13,
        borderColor: "var(--line)"
      }
    },
    muiTableBodyRowProps: ({ row }) => ({
      sx: deliveryAlertRowSx(row.original.deliveryAlert)
    }),
    onEditingRowSave: async ({ row, values, table: tableInstance }) => {
      const result = await saveOrderProcessEntryAction({
        orderId: row.original.orderId,
        invoiceNumber: asString(values.invoiceNumber),
        remittanceNumber: asString(values.remittanceNumber),
        remitted: asBoolean(values.remitted),
        promisedOn: asString(values.promisedOn),
        deadlineOn: asString(values.deadlineOn),
        cutCompletedOn: asString(values.cutCompletedOn),
        edgebandingCompletedOn: asString(values.edgebandingCompletedOn),
        edgeBand045Count: asNumber(values.edgeBand045Count),
        edgeBand2mmCount: asNumber(values.edgeBand2mmCount),
        processNotes: asString(values.processNotes)
      });

      setNotice({ ok: result.ok, message: noticeLabel(result.notice) });
      if (result.ok) {
        tableInstance.setEditingRow(null);
        router.refresh();
      }
    },
    renderRowActions: ({ row, table: tableInstance }) => (
      <RowActions
        row={row}
        role={role}
        pending={isPending || pendingAction !== null}
        pendingAction={pendingAction}
        onEdit={() => tableInstance.setEditingRow(row)}
        onRunAction={(action) => {
          const key = `${row.original.orderId}:${action}`;
          setPendingAction(key);
          startTransition(async () => {
            const result = await runOrderProcessTransitionAction({
              orderId: row.original.orderId,
              expectedOrderVersion: row.original.version,
              action,
              comment: "",
              machineProfileId: "",
              remittanceNumber: row.original.process.remittanceNumber
            });
            setNotice({ ok: result.ok, message: noticeLabel(result.notice) });
            setPendingAction(null);
            if (result.ok) router.refresh();
          });
        }}
      />
    ),
    renderDetailPanel: ({ row }) => <DetailPanel row={row.original} />,
    renderTopToolbarCustomActions: () => (
      <Typography sx={{ color: "#5f6f6c", fontSize: 13, fontWeight: 700 }}>
        {rows.length} pedidos en proceso
      </Typography>
    )
  });

  return (
    <ThemeProvider theme={theme}>
      <MaterialReactTable table={table} />
      <Snackbar
        open={Boolean(notice)}
        autoHideDuration={4200}
        onClose={() => setNotice(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        {notice ? (
          <Alert severity={notice.ok ? "success" : "error"} variant="filled" onClose={() => setNotice(null)}>
            {notice.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </ThemeProvider>
  );
}

function RowActions({
  row,
  role,
  pending,
  pendingAction,
  onEdit,
  onRunAction
}: {
  row: MRT_Row<ProcessOrderRow>;
  role: OrganizationRole | null;
  pending: boolean;
  pendingAction: string | null;
  onEdit: () => void;
  onRunAction: (action: ProcessActionId) => void;
}) {
  const actions = listAvailableProcessActions(role, row.original.status);

  return (
    <Stack direction="row" spacing={0.75} sx={{ minWidth: 250 }}>
      <Button size="small" variant="outlined" onClick={onEdit} disabled={pending}>
        Editar
      </Button>
      {actions.map((action) => (
        <Button
          key={action}
          size="small"
          variant={primaryAction(action) ? "contained" : "outlined"}
          color={dangerAction(action) ? "error" : "primary"}
          disabled={pending || !canRunProcessAction(role, row.original.status, action)}
          onClick={() => onRunAction(action)}
        >
          {pendingAction === `${row.original.orderId}:${action}` ? "Procesando..." : processActionLabels[action]}
        </Button>
      ))}
    </Stack>
  );
}

function DetailPanel({ row }: { row: ProcessOrderRow }) {
  return (
    <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "repeat(4, minmax(0, 1fr))" }, p: 2 }}>
      <Detail label="Proyecto" value={row.projectName} />
      <Detail label="Cliente" value={row.customerEmail ? `${row.customerName} - ${row.customerEmail}` : row.customerName} />
      <Detail label="Piezas" value={`${row.totalPieces} piezas en ${row.itemRows} filas`} />
      <Detail label="Aprovechamiento" value={`${row.utilizationPercentage.toFixed(1)}%`} />
      <Detail label="Desperdicio" value={`${row.wastePercentage.toFixed(1)}%`} />
      <Detail label="Sierra" value={`${row.sawMeters.toFixed(2)} m`} />
      <Detail label="Canto 0,45" value={`${row.edgeBand045Meters.toFixed(2)} m`} />
      <Detail label="Canto 2 mm" value={`${row.edgeBand2mmMeters.toFixed(2)} m`} />
      <Detail label="Fecha entrega" value={formatDateOnlyEsAr(row.deliveryOn) || "Sin aprobacion"} />
      <Detail label="Estado entrega" value={processDeliveryStatusLabels[row.deliveryStatus]} />
      <Detail label="Inicio produccion" value={formatDateTimeEsAr(row.productionStartedAt)} />
      <Detail label="Fin produccion" value={formatDateTimeEsAr(row.productionCompletedAt)} />
    </Box>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography sx={{ color: "#5f6f6c", fontSize: 11, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase" }}>
        {label}
      </Typography>
      <Typography sx={{ color: "#17201f", fontSize: 14, fontWeight: 700, mt: 0.5 }}>{value}</Typography>
    </Box>
  );
}

function deliveryAlertRowSx(alert: ProcessOrderRow["deliveryAlert"]): SxProps<Theme> | undefined {
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

function DeliveryStatusChip({ status }: { status: ProcessOrderRow["deliveryStatus"] }) {
  const colorByStatus: Record<ProcessOrderRow["deliveryStatus"], "default" | "error" | "success" | "warning"> = {
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

function StatusChip({ row }: { row: ProcessOrderRow }) {
  const colorByStatus: Partial<Record<ProcessOrderRow["status"], "default" | "primary" | "success" | "warning" | "error">> = {
    pending: "warning",
    submitted: "warning",
    under_review: "primary",
    changes_requested: "error",
    approved: "primary",
    production: "warning",
    edgebanding: "primary",
    completed: "success",
    delivered: "success",
    cancelled: "default"
  };

  return (
    <Chip
      size="small"
      label={row.stageLabel}
      color={colorByStatus[row.status] ?? "default"}
      variant={row.status === "delivered" ? "filled" : "outlined"}
    />
  );
}

function primaryAction(action: ProcessActionId): boolean {
  return ["approve", "start_production", "start_edgebanding", "complete_production", "deliver"].includes(action);
}

function dangerAction(action: ProcessActionId): boolean {
  return false;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function asBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === "SI" || value === "Remitido";
}

function asNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function datePart(value: string | null): string {
  return value ? value.slice(0, 10) : "";
}

function noticeLabel(notice: string): string {
  const messages: Record<string, string> = {
    process_saved: "Proceso actualizado.",
    order_approved: "Pedido aprobado y listo para produccion.",
    production_started: "Produccion iniciada.",
    production_edgebanding: "Pedido pasado a pegado de canto.",
    production_completed: "Produccion finalizada.",
    order_delivered: "Pedido marcado como entregado.",
    FORBIDDEN: "No tenes permisos para realizar esa accion.",
    ORDER_INVALID_STATUS: "El pedido ya no esta en un estado valido.",
    ORDER_VERSION_CONFLICT: "El pedido cambio en otra operacion. Actualiza la tabla.",
    ORDER_PROCESS_UPDATE_FAILED: "No se pudo guardar el proceso.",
    ORDER_PROCESS_TRANSITION_FAILED: "No se pudo cambiar el estado del pedido."
  };

  return messages[notice] ?? "No se pudo completar la operacion.";
}

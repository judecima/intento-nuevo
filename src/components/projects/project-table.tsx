"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { MaterialReactTable, useMaterialReactTable, type MRT_ColumnDef } from "material-react-table";
import { MRT_Localization_ES } from "material-react-table/locales/es";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { projectStatusLabels } from "@/lib/domain/projects";
import { formatDateOnlyEsAr } from "@/lib/format/dates";
import { toScopedPath } from "@/lib/routing/routes";
import type { ProjectListItem } from "@/lib/projects/queries";

type ProjectTableProps = {
  projects: ProjectListItem[];
  basePath: string;
};

export function ProjectTable({ projects, basePath }: ProjectTableProps) {
  const router = useRouter();
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

  const columns = useMemo<MRT_ColumnDef<ProjectListItem>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Proyecto",
        size: 260,
        Cell: ({ row }) => (
          <Stack spacing={0.25}>
            <Typography sx={{ fontSize: 14, fontWeight: 800 }}>{row.original.name}</Typography>
            <Typography sx={{ color: "#5f6f6c", fontSize: 12 }}>
              Actualizado {formatDateOnlyEsAr(row.original.updated_at)}
            </Typography>
          </Stack>
        )
      },
      {
        id: "materialCode",
        accessorFn: (project) => project.material?.code ?? "Sin codigo",
        header: "Codigo",
        size: 120,
        Cell: ({ cell }) => (
          <Typography sx={{ fontFamily: "monospace", fontSize: 12 }}>{cell.getValue<string>()}</Typography>
        )
      },
      {
        id: "materialDescription",
        accessorFn: (project) => project.material?.description ?? "Material no disponible",
        header: "Material",
        size: 260
      },
      {
        accessorKey: "status",
        header: "Estado",
        size: 150,
        Cell: ({ row }) => <Chip size="small" label={projectStatusLabels[row.original.status]} variant="outlined" />
      },
      {
        accessorKey: "itemCount",
        header: "Filas",
        size: 80
      },
      {
        accessorKey: "totalPieces",
        header: "Piezas",
        size: 90
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
    data: projects,
    localization: MRT_Localization_ES,
    enableColumnFilters: true,
    enableColumnPinning: true,
    enableColumnResizing: true,
    enableDensityToggle: true,
    enableFullScreenToggle: true,
    enableRowActions: true,
    enableStickyHeader: true,
    getRowId: (row) => row.id,
    initialState: {
      density: "compact",
      pagination: { pageIndex: 0, pageSize: 20 },
      sorting: [{ id: "updated_at", desc: true }]
    },
    muiTablePaperProps: {
      sx: {
        border: "1px solid var(--line)",
        borderRadius: "8px",
        overflow: "hidden"
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
      sx: { fontSize: 13, borderColor: "var(--line)" }
    },
    renderRowActions: ({ row }) => (
      <Button size="small" variant="contained" onClick={() => router.push(toScopedPath(basePath, `/projects/${row.original.id}`))}>
        Abrir
      </Button>
    ),
    renderTopToolbarCustomActions: () => (
      <Typography sx={{ color: "#5f6f6c", fontSize: 13, fontWeight: 700 }}>
        {projects.length} proyectos
      </Typography>
    )
  });

  if (projects.length === 0) {
    return (
      <div className="border border-[var(--line)] bg-white p-6 text-sm text-[var(--muted)]">
        Todavia no hay proyectos. Crea uno seleccionando un tablero del catalogo.
      </div>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <MaterialReactTable table={table} />
    </ThemeProvider>
  );
}

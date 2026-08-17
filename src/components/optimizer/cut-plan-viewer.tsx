"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MaterialReactTable,
  useMaterialReactTable,
  type MRT_ColumnDef
} from "material-react-table";
import { MRT_Localization_ES } from "material-react-table/locales/es";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { edgeLabel, type CutPlanView } from "@/lib/optimizations/plan-view";
import { BoardPlan } from "./board-plan";
import { DiagPanel } from "./diag-panel";
import { releasedLevel, type DiagnosticTarget } from "./diagnostics";

type CutPlanViewerProps = {
  plan: CutPlanView;
  /** Acciones extra (exportar, enviar pedido) que se muestran en la cabecera. */
  actions?: React.ReactNode;
};

const SPEEDS = [
  { label: "0.5×", ms: 190 },
  { label: "1×", ms: 95 },
  { label: "2×", ms: 45 }
];

export function CutPlanViewer({ plan, actions }: CutPlanViewerProps) {
  const [boardIndex, setBoardIndex] = useState(0);
  const [step, setStep] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(1);
  const [diagMode, setDiagMode] = useState(false);
  const [target, setTarget] = useState<DiagnosticTarget | null>(null);
  const [highlightedGroup, setHighlightedGroup] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const board = plan.boards[Math.min(boardIndex, plan.boards.length - 1)];
  const totalCuts = board?.cuts.length ?? 0;
  const currentStep = step ?? totalCuts;

  const stopPlayback = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    setPlaying(false);
  }, []);

  useEffect(() => stopPlayback, [stopPlayback]);

  useEffect(() => {
    if (!playing) return;

    const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const interval = reduced ? 260 : SPEEDS[speedIndex].ms;

    timer.current = setInterval(() => {
      setStep((previous) => {
        const next = (previous ?? 0) + 1;
        if (next >= totalCuts) {
          if (timer.current) clearInterval(timer.current);
          timer.current = null;
          setPlaying(false);
          return totalCuts;
        }
        return next;
      });
    }, interval);

    return () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };
  }, [playing, speedIndex, totalCuts]);

  // Cambiar de placa reinicia la simulacion y el foco del diagnostico.
  useEffect(() => {
    stopPlayback();
    setStep(null);
    setTarget(null);
  }, [boardIndex, stopPlayback]);

  const togglePlay = () => {
    if (playing) {
      stopPlayback();
      return;
    }
    setStep((previous) => (previous === null || previous >= totalCuts ? 0 : previous));
    setPlaying(true);
  };

  const goTo = (value: number) => {
    stopPlayback();
    setStep(Math.max(0, Math.min(totalCuts, value)));
  };

  const highlightedPieceIds = useMemo(() => {
    if (!highlightedGroup || !board) return [];
    const group = plan.groups.find((item) => item.key === highlightedGroup);
    if (!group) return [];
    return board.pieces
      .filter(
        (piece) =>
          (piece.description || piece.reference || "Pieza") === group.description &&
          piece.sourceWidth === group.width &&
          piece.sourceHeight === group.height
      )
      .map((piece) => piece.id);
  }, [board, highlightedGroup, plan.groups]);

  if (!board) {
    return <div className="empty-state">La optimización no devolvió placas para dibujar.</div>;
  }

  const stage = currentStep >= totalCuts ? null : board.cuts[Math.max(0, currentStep - 1)]?.level ?? 1;
  const level = releasedLevel(board.cuts, currentStep);
  const releasedPieces = board.pieces.filter((piece) => piece.level <= level).length;

  return (
    <div className="space-y-4">
      <div className="metric-grid no-print">
        <Metric strong value={`${plan.metrics.utilization.toFixed(2)}%`} label="Aprovechamiento" />
        <Metric value={String(plan.metrics.boards)} label="Placas" />
        <Metric value={String(plan.metrics.pieces)} label="Piezas" />
        <Metric value={plan.metrics.cutAreaM2.toFixed(2)} label="m² cortados" />
        <Metric value={plan.metrics.offcutAreaM2.toFixed(2)} label="m² de recorte" />
        <Metric value={String(plan.metrics.cuts)} label="Cortes de sierra" />
        <Metric value={plan.metrics.sawMeters.toFixed(1)} label="m de recorrido" />
        {plan.metrics.remnantCount > 0 ? (
          <>
            <Metric value={plan.metrics.remnantAreaM2.toFixed(2)} label="m² recuperables" />
            <Metric value={plan.metrics.largestRemnantM2.toFixed(2)} label="m² mayor sobrante" />
          </>
        ) : null}
        {plan.metrics.edgeSides > 0 ? (
          <>
            <Metric value={plan.metrics.edgeMeters.toFixed(1)} label="ml de tapacanto" />
            <Metric value={String(plan.metrics.edgeSides)} label="Lados encantados" />
          </>
        ) : null}
      </div>

      <section className="card overflow-hidden">
        <div className="card-head no-print">
          <div className="min-w-0">
            <div className="eyebrow-muted">Plano de corte</div>
            <h3 className="mt-1 text-[17px] font-bold">
              Placa {board.index + 1} de {plan.boards.length}
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[11.5px] text-[var(--muted)]">
              <span>
                {Math.round(board.width)} × {Math.round(board.height)} mm
              </span>
              <span>·</span>
              <span>{board.pieces.length} piezas</span>
              <span>·</span>
              <span>{board.cuts.length} cortes</span>
              <span>·</span>
              <span>{(board.usedArea / 1e6).toFixed(2)} m²</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {plan.boards.length > 1 ? (
              <div className="flex flex-wrap gap-1 rounded-[var(--r-md)] border border-[var(--line)] bg-[#f6f8f5] p-1">
                {plan.boards.map((item) => (
                  <button
                    key={item.index}
                    type="button"
                    onClick={() => setBoardIndex(item.index)}
                    aria-pressed={item.index === board.index}
                    className={`focus-ring rounded-[var(--r)] px-2.5 py-1.5 font-mono text-[11.5px] ${
                      item.index === board.index
                        ? "bg-[var(--grafito)] text-white"
                        : "text-[var(--muted)] hover:bg-white"
                    }`}
                  >
                    {item.index + 1}
                  </button>
                ))}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => {
                setDiagMode((value) => !value);
                setTarget(null);
              }}
              aria-pressed={diagMode}
              className={`btn btn-sm ${diagMode ? "btn-primary" : ""}`}
            >
              ◎ Diagnóstico
            </button>

            <div className="flex items-center gap-1">
              <button type="button" className="btn btn-sm" onClick={() => setZoom((z) => Math.max(1, z - 0.5))} aria-label="Alejar">
                −
              </button>
              <span className="w-10 text-center font-mono text-[11px] text-[var(--muted)]">{zoom.toFixed(1)}×</span>
              <button type="button" className="btn btn-sm" onClick={() => setZoom((z) => Math.min(4, z + 0.5))} aria-label="Acercar">
                +
              </button>
            </div>

            {actions}
          </div>
        </div>

        <div className={`grid gap-0 ${diagMode ? "xl:grid-cols-[minmax(0,1fr)_360px]" : ""}`}>
          <div className={`overflow-auto bg-[#f4f5f3] p-3 ${zoom > 1 ? "max-h-[70vh]" : ""}`}>
            <div style={{ width: `${zoom * 100}%` }}>
              <BoardPlan
                board={board}
                meta={plan.meta}
                step={step}
                diagMode={diagMode}
                highlightedPieceIds={highlightedPieceIds}
                selectedId={
                  target?.kind === "piece"
                    ? target.piece.id
                    : target?.kind === "remnant"
                      ? target.remnant.id
                      : null
                }
                onSelect={setTarget}
              />
            </div>
          </div>

          {diagMode ? (
            <div className="no-print border-t border-[var(--line)] bg-[#0b1420] p-3 xl:border-l xl:border-t-0">
              <DiagPanel target={target} meta={plan.meta} onClose={() => setDiagMode(false)} />
            </div>
          ) : null}
        </div>

        <div className="no-print flex flex-wrap items-center gap-3 border-t border-[var(--line)] bg-white px-3 py-2.5">
          <button
            type="button"
            onClick={togglePlay}
            className="focus-ring grid h-9 w-9 flex-none place-items-center rounded-[var(--r-md)] bg-[var(--grafito)] text-white hover:bg-[var(--teal)]"
            aria-label={playing ? "Pausar secuencia de corte" : "Reproducir secuencia de corte"}
            title="Simular la secuencia de corte"
          >
            {playing ? "❚❚" : "▶"}
          </button>
          <button
            type="button"
            onClick={() => goTo(currentStep - 1)}
            disabled={currentStep <= 0}
            className="btn btn-sm btn-icon"
            aria-label="Corte anterior"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => goTo(currentStep + 1)}
            disabled={currentStep >= totalCuts}
            className="btn btn-sm btn-icon"
            aria-label="Corte siguiente"
          >
            ›
          </button>

          <input
            type="range"
            min={0}
            max={totalCuts}
            value={currentStep}
            onChange={(event) => goTo(Number(event.target.value))}
            className="range-sierra min-w-[140px] flex-1"
            aria-label="Avance de la secuencia de corte"
          />

          <span className="min-w-[190px] font-mono text-[11.5px] text-[var(--muted)]">
            {currentStep >= totalCuts
              ? `${totalCuts} de ${totalCuts} cortes · plano terminado`
              : `corte ${currentStep} de ${totalCuts} · etapa ${stage} · ${releasedPieces}/${board.pieces.length} piezas liberadas`}
          </span>

          <div className="flex items-center gap-1">
            {SPEEDS.map((speed, index) => (
              <button
                key={speed.label}
                type="button"
                onClick={() => setSpeedIndex(index)}
                aria-pressed={index === speedIndex}
                className={`focus-ring rounded-[var(--r)] px-2 py-1 font-mono text-[11px] ${
                  index === speedIndex ? "bg-[var(--grafito)] text-white" : "text-[var(--muted)] hover:bg-[#f1f3f0]"
                }`}
              >
                {speed.label}
              </button>
            ))}
            <button type="button" className="btn btn-sm" onClick={() => goTo(totalCuts)}>
              Ver completo
            </button>
          </div>
        </div>
      </section>

      <details className="card no-print overflow-hidden" open>
        <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-[13.5px] font-semibold">
          <span>Listado de cortes ({plan.metrics.pieces} piezas)</span>
          <span className="font-mono text-[var(--muted)]">{plan.groups.length} medidas</span>
        </summary>
        <div className="max-h-[420px] overflow-auto border-t border-[var(--line)]">
          <CutGroupsTable
            groups={plan.groups}
            highlightedGroup={highlightedGroup}
            onHighlight={setHighlightedGroup}
          />
        </div>
      </details>

      {plan.stock.length > 0 ? (
        <details className="card no-print overflow-hidden">
          <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-[13.5px] font-semibold">
            <span>Sobrantes para stock ({plan.stock.length})</span>
            <span className="font-mono text-[var(--muted)]">{plan.metrics.remnantAreaM2.toFixed(2)} m²</span>
          </summary>
          <div className="max-h-[320px] overflow-auto border-t border-[var(--line)]">
            <StockRemnantsTable stock={plan.stock} />
          </div>
          <p className="px-4 py-3 text-[12.5px] text-[var(--muted)]">
            Recortes que salen de un solo corte y superan la medida mínima ({plan.meta.remnantMinShortSide} ×{" "}
            {plan.meta.remnantMinLongSide} mm). Guardalos como material para el próximo pedido.
          </p>
        </details>
      ) : null}

      {/* Impresion: todas las placas terminadas, una por hoja. */}
      <div className="hidden print:block">
        {plan.boards.map((item) => (
          <div key={item.index} className="mb-6 break-inside-avoid">
            <h3 className="mb-2 text-[15px] font-bold">
              Placa {item.index + 1} de {plan.boards.length} · {Math.round(item.width)} × {Math.round(item.height)} mm ·{" "}
              {item.utilization.toFixed(1)}% aprovechada
            </h3>
            <BoardPlan board={item} meta={plan.meta} step={null} interactive={false} />
          </div>
        ))}
      </div>
    </div>
  );
}

function CutGroupsTable({
  groups,
  highlightedGroup,
  onHighlight
}: {
  groups: CutPlanView["groups"];
  highlightedGroup: string | null;
  onHighlight: (key: string | null) => void;
}) {
  const theme = useCompactTableTheme();
  const columns = useMemo<MRT_ColumnDef<CutPlanView["groups"][number]>[]>(
    () => [
      {
        accessorKey: "quantity",
        header: "Cant",
        size: 70
      },
      {
        id: "measure",
        header: "Medida (mm)",
        size: 130,
        accessorFn: (group) => `${group.width} x ${group.height}`
      },
      {
        accessorKey: "description",
        header: "Pieza",
        size: 260
      },
      {
        id: "edges",
        header: "Cantos",
        size: 120,
        accessorFn: (group) => edgeLabel(group.edges)
      },
      {
        id: "boards",
        header: "Placa",
        size: 120,
        accessorFn: (group) => group.boards.join(", ")
      }
    ],
    []
  );
  const table = useMaterialReactTable({
    columns,
    data: groups,
    localization: MRT_Localization_ES,
    enableColumnActions: false,
    enableColumnFilters: true,
    enableDensityToggle: false,
    enableFullScreenToggle: false,
    enablePagination: false,
    enableSorting: true,
    getRowId: (row) => row.key,
    initialState: { density: "compact" },
    muiTablePaperProps: tablePaperProps,
    muiTableHeadCellProps: tableHeadCellProps,
    muiTableBodyCellProps: tableBodyCellProps,
    muiTableBodyRowProps: ({ row }) => ({
      onMouseEnter: () => onHighlight(row.original.key),
      onMouseLeave: () => onHighlight(null),
      sx: {
        backgroundColor: highlightedGroup === row.original.key ? "#edf7f4" : undefined,
        cursor: "default"
      }
    })
  });

  return (
    <ThemeProvider theme={theme}>
      <MaterialReactTable table={table} />
    </ThemeProvider>
  );
}

function StockRemnantsTable({ stock }: { stock: CutPlanView["stock"] }) {
  const theme = useCompactTableTheme();
  const columns = useMemo<MRT_ColumnDef<CutPlanView["stock"][number]>[]>(
    () => [
      {
        id: "measure",
        header: "Medida (mm)",
        size: 150,
        accessorFn: (item) => {
          const [long, short] = [Math.round(item.width), Math.round(item.height)].sort((a, b) => b - a);
          return `${long} x ${short}`;
        }
      },
      {
        accessorKey: "areaM2",
        header: "m2",
        size: 90,
        Cell: ({ cell }) => cell.getValue<number>().toFixed(2)
      },
      {
        accessorKey: "boardNumber",
        header: "Placa",
        size: 90
      }
    ],
    []
  );
  const table = useMaterialReactTable({
    columns,
    data: stock,
    localization: MRT_Localization_ES,
    enableColumnActions: false,
    enableColumnFilters: true,
    enableDensityToggle: false,
    enableFullScreenToggle: false,
    enablePagination: false,
    enableSorting: true,
    getRowId: (row) => row.id,
    initialState: { density: "compact" },
    muiTablePaperProps: tablePaperProps,
    muiTableHeadCellProps: tableHeadCellProps,
    muiTableBodyCellProps: tableBodyCellProps
  });

  return (
    <ThemeProvider theme={theme}>
      <MaterialReactTable table={table} />
    </ThemeProvider>
  );
}

function useCompactTableTheme() {
  return useMemo(
    () =>
      createTheme({
        palette: {
          primary: { main: "#0f766e" },
          background: { default: "#ffffff", paper: "#ffffff" },
          text: { primary: "#17201f", secondary: "#5f6f6c" }
        },
        shape: { borderRadius: 8 },
        typography: { fontFamily: "inherit" }
      }),
    []
  );
}

const tablePaperProps = {
  sx: {
    border: 0,
    borderRadius: 0,
    boxShadow: "none"
  }
};

const tableHeadCellProps = {
  sx: {
    backgroundColor: "#eef3f1",
    color: "#17201f",
    fontSize: 12,
    fontWeight: 800
  }
};

const tableBodyCellProps = {
  sx: {
    borderColor: "var(--line)",
    fontSize: 13
  }
};

function Metric({ value, label, strong = false }: { value: string; label: string; strong?: boolean }) {
  return (
    <div className={`metric${strong ? " metric-strong" : ""}`}>
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
    </div>
  );
}

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
import type { ManualPiecePosition } from "@/lib/optimizations/manual-placement";
import { BoardPlan } from "./board-plan";
import { DiagPanel } from "./diag-panel";
import { releasedLevel, type DiagnosticTarget } from "./diagnostics";
import {
  familyVisual,
  inferPieceFamily,
  pieceFamilyKey,
  type ManualRemnantClass
} from "./visual-families";

type CutPlanViewerProps = {
  plan: CutPlanView;
  /** Acciones extra (exportar, enviar pedido) que se muestran en la cabecera. */
  actions?: React.ReactNode;
};

type VisualGroup = CutPlanView["groups"][number] & { family: string };

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
  const [manualMode, setManualMode] = useState(false);
  const [target, setTarget] = useState<DiagnosticTarget | null>(null);
  const [highlightedGroup, setHighlightedGroup] = useState<string | null>(null);
  const [familyOverrides, setFamilyOverrides] = useState<Record<string, string>>({});
  const [remnantOverrides, setRemnantOverrides] = useState<Record<string, ManualRemnantClass>>({});
  const [manualFamily, setManualFamily] = useState("");
  const [manualClass, setManualClass] = useState<ManualRemnantClass>("auto");
  const [piecePositionOverrides, setPiecePositionOverrides] = useState<Record<string, ManualPiecePosition>>({});
  const [manualPlacementNotice, setManualPlacementNotice] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const familyByPieceId = useMemo(() => {
    const result = new Map<string, string>();
    for (const item of plan.boards.flatMap((boardItem) => boardItem.pieces)) {
      result.set(item.id, familyOverrides[item.id] ?? inferPieceFamily(item.description));
    }
    return result;
  }, [familyOverrides, plan.boards]);

  const remnantClassById = useMemo(() => {
    const result = new Map<string, ManualRemnantClass>();
    for (const item of plan.boards.flatMap((boardItem) => boardItem.remnants)) {
      result.set(item.id, remnantOverrides[item.id] ?? "auto");
    }
    return result;
  }, [plan.boards, remnantOverrides]);

  const visualBoards = useMemo(
    () =>
      plan.boards.map((boardItem) => ({
        ...boardItem,
        pieces: boardItem.pieces.map((piece) => ({
          ...piece,
          ...(piecePositionOverrides[piece.id] ?? {})
        })),
        remnants: boardItem.remnants.map((remnant) => ({
          ...remnant,
          commercial:
            (remnantOverrides[remnant.id] ?? "auto") === "usable" ||
            ((remnantOverrides[remnant.id] ?? "auto") === "auto" && remnant.commercial)
        }))
      })),
    [piecePositionOverrides, plan.boards, remnantOverrides]
  );

  const visualStock = useMemo(
    () =>
      visualBoards
        .flatMap((boardItem) =>
          boardItem.remnants
            .filter((remnant) => remnant.commercial)
            .map((remnant) => ({
              id: remnant.id,
              boardNumber: boardItem.index + 1,
              width: remnant.width,
              height: remnant.height,
              areaM2: (remnant.width * remnant.height) / 1e6
            }))
        )
        .sort((a, b) => b.areaM2 - a.areaM2),
    [visualBoards]
  );

  const visualMetrics = useMemo(() => {
    const areas = visualStock.map((item) => item.areaM2).sort((a, b) => b - a);
    return {
      ...plan.metrics,
      remnantCount: visualStock.length,
      remnantAreaM2: areas.reduce((total, area) => total + area, 0),
      largestRemnantM2: areas[0] ?? 0,
      secondLargestRemnantM2: areas[1] ?? 0,
      remnantFragments: areas.length
    };
  }, [plan.metrics, visualStock]);

  const visualGroups = useMemo<VisualGroup[]>(() => {
    const families = new Map<string, string>();
    for (const item of visualBoards.flatMap((boardItem) => boardItem.pieces)) {
      families.set(pieceFamilyKey(item), familyByPieceId.get(item.id) ?? inferPieceFamily(item.description));
    }
    return plan.groups.map((group) => ({
      ...group,
      family: families.get(group.key) ?? inferPieceFamily(group.description)
    }));
  }, [familyByPieceId, plan.groups, visualBoards]);

  const visualPlan = useMemo(
    () => ({ ...plan, boards: visualBoards, stock: visualStock, metrics: visualMetrics }),
    [plan, visualBoards, visualStock, visualMetrics]
  );

  const board = visualPlan.boards[Math.min(boardIndex, visualPlan.boards.length - 1)];
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

  useEffect(() => {
    setFamilyOverrides({});
    setRemnantOverrides({});
    setPiecePositionOverrides({});
    setManualPlacementNotice(null);
    setTarget(null);
  }, [plan.meta.createdAt, plan.meta.resultId]);

  useEffect(() => {
    if (!target) return;

    if (target.kind === "piece") {
      setManualFamily(familyByPieceId.get(target.piece.id) ?? inferPieceFamily(target.piece.description));
      return;
    }

    if (target.kind === "remnant") {
      setManualClass(remnantClassById.get(target.remnant.id) ?? "auto");
    }
  }, [familyByPieceId, remnantClassById, target]);

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
    const group = visualGroups.find((item) => item.key === highlightedGroup);
    if (!group) return [];
    return board.pieces
      .filter(
        (piece) =>
          (piece.description || piece.reference || "Pieza") === group.description &&
          piece.sourceWidth === group.width &&
          piece.sourceHeight === group.height
      )
      .map((piece) => piece.id);
  }, [board, highlightedGroup, visualGroups]);

  const applyManualEdit = () => {
    if (!target) return;

    if (target.kind === "piece") {
      const family = manualFamily.trim() || inferPieceFamily(target.piece.description);
      setFamilyOverrides((current) => ({ ...current, [target.piece.id]: family }));
    } else if (target.kind === "remnant") {
      setRemnantOverrides((current) => ({ ...current, [target.remnant.id]: manualClass }));
    }
  };

  const handlePieceMove = useCallback((pieceId: string, position: ManualPiecePosition) => {
    setPiecePositionOverrides((current) => ({ ...current, [pieceId]: position }));
    setManualPlacementNotice("Pieza reubicada en la vista manual. La optimización y el XML no fueron modificados.");
  }, []);

  const handlePieceMoveRejected = useCallback((reason: "outside-board" | "overlap") => {
    setManualPlacementNotice(
      reason === "overlap"
        ? "La pieza se superpone con otra. Volvió a su posición original."
        : "La pieza sale del área útil del tablero. Volvió a su posición original."
    );
  }, []);

  const toggleManualMode = () => {
    setManualMode((current) => !current);
    setDiagMode(false);
    setTarget(null);
    setManualPlacementNotice(null);
  };

  if (!board) {
    return <div className="empty-state">La optimización no devolvió placas para dibujar.</div>;
  }

  const stage = currentStep >= totalCuts ? null : board.cuts[Math.max(0, currentStep - 1)]?.level ?? 1;
  const level = releasedLevel(board.cuts, currentStep);
  const releasedPieces = board.pieces.filter((piece) => piece.level <= level).length;

  return (
    <div className="space-y-4">
      <div className="metric-grid no-print">
        <Metric strong value={`${visualPlan.metrics.utilization.toFixed(2)}%`} label="Aprovechamiento" />
        <Metric value={String(visualPlan.metrics.boards)} label="Placas" />
        <Metric value={String(visualPlan.metrics.pieces)} label="Piezas" />
        <Metric value={plan.metrics.cutAreaM2.toFixed(2)} label="m² cortados" />
        <Metric value={visualPlan.metrics.offcutAreaM2.toFixed(2)} label="m² de recorte" />
        <Metric value={String(visualPlan.metrics.cuts)} label="Cortes de sierra" />
        <Metric value={visualPlan.metrics.sawMeters.toFixed(1)} label="m de recorrido" />
        {visualPlan.metrics.remnantCount > 0 ? (
          <>
            <Metric value={visualPlan.metrics.remnantAreaM2.toFixed(2)} label="m² recuperables" />
            <Metric value={visualPlan.metrics.largestRemnantM2.toFixed(2)} label="m² mayor sobrante" />
          </>
        ) : null}
        {visualPlan.metrics.edgeSides > 0 ? (
          <>
            <Metric value={visualPlan.metrics.edgeBand045Meters.toFixed(1)} label="ml canto 0,45" />
            <Metric value={visualPlan.metrics.edgeBand2mmMeters.toFixed(1)} label="ml canto 2 mm" />
            <Metric value={visualPlan.metrics.edgeMeters.toFixed(1)} label="ml canto total" />
            <Metric value={String(visualPlan.metrics.edgeSides)} label="Lados con canto" />
          </>
        ) : null}
      </div>

      <section className="card no-print overflow-hidden">
        <div className="card-head no-print">
          <div className="min-w-0">
            <div className="eyebrow-muted">Plano de corte</div>
            <h3 className="mt-1 text-[17px] font-bold">
              Placa {board.index + 1} de {visualPlan.boards.length}
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
            {visualPlan.boards.length > 1 ? (
              <div className="flex flex-wrap gap-1 rounded-[var(--r-md)] border border-[var(--line)] bg-[#f6f8f5] p-1">
                {visualPlan.boards.map((item) => (
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
                setManualMode(false);
                setTarget(null);
              }}
              aria-pressed={diagMode}
              className={`btn btn-sm ${diagMode ? "btn-primary" : ""}`}
            >
              ◎ Diagnóstico
            </button>

            <button
              type="button"
              onClick={toggleManualMode}
              aria-pressed={manualMode}
              className={`btn btn-sm ${manualMode ? "btn-primary" : ""}`}
              title="Clasificar familias y sobrantes solo para esta vista"
            >
              Edicion manual
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
                meta={visualPlan.meta}
                step={step}
                diagMode={diagMode}
                manualMode={manualMode}
                highlightedPieceIds={highlightedPieceIds}
                familyByPieceId={familyByPieceId}
                remnantClassById={remnantClassById}
                selectedId={
                  target?.kind === "piece"
                    ? target.piece.id
                    : target?.kind === "remnant"
                      ? target.remnant.id
                      : null
                }
                onSelect={setTarget}
                onPieceMove={handlePieceMove}
                onPieceMoveRejected={handlePieceMoveRejected}
              />
            </div>
            <PlanLegend board={board} familyByPieceId={familyByPieceId} remnantClassById={remnantClassById} />
          </div>

          {diagMode ? (
            <div className="no-print border-t border-[var(--line)] bg-[#0b1420] p-3 xl:border-l xl:border-t-0">
              <DiagPanel target={target} meta={visualPlan.meta} onClose={() => setDiagMode(false)} />
            </div>
          ) : null}
        </div>

        {manualMode ? (
          <div className="no-print border-t border-[var(--line)] bg-[#fbfcfa] px-3 py-2.5 text-[12px] text-[var(--muted)]">
            Modo manual activo: arrastra una pieza hacia un hueco libre o selecciona una pieza o un recorte para editar
            su familia o clasificacion. Los cambios son visuales y no modifican el arbol ni el XML.
            {manualPlacementNotice ? <strong className="ml-2 text-[var(--grafito)]">{manualPlacementNotice}</strong> : null}
          </div>
        ) : null}

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

      {manualMode ? (
        <ManualEditor
          target={target}
          family={manualFamily}
          remnantClass={manualClass}
          onFamilyChange={setManualFamily}
          onRemnantClassChange={setManualClass}
          onApply={applyManualEdit}
          onClose={toggleManualMode}
        />
      ) : null}

      <details className="card no-print overflow-hidden" open>
        <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-[13.5px] font-semibold">
          <span>Listado de cortes ({plan.metrics.pieces} piezas)</span>
           <span className="font-mono text-[var(--muted)]">{visualGroups.length} medidas</span>
        </summary>
        <div className="max-h-[420px] overflow-auto border-t border-[var(--line)]">
          <CutGroupsTable
            groups={visualGroups}
            highlightedGroup={highlightedGroup}
            onHighlight={setHighlightedGroup}
          />
        </div>
      </details>

      {visualPlan.stock.length > 0 ? (
        <details className="card no-print overflow-hidden">
          <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-[13.5px] font-semibold">
            <span>Sobrantes para stock ({visualPlan.stock.length})</span>
            <span className="font-mono text-[var(--muted)]">{visualPlan.metrics.remnantAreaM2.toFixed(2)} m²</span>
          </summary>
          <div className="max-h-[320px] overflow-auto border-t border-[var(--line)]">
            <StockRemnantsTable stock={visualPlan.stock} />
          </div>
          <p className="px-4 py-3 text-[12.5px] text-[var(--muted)]">
            Recortes que salen de un solo corte y superan la medida mínima ({plan.meta.remnantMinShortSide} ×{" "}
            {plan.meta.remnantMinLongSide} mm). Guardalos como material para el próximo pedido.
          </p>
        </details>
      ) : null}

      {/* Impresion: todas las placas terminadas, una por hoja. */}
      <PrintPlanReport
        plan={visualPlan}
        familyByPieceId={familyByPieceId}
        remnantClassById={remnantClassById}
      />
    </div>
  );
}

function PrintPlanReport({
  plan,
  familyByPieceId,
  remnantClassById
}: {
  plan: CutPlanView;
  familyByPieceId: ReadonlyMap<string, string>;
  remnantClassById: ReadonlyMap<string, ManualRemnantClass>;
}) {
  return (
    <section className="print-report" aria-label="Reporte imprimible del plano de corte">
      <header className="print-report-header">
        <div>
          <div className="print-report-kicker">Plano de corte</div>
          <h1>{plan.meta.materialName || "Material"}</h1>
          <p>
            {plan.meta.materialCode ? `${plan.meta.materialCode} · ` : ""}
            {formatMillimeters(plan.meta.boardWidth)} × {formatMillimeters(plan.meta.boardHeight)} mm · espesor {formatMillimeters(plan.meta.thickness)} mm
          </p>
        </div>
        <div className="print-report-meta">
          <div>Resultado {plan.meta.resultId || "sin persistir"}</div>
          <div>Versión proyecto {plan.meta.projectVersion}</div>
          <div>Kerf {formatMillimeters(plan.meta.kerf)} mm · Refilado {formatMillimeters(plan.meta.trimX)} / {formatMillimeters(plan.meta.trimY)} mm</div>
        </div>
      </header>

      <PrintMetricGrid plan={plan} />

      {plan.boards.map((board) => (
        <PrintBoardSheet
          key={board.index}
          board={board}
          boardCount={plan.boards.length}
          plan={plan}
          familyByPieceId={familyByPieceId}
          remnantClassById={remnantClassById}
        />
      ))}
    </section>
  );
}

function PrintMetricGrid({ plan }: { plan: CutPlanView }) {
  const metrics = [
    ["Aprovechamiento", `${plan.metrics.utilization.toFixed(2)}%`],
    ["Placas", String(plan.metrics.boards)],
    ["Piezas", String(plan.metrics.pieces)],
    ["m² cortados", plan.metrics.cutAreaM2.toFixed(2)],
    ["m² recorte", plan.metrics.offcutAreaM2.toFixed(2)],
    ["Cortes de sierra", String(plan.metrics.cuts)],
    ["m recorrido", plan.metrics.sawMeters.toFixed(1)],
    ["m² sobrantes utilizables", plan.metrics.remnantAreaM2.toFixed(2)],
    ["Sobrantes", String(plan.metrics.remnantCount)],
    ["ml canto 0,45", plan.metrics.edgeBand045Meters.toFixed(1)],
    ["ml canto 2 mm", plan.metrics.edgeBand2mmMeters.toFixed(1)],
    ["ml canto total", plan.metrics.edgeMeters.toFixed(1)]
  ] as const;

  return (
    <div className="print-metric-grid">
      {metrics.map(([label, value], index) => (
        <div key={label} className={`print-metric${index === 0 ? " print-metric-strong" : ""}`}>
          <strong>{value}</strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function PrintBoardSheet({
  board,
  boardCount,
  plan,
  familyByPieceId,
  remnantClassById
}: {
  board: CutPlanView["boards"][number];
  boardCount: number;
  plan: CutPlanView;
  familyByPieceId: ReadonlyMap<string, string>;
  remnantClassById: ReadonlyMap<string, ManualRemnantClass>;
}) {
  const boardEdges = summarizeBoardEdges(board);
  const usableRemnants = board.remnants.filter((remnant) => isUsableRemnant(remnant, remnantClassById));
  const boardRemnantAreaM2 = board.remnants.reduce((total, remnant) => total + remnant.area / 1e6, 0);
  const usableRemnantAreaM2 = usableRemnants.reduce((total, remnant) => total + remnant.area / 1e6, 0);

  return (
    <article className="print-board-sheet">
      <div className="print-board-heading">
        <div>
          <div className="print-report-kicker">Placa {board.index + 1} de {boardCount}</div>
          <h2>{formatMillimeters(board.width)} × {formatMillimeters(board.height)} mm</h2>
        </div>
        <div className="print-board-heading-meta">
          <div>{board.pieces.length} piezas · {board.cuts.length} cortes</div>
          <div>{board.utilization.toFixed(2)}% aprovechamiento</div>
        </div>
      </div>

      <div className="print-board-plan">
        <BoardPlan
          board={board}
          meta={plan.meta}
          step={null}
          interactive={false}
          familyByPieceId={familyByPieceId}
          remnantClassById={remnantClassById}
        />
      </div>

      <div className="print-board-metrics">
        <PrintBoardMetric label="Piezas" value={String(board.pieces.length)} />
        <PrintBoardMetric label="Cortes" value={String(board.cuts.length)} />
        <PrintBoardMetric label="m² piezas" value={(board.usedArea / 1e6).toFixed(2)} />
        <PrintBoardMetric label="m² sobrantes" value={boardRemnantAreaM2.toFixed(2)} />
        <PrintBoardMetric label="m² utilizables" value={usableRemnantAreaM2.toFixed(2)} />
        <PrintBoardMetric label="ml canto 0,45" value={boardEdges.edgeBand045Meters.toFixed(1)} />
        <PrintBoardMetric label="ml canto 2 mm" value={boardEdges.edgeBand2mmMeters.toFixed(1)} />
        <PrintBoardMetric label="ml canto total" value={boardEdges.meters.toFixed(1)} />
      </div>

      <div className="print-detail-grid">
        <PrintPiecesTable board={board} />
        <PrintRemnantsTable board={board} remnantClassById={remnantClassById} />
      </div>
    </article>
  );
}

function PrintBoardMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function PrintPiecesTable({ board }: { board: CutPlanView["boards"][number] }) {
  return (
    <section className="print-detail-section">
      <h3>Piezas de la placa</h3>
      <table className="print-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Referencia</th>
            <th>Descripción</th>
            <th>Medida</th>
            <th>Posición</th>
            <th>Rot.</th>
            <th>Cantos</th>
            <th>Tipo</th>
          </tr>
        </thead>
        <tbody>
          {board.pieces.map((piece, index) => (
            <tr key={piece.id}>
              <td>{index + 1}</td>
              <td>{piece.reference || "-"}</td>
              <td>{piece.description || "Pieza"}</td>
              <td>{formatMillimeters(piece.width)} × {formatMillimeters(piece.height)}</td>
              <td>{formatMillimeters(piece.x)}, {formatMillimeters(piece.y)}</td>
              <td>{piece.rotated ? "Sí" : "No"}</td>
              <td>{edgeLabel(piece.edges) || "-"}</td>
              <td>{edgeTypeLabel(piece.edgeType)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function PrintRemnantsTable({
  board,
  remnantClassById
}: {
  board: CutPlanView["boards"][number];
  remnantClassById: ReadonlyMap<string, ManualRemnantClass>;
}) {
  return (
    <section className="print-detail-section">
      <h3>Sobrantes y desperdicios</h3>
      {board.remnants.length === 0 ? (
        <p className="print-empty">No se generaron sobrantes.</p>
      ) : (
        <table className="print-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Medida</th>
              <th>Posición</th>
              <th>Área m²</th>
              <th>Clasificación</th>
            </tr>
          </thead>
          <tbody>
            {board.remnants.map((remnant, index) => (
              <tr key={remnant.id}>
                <td>{index + 1}</td>
                <td>{formatMillimeters(remnant.width)} × {formatMillimeters(remnant.height)}</td>
                <td>{formatMillimeters(remnant.x)}, {formatMillimeters(remnant.y)}</td>
                <td>{(remnant.area / 1e6).toFixed(3)}</td>
                <td>{isUsableRemnant(remnant, remnantClassById) ? "Sobrante utilizable" : "Desperdicio"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function summarizeBoardEdges(board: CutPlanView["boards"][number]) {
  let edgeBand045Meters = 0;
  let edgeBand2mmMeters = 0;
  let sides = 0;

  for (const piece of board.pieces) {
    for (const side of ["top", "bottom", "left", "right"] as const) {
      if (!piece.edges[side]) continue;
      sides += 1;
      const meters = (side === "left" || side === "right" ? piece.sourceHeight : piece.sourceWidth) / 1000;
      if (piece.edgeType === "thin" || piece.edgeType === "both") edgeBand045Meters += meters;
      if (piece.edgeType === "thick" || piece.edgeType === "both") edgeBand2mmMeters += meters;
    }
  }

  return {
    meters: edgeBand045Meters + edgeBand2mmMeters,
    edgeBand045Meters,
    edgeBand2mmMeters,
    sides
  };
}

function isUsableRemnant(
  remnant: CutPlanView["boards"][number]["remnants"][number],
  remnantClassById: ReadonlyMap<string, ManualRemnantClass>
) {
  const manualClass = remnantClassById.get(remnant.id) ?? "auto";
  return manualClass === "usable" || (manualClass === "auto" && remnant.commercial);
}

function edgeTypeLabel(edgeType: CutPlanView["groups"][number]["edgeType"]) {
  if (edgeType === "thin") return "0,45 mm";
  if (edgeType === "thick") return "2 mm";
  if (edgeType === "both") return "Ambos";
  return "Sin canto";
}

function formatMillimeters(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.00$/, "");
}

function PlanLegend({
  board,
  familyByPieceId
}: {
  board: CutPlanView["boards"][number];
  familyByPieceId: ReadonlyMap<string, string>;
  remnantClassById: ReadonlyMap<string, ManualRemnantClass>;
}) {
  const families = [...new Set(board.pieces.map((piece) => familyByPieceId.get(piece.id) ?? inferPieceFamily(piece.description)))].sort(
    (a, b) => a.localeCompare(b, "es")
  );

  return (
    <div className="plan-legend no-print">
      {families.map((family) => {
        const visual = familyVisual(family);
        return (
          <span key={family} className="plan-legend-item">
            <i className="plan-legend-swatch" style={{ background: visual.color, borderStyle: visual.dash ? "dashed" : "solid" }} />
            {family}
          </span>
        );
      })}
      <span className="plan-legend-item">
        <i className="plan-legend-swatch plan-legend-remnant" />
        Sobrante util
      </span>
      <span className="plan-legend-item">
        <i className="plan-legend-swatch plan-legend-waste" />
        Desperdicio
      </span>
    </div>
  );
}

function ManualEditor({
  target,
  family,
  remnantClass,
  onFamilyChange,
  onRemnantClassChange,
  onApply,
  onClose
}: {
  target: DiagnosticTarget | null;
  family: string;
  remnantClass: ManualRemnantClass;
  onFamilyChange: (value: string) => void;
  onRemnantClassChange: (value: ManualRemnantClass) => void;
  onApply: () => void;
  onClose: () => void;
}) {
  const isPiece = target?.kind === "piece";
  const isRemnant = target?.kind === "remnant";

  return (
    <section className="optimizer-manual-editor no-print" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="eyebrow-muted">Edicion local</div>
          <h3 className="mt-1 text-[15px] font-bold">Familias y sobrantes</h3>
        </div>
        <button type="button" className="btn btn-sm btn-icon" onClick={onClose} aria-label="Cerrar edicion manual">
          x
        </button>
      </div>
      <p className="mt-2 text-[12px] leading-5 text-[var(--muted)]">
        No mueve piezas ni modifica el arbol de cortes. Sirve para preparar la lectura visual y clasificar material.
      </p>

      {!target ? <p className="mt-3 text-[12px] text-[var(--muted)]">Selecciona una pieza o un recorte en el plano.</p> : null}

      {isPiece && target.kind === "piece" ? (
        <div className="mt-3 space-y-3">
          <div className="rounded border border-[var(--line)] bg-[var(--md-surface-container-low)] p-2 text-[12px]">
            {target.piece.description || target.piece.reference} · {Math.round(target.piece.width)} x {Math.round(target.piece.height)} mm
          </div>
          <label className="block">
            <span className="field-label">Familia visual</span>
            <input value={family} onChange={(event) => onFamilyChange(event.target.value)} className="input mt-1.5" />
          </label>
        </div>
      ) : null}

      {isRemnant && target.kind === "remnant" ? (
        <div className="mt-3 space-y-3">
          <div className="rounded border border-[var(--line)] bg-[var(--md-surface-container-low)] p-2 text-[12px]">
            Recorte {Math.round(target.remnant.width)} x {Math.round(target.remnant.height)} mm · placa {target.boardNumber}
          </div>
          <label className="block">
            <span className="field-label">Clasificacion</span>
            <select
              value={remnantClass}
              onChange={(event) => onRemnantClassChange(event.target.value as ManualRemnantClass)}
              className="select mt-1.5"
            >
              <option value="auto">Automatica</option>
              <option value="usable">Sobrante util</option>
              <option value="waste">Desperdicio</option>
            </select>
          </label>
        </div>
      ) : null}

      <button type="button" className="btn btn-primary mt-3 w-full" onClick={onApply} disabled={!isPiece && !isRemnant}>
        Aplicar a esta vista
      </button>
    </section>
  );
}

function CutGroupsTable({
  groups,
  highlightedGroup,
  onHighlight
}: {
  groups: VisualGroup[];
  highlightedGroup: string | null;
  onHighlight: (key: string | null) => void;
}) {
  const theme = useCompactTableTheme();
  const columns = useMemo<MRT_ColumnDef<VisualGroup>[]>(
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
        accessorKey: "family",
        header: "Familia",
        size: 150,
        Cell: ({ cell }) => {
          const visual = familyVisual(String(cell.getValue() ?? "Sin familia"));
          return (
            <span className="inline-flex items-center gap-2">
              <i className="plan-legend-swatch" style={{ background: visual.color, borderStyle: visual.dash ? "dashed" : "solid" }} />
              {visual.name}
            </span>
          );
        }
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

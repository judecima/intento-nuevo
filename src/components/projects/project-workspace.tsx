"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BoardPicker, type BoardMaterialOption } from "@/components/materials/board-picker";
import { CutPlanViewer } from "@/components/optimizer/cut-plan-viewer";
import { PrintButton } from "@/components/optimizer/print-button";
import { countSelectedEdges, cycleEdgeCount, setEdgeBandType } from "@/lib/domain/edge-bands";
import { normalizeProjectItemOrientation, parsePastedProjectItems, type ProjectDraftItem } from "@/lib/domain/projects";
import { previewProjectOptimizationAction } from "@/lib/optimizations/actions";
import type { CutPlanView } from "@/lib/optimizations/plan-view";
import { saveProjectDraftAction, saveProjectDraftOnlyAction } from "@/lib/projects/actions";

type Strategy = "baseline" | "v10";
type OptimizerProfile = "fast" | "balanced" | "deep";
type OptimizerModeId = "baseline-fast" | "v10-fast" | "v10-balanced" | "v10-deep";

type EditorRow = ProjectDraftItem & { uid: string };

const OPTIMIZER_MODES: Array<{
  id: OptimizerModeId;
  label: string;
  strategy: Strategy;
  profile: OptimizerProfile;
}> = [
  { id: "baseline-fast", label: "Baseline rapido", strategy: "baseline", profile: "fast" },
  { id: "v10-fast", label: "V10 rapido", strategy: "v10", profile: "fast" },
  { id: "v10-balanced", label: "V10 balanceado / Lepton", strategy: "v10", profile: "balanced" },
  { id: "v10-deep", label: "V10 profundo", strategy: "v10", profile: "deep" }
];

export type { BoardMaterialOption };

export type ProjectWorkspaceProps = {
  projectId: string;
  version: number;
  editable: boolean;
  settings: {
    materialId: string;
    boardWidth: number;
    boardHeight: number;
    boardThickness: number;
    grainEnabled: boolean;
    name: string;
    description: string;
    kerf: number;
    trimX: number;
    trimY: number;
    minRemnant: number;
    minCutSize: number;
  };
  boardMaterials: BoardMaterialOption[];
  items: ProjectDraftItem[];
  storedPlan: CutPlanView | null;
  /** Fecha del plano ya formateada en el servidor: evita desajustes de hidratacion. */
  storedPlanSavedAt: string | null;
  lastAttempt: { status: string; error: string | null; at: string; strategy: string } | null;
};

export function ProjectWorkspace(props: ProjectWorkspaceProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [version, setVersion] = useState(props.version);
  const [settings, setSettings] = useState(props.settings);
  const [rows, setRows] = useState<EditorRow[]>(() => props.items.map(withUid));
  const [optimizerModeId, setOptimizerModeId] = useState<OptimizerModeId>("baseline-fast");
  const [preview, setPreview] = useState<CutPlanView | null>(null);
  const [busy, setBusy] = useState<"preview" | "save" | "reoptimize" | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error" | "info"; text: string } | null>(null);
  const [paste, setPaste] = useState("");

  const baseline = useRef(signature(props.settings, props.items));
  const dirty = signature(settings, rows) !== baseline.current;

  // Cuando el server component se revalida y no hay cambios locales, tomamos
  // los datos nuevos; si el usuario esta editando, no le pisamos la pantalla.
  useEffect(() => {
    const incoming = signature(props.settings, props.items);
    if (incoming === baseline.current) return;
    if (signature(settings, rows) !== baseline.current) return;

    baseline.current = incoming;
    setSettings(props.settings);
    setRows(props.items.map(withUid));
    setVersion(props.version);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.items, props.settings, props.version]);

  const metrics = useMemo(() => {
    const pieces = rows.reduce((total, row) => total + (Number(row.quantity) || 0), 0);
    const area = rows.reduce(
      (total, row) => total + ((Number(row.width) || 0) * (Number(row.height) || 0) * (Number(row.quantity) || 0)) / 1e6,
      0
    );
    return { rows: rows.length, pieces, area };
  }, [rows]);

  const plan = preview ?? props.storedPlan;
  const selectedMaterial = useMemo(
    () => props.boardMaterials.find((material) => material.id === settings.materialId) ?? null,
    [props.boardMaterials, settings.materialId]
  );
  const optimizerMode = OPTIMIZER_MODES.find((mode) => mode.id === optimizerModeId) ?? OPTIMIZER_MODES[0];
  const selectedMaterialHasGrain = Boolean(selectedMaterial?.hasGrain);
  const selectedMaterialId = selectedMaterial?.id ?? "";

  useEffect(() => {
    if (!selectedMaterialId) return;
    setRows((current) => normalizeProjectItemOrientation(current, selectedMaterialHasGrain));
  }, [selectedMaterialId, selectedMaterialHasGrain]);

  const draft = () => ({
    projectId: props.projectId,
    expectedVersion: version,
    materialId: settings.materialId,
    name: settings.name,
    description: settings.description,
    kerf: Number(settings.kerf),
    trimX: Number(settings.trimX),
    trimY: Number(settings.trimY),
    minRemnant: Number(settings.minRemnant),
    minCutSize: Number(settings.minCutSize),
    strategy: optimizerMode.strategy,
    profile: optimizerMode.profile,
    items: rows.map(({ uid: _uid, ...item }) => ({
      ...item,
      quantity: Number(item.quantity),
      width: Number(item.width),
      height: Number(item.height)
    }))
  });

  const invalidRows = rows.filter(
    (row) => !row.reference.trim() || !(Number(row.width) > 0) || !(Number(row.height) > 0) || !(Number(row.quantity) > 0)
  ).length;

  const operationText =
    busy === "preview"
      ? "Optimizando vista previa..."
      : busy === "save"
        ? "Guardando cambios..."
        : busy === "reoptimize"
          ? "Reoptimizando el proyecto guardado..."
        : pending
          ? "Actualizando pantalla..."
          : null;

  const runPreview = async () => {
    setBusy("preview");
    setMessage(null);
    const outcome = await previewProjectOptimizationAction(draft());
    setBusy(null);

    if (!outcome.ok) {
      setPreview(null);
      setMessage({ kind: "error", text: outcome.error });
      return;
    }

    setPreview(outcome.plan);
    setMessage({
      kind: "info",
      text: "Vista previa generada con los datos de pantalla. Todavia no se guardo nada."
    });
  };

  const saveDraft = async () => {
    setBusy("save");
    setMessage(null);
    const outcome = await saveProjectDraftOnlyAction(draft());
    setBusy(null);

    if (!outcome.ok) {
      setMessage({ kind: "error", text: outcome.error });
      return;
    }

    baseline.current = signature(settings, rows);
    setVersion(outcome.version);
    setPreview(null);
    setMessage({ kind: "ok", text: "Cambios guardados. El plano vigente no fue reoptimizado." });
    startTransition(() => router.refresh());
  };

  const reoptimize = async () => {
    setBusy("reoptimize");
    setMessage(null);
    const outcome = await saveProjectDraftAction(draft());
    setBusy(null);

    if (!outcome.ok) {
      setMessage({ kind: "error", text: outcome.error });
      return;
    }

    baseline.current = signature(settings, rows);
    setVersion(outcome.version);
    setPreview(null);
    setMessage(
      outcome.optimization.ok
        ? { kind: "ok", text: "Cambios guardados y plano reoptimizado." }
        : { kind: "error", text: `Cambios guardados, pero la optimizacion fallo: ${outcome.optimization.error ?? "motivo desconocido"}` }
    );
    if (outcome.optimization.ok) {
      // La tarjeta de envio vive en el server component y necesita consultar
      // nuevamente estado, version y optimizacion vigente antes de habilitarse.
      window.location.reload();
      return;
    }
    startTransition(() => router.refresh());
  };

  const updateRow = (uid: string, patch: Partial<EditorRow>) => {
    setRows((current) => current.map((row) => (row.uid === uid ? { ...row, ...patch } : row)));
  };

  const updateMaterial = (materialId: string) => {
    const material = props.boardMaterials.find((item) => item.id === materialId);
    if (!material) return;

    setSettings((current) => ({
      ...current,
      materialId: material.id,
      boardWidth: material.width,
      boardHeight: material.height,
      boardThickness: material.thickness,
      grainEnabled: material.hasGrain
    }));
    setRows((current) => normalizeProjectItemOrientation(current, material.hasGrain));
    setPreview(null);
    setMessage({
      kind: "info",
      text: "Tablero cambiado en pantalla. Guarda y optimiza para actualizar el plano vigente."
    });
  };

  const addRow = () => {
    setRows((current) => [
      ...current,
      {
        uid: crypto.randomUUID(),
        reference: `P${current.length + 1}`,
        description: "",
        quantity: 1,
        width: 600,
        height: 400,
        grain: false,
        canRotate: true,
        edgeTop: false,
        edgeBottom: false,
        edgeLeft: false,
        edgeRight: false,
        edgeType: "none" as const
      }
    ]);
  };

  const importPaste = () => {
    const { items, invalidLines } = parsePastedProjectItems(paste);
    if (items.length === 0) {
      setMessage({ kind: "error", text: "No se pudo leer ninguna linea del listado." });
      return;
    }

    setRows((current) => [
      ...current,
      ...items.map((item, index) => ({
        uid: crypto.randomUUID(),
        reference: `P${current.length + index + 1}`,
        description: item.description,
        quantity: item.quantity,
        width: item.width,
        height: item.height,
        grain: false,
        canRotate: true,
        edgeTop: false,
        edgeBottom: false,
        edgeLeft: false,
        edgeRight: false,
        edgeType: "none" as const
      }))
    ]);
    setPaste("");
    setMessage({
      kind: invalidLines.length > 0 ? "error" : "info",
      text:
        invalidLines.length > 0
          ? `${items.length} filas agregadas. No pude leer: ${invalidLines.slice(0, 3).join(" · ")}`
          : `${items.length} filas agregadas. Guarda para persistirlas.`
    });
  };

  const working = busy !== null || pending;

  return (
    <div className="space-y-5">
      {operationText ? (
        <div className="operation-banner no-print" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <span>
            {operationText}
            <span className="operation-subtext">No cierres esta pantalla; el resultado se mostrara al finalizar.</span>
          </span>
        </div>
      ) : null}

      <section className="card overflow-hidden">
        <div className="card-head no-print">
          <div className="min-w-0">
            <div className="eyebrow-muted">Optimizacion</div>
            <h2 className="mt-1 text-[19px] font-bold">Plano de corte</h2>
            <p className="hint mt-1.5">
              {preview
                ? "Vista previa con los datos de pantalla, sin guardar."
                : plan
                  ? `${plan.metrics.boards} placa${plan.metrics.boards > 1 ? "s" : ""} · motor ${plan.meta.modeLabel}${
                      props.storedPlanSavedAt ? ` · guardado ${props.storedPlanSavedAt}` : ""
                    }`
                  : "Carga las piezas y proba la optimizacion."}
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            {preview ? <span className="badge badge-accent">Vista previa · sin guardar</span> : null}
            {plan ? <PrintButton label="Imprimir plano" /> : null}
            {props.editable ? (
              <>
                <label className="block">
                  <span className="field-label">Motor</span>
                  <select
                    value={optimizerModeId}
                    onChange={(event) => {
                      setOptimizerModeId(event.target.value as OptimizerModeId);
                      setPreview(null);
                    }}
                    className="select mt-1.5 w-[210px]"
                  >
                    {OPTIMIZER_MODES.map((mode) => (
                      <option key={mode.id} value={mode.id}>
                        {mode.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={runPreview}
                  disabled={working || rows.length === 0 || invalidRows > 0}
                  className="btn focus-ring"
                >
                  {busy === "preview" ? "Optimizando..." : "Probar sin guardar"}
                </button>
                <button type="button" onClick={saveDraft} disabled={working || invalidRows > 0 || !dirty} className="btn focus-ring">
                  {busy === "save" ? "Guardando..." : "Guardar borrador"}
                </button>
                <button type="button" onClick={reoptimize} disabled={working || invalidRows > 0} className="btn btn-accent focus-ring">
                  {busy === "reoptimize"
                    ? "Reoptimizando..."
                    : dirty
                      ? "Guardar y optimizar"
                      : !props.storedPlan
                        ? "Optimizar para enviar"
                        : "Reoptimizar"}
                </button>
              </>
            ) : null}
          </div>
        </div>

        <div className="p-4">
          {message ? (
            <div
              className={`no-print mb-4 rounded-[var(--r-md)] border border-[var(--line)] border-l-4 px-4 py-3 text-sm ${
                message.kind === "error"
                  ? "border-l-[var(--danger)] bg-[var(--alerta-suave)]"
                  : message.kind === "ok"
                    ? "border-l-[var(--ok)] bg-[var(--ok-suave)]"
                    : "border-l-[var(--teal)] bg-white"
              }`}
            >
              {message.text}
            </div>
          ) : null}

          {!message && props.lastAttempt?.status === "failed" ? (
            <div className="no-print mb-4 rounded-[var(--r-md)] border border-[var(--line)] border-l-4 border-l-[var(--danger)] bg-[var(--alerta-suave)] px-4 py-3 text-sm">
              <strong className="font-semibold">La ultima optimizacion no se pudo guardar</strong>
              <p className="mt-1">{props.lastAttempt.error ?? "El motor no devolvio un plan valido."}</p>
            </div>
          ) : null}

          {dirty && !preview ? (
            <div className="no-print mb-4 rounded-[var(--r-md)] border border-[var(--line)] border-l-4 border-l-[var(--accent)] bg-white px-4 py-3 text-sm">
              Hay cambios sin guardar. Proba la optimizacion para verlos en el plano, o guarda para dejarlos firmes.
            </div>
          ) : null}

          {plan ? (
            <CutPlanViewer plan={plan} />
          ) : (
            <div className="empty-state">
              <strong>Todavia no hay plan</strong>
              Carga las piezas y usa Probar sin guardar para ver el plano, simular la secuencia de sierra y revisar los
              sobrantes.
            </div>
          )}
        </div>
      </section>

      <section className="card no-print overflow-hidden">
        <div className="card-head">
          <div>
            <div className="eyebrow-muted">Piezas</div>
            <h2 className="mt-1 text-[19px] font-bold">Carga de corte</h2>
            <p className="hint mt-1.5">
              {metrics.rows} filas · {metrics.pieces} piezas · {metrics.area.toFixed(2)} m²
              {dirty ? " · sin guardar" : ""}
            </p>
          </div>
          {props.editable ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={addRow} className="btn btn-primary focus-ring">
                Agregar pieza
              </button>
            </div>
          ) : null}
        </div>

        {rows.length > 0 ? (
          <div className="overflow-x-auto">
              <div className="min-w-[1180px]">
              <div className="grid grid-cols-[86px_minmax(160px,1fr)_74px_92px_92px_70px_70px_430px_84px] gap-2 border-b border-[var(--line)] bg-[#f6f8f5] px-4 py-2 text-[9.5px] font-semibold uppercase tracking-[0.09em] text-[var(--muted)]">
                <div>Ref.</div>
                <div>Descripcion</div>
                <div>Cant.</div>
                <div>Ancho</div>
                <div>Alto</div>
                <div>Veta</div>
                <div>Rotar</div>
                <div>Cantos</div>
                <div />
              </div>
              {rows.map((row) => (
                <div
                  key={row.uid}
                  className="grid grid-cols-[86px_minmax(160px,1fr)_74px_92px_92px_70px_70px_430px_84px] items-center gap-2 border-b border-[#edefec] px-4 py-2 hover:bg-[#fafbf9]"
                >
                  <input
                    value={row.reference}
                    onChange={(event) => updateRow(row.uid, { reference: event.target.value })}
                    disabled={!props.editable}
                    className="input input-num"
                  />
                  <input
                    value={row.description}
                    onChange={(event) => updateRow(row.uid, { description: event.target.value })}
                    disabled={!props.editable}
                    className="input"
                    placeholder="Nombre de la pieza"
                  />
                  <NumberCell
                    value={row.quantity}
                    step={1}
                    disabled={!props.editable}
                    onChange={(value) => updateRow(row.uid, { quantity: value })}
                  />
                  <NumberCell
                    value={row.width}
                    disabled={!props.editable}
                    onChange={(value) => updateRow(row.uid, { width: value })}
                  />
                  <NumberCell
                    value={row.height}
                    disabled={!props.editable}
                    onChange={(value) => updateRow(row.uid, { height: value })}
                  />
                  <select
                    value={String(row.grain)}
                    onChange={(event) => updateRow(row.uid, { grain: event.target.value === "true" })}
                    disabled={!props.editable}
                    className="select"
                  >
                    <option value="false">No</option>
                    <option value="true">Si</option>
                  </select>
                  <select
                    value={String(row.canRotate)}
                    onChange={(event) => updateRow(row.uid, { canRotate: event.target.value === "true" })}
                    disabled={!props.editable}
                    className="select"
                  >
                    <option value="true">Si</option>
                    <option value="false">No</option>
                  </select>
                  <div className="flex flex-wrap items-center gap-1">
                    {EDGE_BANDS.map((band) => {
                      const active = row.edgeType === band.type;
                      const edgeCount = active && band.type !== "none" ? countSelectedEdges(row) : 0;
                      return (
                        <button
                          key={band.type}
                          type="button"
                          title={`Usar canto: ${band.label}`}
                          aria-label={`${band.label}, ${active ? `${edgeCount} cantos` : "sin seleccionar"}`}
                          aria-pressed={active}
                          disabled={!props.editable}
                          onClick={() =>
                            setRows((current) =>
                              current.map((item) =>
                                item.uid === row.uid ? setEdgeBandType(item, band.type) : item
                              )
                            )
                          }
                          className={`inline-flex h-[30px] items-center gap-1 rounded-[var(--r)] border px-2 font-mono text-[10px] font-semibold ${
                            active
                              ? "border-[var(--teal-claro)] bg-[var(--teal)] text-white"
                              : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--linea-fuerte)]"
                          }`}
                        >
                          <span>{band.label}</span>
                          <span className="opacity-80">
                            {band.type === "none" ? "-" : active ? `${edgeCount}/2` : "-"}
                          </span>
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      title="Cantos: click para 1 lado, otra vez para 2 lados y otra vez para quitar"
                      aria-label={`Cantidad de lados con canto: ${countSelectedEdges(row)}`}
                      disabled={!props.editable}
                      onClick={() =>
                        setRows((current) =>
                          current.map((item) => (item.uid === row.uid ? cycleEdgeCount(item) : item))
                        )
                      }
                      className="inline-flex h-[30px] items-center rounded-[var(--r)] border border-[var(--line)] px-2 font-mono text-[10px] font-semibold text-[var(--muted)] hover:border-[var(--linea-fuerte)]"
                    >
                      {countSelectedEdges(row) === 0
                        ? "Sin lados"
                        : `${countSelectedEdges(row)} ${countSelectedEdges(row) === 1 ? "lado" : "lados"}`}
                    </button>
                    <div className="flex gap-1 border-l border-[var(--line)] pl-1">
                      {EDGES.map(([key, short, title]) => (
                        <button
                          key={key}
                          type="button"
                          title={`Ubicacion del tapacanto: ${title}`}
                          aria-pressed={row[key]}
                          disabled={!props.editable}
                          onClick={() =>
                            setRows((current) =>
                              current.map((item) => {
                                if (item.uid !== row.uid) return item;
                                const next = { ...item, [key]: !item[key] };
                                return {
                                  ...next,
                                  edgeType: countSelectedEdges(next) > 0 ? (next.edgeType === "none" ? "thin" : next.edgeType) : "none"
                                } as EditorRow;
                              })
                            )
                          }
                          className={`h-[30px] w-[30px] rounded-[var(--r)] border font-mono text-[11px] font-semibold ${
                            row[key]
                              ? "border-[var(--teal-claro)] bg-[var(--teal)] text-white"
                              : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--linea-fuerte)]"
                          }`}
                        >
                          {short}
                        </button>
                      ))}
                    </div>
                  </div>
                  {props.editable ? (
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        title="Duplicar"
                        onClick={() =>
                          setRows((current) => {
                            const index = current.findIndex((item) => item.uid === row.uid);
                            const copy = { ...row, uid: crypto.randomUUID(), id: undefined };
                            return [...current.slice(0, index + 1), copy, ...current.slice(index + 1)];
                          })
                        }
                        className="btn btn-sm focus-ring"
                      >
                        ⧉
                      </button>
                      <button
                        type="button"
                        title="Eliminar"
                        onClick={() => setRows((current) => current.filter((item) => item.uid !== row.uid))}
                        className="btn btn-sm btn-danger focus-ring"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <div />
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-4">
            <div className="empty-state">
              <strong>Sin piezas cargadas</strong>
              Agrega piezas una por una o pega el listado del taller.
            </div>
          </div>
        )}

        {props.editable ? (
          <div className="border-t border-[var(--line)] bg-[#fbfcfa] p-4">
            <details>
              <summary className="cursor-pointer text-[12.5px] font-semibold text-[var(--teal)]">
                Pegar listado del taller
              </summary>
              <div className="mt-2 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                <label className="block">
                  <span className="field-label">Una pieza por linea: cantidad, medidas y nombre</span>
                  <textarea
                    value={paste}
                    onChange={(event) => setPaste(event.target.value)}
                    rows={5}
                    className="textarea mt-1.5 font-mono text-[12px]"
                    placeholder={"4  629x570  Estantes\n2  500x582  Cajon base\n6  70x482   Soporte espejo"}
                  />
                </label>
                <button type="button" onClick={importPaste} disabled={!paste.trim()} className="btn focus-ring">
                  Cargar listado
                </button>
              </div>
            </details>

            {invalidRows > 0 ? (
              <p className="mt-3 text-[12.5px] text-[var(--danger)]">
                {invalidRows} fila{invalidRows > 1 ? "s" : ""} incompleta{invalidRows > 1 ? "s" : ""}: revisa
                referencia, cantidad y medidas antes de optimizar.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="card no-print">
        <div className="card-head">
          <div>
            <div className="eyebrow-muted">Proyecto</div>
            <h2 className="mt-1 text-[17px] font-bold">Material y datos</h2>
          </div>
          <div className="text-right">
            <span className="hint block">Perfil de maquina</span>
            <span className="hint block">
              Tablero {Math.round(settings.boardWidth)} x {Math.round(settings.boardHeight)} mm
            </span>
          </div>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="block md:col-span-2 xl:col-span-3">
            <span className="field-label">Material / tablero</span>
            <div className="mt-1.5">
              <BoardPicker
                materials={props.boardMaterials}
                selectedId={settings.materialId}
                disabled={!props.editable || props.boardMaterials.length === 0}
                onSelect={updateMaterial}
              />
            </div>
            <span className="hint mt-1.5 block">
              {selectedMaterial
                ? `${Math.round(selectedMaterial.width)} x ${Math.round(selectedMaterial.height)} mm / ${selectedMaterial.thickness} mm / ${
                    selectedMaterial.hasGrain ? "con veta" : "sin veta"
                  }${dirty && settings.materialId !== props.settings.materialId ? " · guarda para reoptimizar con este tablero" : ""}`
                : "Selecciona un tablero del catalogo."}
            </span>
          </div>
          <label className="block md:col-span-2 xl:col-span-1">
            <span className="field-label">Nombre</span>
            <input
              value={settings.name}
              onChange={(event) => setSettings({ ...settings, name: event.target.value })}
              disabled={!props.editable}
              className="input mt-1.5"
            />
          </label>
          <label className="block md:col-span-2">
            <span className="field-label">Descripcion</span>
            <input
              value={settings.description}
              onChange={(event) => setSettings({ ...settings, description: event.target.value })}
              disabled={!props.editable}
              className="input mt-1.5"
            />
          </label>
        </div>
      </section>
    </div>
  );
}

const EDGES = [
  ["edgeTop", "A", "arriba"],
  ["edgeBottom", "B", "abajo"],
  ["edgeLeft", "I", "izquierda"],
  ["edgeRight", "D", "derecha"]
] as const;

const EDGE_BANDS = [
  { type: "thin" as const, label: "0,45" },
  { type: "thick" as const, label: "2 mm" },
  { type: "both" as const, label: "Ambos" },
  { type: "none" as const, label: "Sin canto" }
];

function NumberCell({
  value,
  onChange,
  disabled,
  step = 0.1
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  step?: number;
}) {
  return (
    <input
      type="number"
      min={0}
      step={step}
      value={Number.isFinite(value) ? value : ""}
      onChange={(event) => onChange(event.target.value === "" ? 0 : Number(event.target.value))}
      disabled={disabled}
      className="input input-num"
    />
  );
}

function withUid(item: ProjectDraftItem, index: number): EditorRow {
  // Determinista para que el render del servidor y el del cliente coincidan.
  return { ...item, uid: item.id ?? `fila-${index}` };
}

function signature(settings: ProjectWorkspaceProps["settings"], items: Array<ProjectDraftItem>): string {
  return JSON.stringify([
    settings,
    items.map((item) => [
      item.id ?? null,
      item.reference,
      item.description,
      Number(item.quantity),
      Number(item.width),
      Number(item.height),
      item.grain,
      item.canRotate,
      item.edgeTop,
      item.edgeBottom,
      item.edgeLeft,
      item.edgeRight
    ])
  ]);
}

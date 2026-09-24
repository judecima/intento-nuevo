"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BoardPicker, type BoardMaterialOption } from "@/components/materials/board-picker";
import { CutPlanViewer } from "@/components/optimizer/cut-plan-viewer";
import { PrintButton } from "@/components/optimizer/print-button";
import { Notice } from "@/components/ui/notice";
import { EdgeBandPicker } from "@/components/projects/edge-band-picker";
import { emptyEdgeSelection } from "@/lib/domain/edge-bands";
import { EmptyState } from "@/components/ui/empty-state";
import { describePlanState, type PlanStateTone } from "@/lib/domain/plan-state";
import { Icon } from "@/components/ui/icons";
import { normalizeProjectItemOrientation, parsePastedProjectItems, type ProjectDraftItem } from "@/lib/domain/projects";
import { previewProjectOptimizationAction } from "@/lib/optimizations/actions";
import type { CutPlanView } from "@/lib/optimizations/plan-view";
import { saveProjectDraftAction, saveProjectDraftOnlyAction } from "@/lib/projects/actions";

type EditorRow = ProjectDraftItem & { uid: string };

// Product contract: users do not choose optimizer internals. V10 balanced is
// the stable quality envelope; runtime-policy selects fixed/Auto/Advanced.
const PRODUCT_OPTIMIZER = {
  strategy: "v10" as const,
  profile: "balanced" as const,
};

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
  const selectedMaterialHasGrain = Boolean(selectedMaterial?.hasGrain);
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
    strategy: PRODUCT_OPTIMIZER.strategy,
    profile: PRODUCT_OPTIMIZER.profile,
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
        grain: selectedMaterialHasGrain,
        canRotate: !selectedMaterialHasGrain,
        ...emptyEdgeSelection()
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
        grain: selectedMaterialHasGrain,
        canRotate: !selectedMaterialHasGrain,
        ...emptyEdgeSelection()
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

  // Que esta viendo el usuario y que le falta hacer. Antes esto habia que
  // deducirlo de que botones estaban habilitados y de como cambiaba el texto
  // del boton principal, que es justo lo que obligaba a capacitar.
  const planStatus = describePlanState({
    hasRows: rows.length > 0,
    invalidRows,
    isPreview: Boolean(preview),
    dirty,
    hasStoredPlan: Boolean(props.storedPlan),
    storedPlanSavedAt: props.storedPlanSavedAt,
    storedBoards: props.storedPlan?.metrics.boards ?? 0
  });

  const primaryLabel =
    busy === "reoptimize"
      ? "Optimizando..."
      : props.storedPlan && !dirty
        ? "Volver a optimizar"
        : "Guardar y optimizar";

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
              {plan
                ? `${plan.metrics.boards} placa${plan.metrics.boards > 1 ? "s" : ""} · motor ${plan.meta.modeLabel}`
                : "Motor automatico"}
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            {plan ? <PrintButton label="Imprimir plano" /> : null}
            {props.editable ? (
              <>
                {/* De menos a mas comprometido: probar, guardar, publicar. El
                    titulo de cada boton dice que toca y que no toca. */}
                <button
                  type="button"
                  onClick={runPreview}
                  disabled={working || rows.length === 0 || invalidRows > 0}
                  title="Calcula el plano con los datos que hay en pantalla para que lo veas. No guarda nada."
                  className="btn focus-ring"
                >
                  {busy === "preview" ? "Optimizando..." : "Probar sin guardar"}
                </button>
                <button
                  type="button"
                  onClick={saveDraft}
                  disabled={working || invalidRows > 0 || !dirty}
                  title="Guarda las piezas y los datos del proyecto, pero deja el plano como esta."
                  className="btn btn-ghost focus-ring"
                >
                  {busy === "save" ? "Guardando..." : "Guardar sin optimizar"}
                </button>
                <button
                  type="button"
                  onClick={reoptimize}
                  disabled={working || invalidRows > 0 || rows.length === 0}
                  title="Guarda los cambios y vuelve a calcular el plano. Es el paso necesario para poder enviar el pedido."
                  className="btn btn-accent focus-ring"
                >
                  {primaryLabel}
                </button>
              </>
            ) : null}
          </div>
        </div>

        <div className="p-4">
          {message ? (
            <Notice kind={message.kind === "error" ? "error" : message.kind === "ok" ? "ok" : "info"} className="no-print mb-4">
              {message.text}
            </Notice>
          ) : null}

          {!message && props.lastAttempt?.status === "failed" ? (
            <Notice kind="error" title="La ultima optimizacion no se pudo guardar" className="no-print mb-4">
              {props.lastAttempt.error ?? "El motor no devolvio un plan valido."}
            </Notice>
          ) : null}

          <div className={`plan-status ${planStatusToneClasses[planStatus.tone]} no-print mb-4`}>
            <span className="plan-status-dot" aria-hidden="true" />
            <div className="min-w-0">
              <p className="plan-status-title">{planStatus.title}</p>
              <p className="plan-status-detail">{planStatus.detail}</p>
              {/* El proximo paso nombra botones: en un proyecto de solo
                  lectura esos botones no existen. */}
              {planStatus.next && props.editable ? <p className="plan-status-next">{planStatus.next}</p> : null}
            </div>
          </div>

          {plan ? (
            <CutPlanViewer plan={plan} />
          ) : (
            <EmptyState title="Todavia no hay plano">
              Carga las piezas y usa <strong>Probar sin guardar</strong> para ver como quedan en el tablero, simular la
              secuencia de sierra y revisar los sobrantes.
            </EmptyState>
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
              <div className="min-w-[1120px]">
              <div className="grid grid-cols-[76px_minmax(170px,1fr)_70px_88px_88px_96px_96px_268px_80px] gap-2 border-b border-[var(--line)] bg-[var(--md-surface-container)] px-4 py-2 grid-head">
                <div>Ref.</div>
                <div>Descripcion</div>
                <div>Cant.</div>
                <div>
                  <span title="Medida horizontal de la pieza, en milimetros">Ancho</span>
                </div>
                <div>
                  <span title="Medida vertical de la pieza, en milimetros">Alto</span>
                </div>
                <div>
                  <span title="La pieza tiene que respetar la direccion de la veta del tablero">Sigue veta</span>
                </div>
                <div>
                  <span title="El optimizador puede girar la pieza 90 grados para aprovechar mejor el tablero">Puede rotar</span>
                </div>
                <div>
                  <span title="Lados de la pieza que llevan tapacanto, y de que espesor">Tapacanto</span>
                </div>
                <div>
                  <span className="sr-only">Acciones</span>
                </div>
              </div>
              {rows.map((row) => (
                <div
                  key={row.uid}
                  className="grid grid-cols-[76px_minmax(170px,1fr)_70px_88px_88px_96px_96px_268px_80px] items-center gap-2 border-b border-[var(--line)] px-4 py-2 hover:bg-[var(--brand-primary-hover-surface)]"
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
                  <EdgeBandPicker
                    value={row}
                    disabled={!props.editable}
                    onChange={(next) => updateRow(row.uid, next)}
                  />
                  {props.editable ? (
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        title="Duplicar esta pieza"
                        aria-label={`Duplicar la pieza ${row.reference || "sin referencia"}`}
                        onClick={() =>
                          setRows((current) => {
                            const index = current.findIndex((item) => item.uid === row.uid);
                            const copy = { ...row, uid: crypto.randomUUID(), id: undefined };
                            return [...current.slice(0, index + 1), copy, ...current.slice(index + 1)];
                          })
                        }
                        className="btn btn-sm btn-icon focus-ring"
                      >
                        <Icon name="duplicate" className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        title="Eliminar esta pieza"
                        aria-label={`Eliminar la pieza ${row.reference || "sin referencia"}`}
                        onClick={() => setRows((current) => current.filter((item) => item.uid !== row.uid))}
                        className="btn btn-sm btn-icon btn-danger focus-ring"
                      >
                        <Icon name="trash" className="h-4 w-4" />
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
            <EmptyState title="Sin piezas cargadas">
              Agrega las piezas una por una con <strong>Agregar pieza</strong>, o pega el listado del taller desde el
              bloque de abajo.
            </EmptyState>
          </div>
        )}

        {props.editable ? (
          <div className="border-t border-[var(--line)] bg-[var(--md-surface-container-low)] p-4">
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

/** Nombres completos: Tailwind purga lo que no encuentra escrito literal. */
const planStatusToneClasses: Record<PlanStateTone, string> = {
  empty: "plan-status-empty",
  blocked: "plan-status-blocked",
  preview: "plan-status-preview",
  stale: "plan-status-stale",
  current: "plan-status-current"
};

/**
 * Traduce el estado interno del editor a una frase.
 *
 * El orden importa: primero lo que impide avanzar, despues lo que el usuario
 * esta mirando, y al final la situacion normal.
 */

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
      item.edgeTopType,
      item.edgeBottomType,
      item.edgeLeftType,
      item.edgeRightType
    ])
  ]);
}

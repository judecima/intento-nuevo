"use client";

import { useState } from "react";
import { BoardPicker, type BoardMaterialOption } from "@/components/materials/board-picker";
import { EdgeBandPicker } from "@/components/projects/edge-band-picker";
import { PipelineStepper } from "@/components/ui/pipeline-stepper";
import type { OrderStatus } from "@/lib/domain/orders";
import { describePlanState, type PlanStateInput } from "@/lib/domain/plan-state";
import type { EdgeSideSelection } from "@/lib/domain/edge-bands";

const PLAN_CASES: Array<{ caption: string; input: PlanStateInput }> = [
  {
    caption: "Sin piezas",
    input: {
      hasRows: false,
      invalidRows: 0,
      isPreview: false,
      dirty: false,
      hasStoredPlan: false,
      storedPlanSavedAt: null,
      storedBoards: 0
    }
  },
  {
    caption: "Filas incompletas",
    input: {
      hasRows: true,
      invalidRows: 2,
      isPreview: false,
      dirty: true,
      hasStoredPlan: false,
      storedPlanSavedAt: null,
      storedBoards: 0
    }
  },
  {
    caption: "Vista previa",
    input: {
      hasRows: true,
      invalidRows: 0,
      isPreview: true,
      dirty: true,
      hasStoredPlan: true,
      storedPlanSavedAt: "14/08/26, 10:12",
      storedBoards: 7
    }
  },
  {
    caption: "Plano desactualizado",
    input: {
      hasRows: true,
      invalidRows: 0,
      isPreview: false,
      dirty: true,
      hasStoredPlan: true,
      storedPlanSavedAt: "14/08/26, 10:12",
      storedBoards: 7
    }
  },
  {
    caption: "Plano al dia",
    input: {
      hasRows: true,
      invalidRows: 0,
      isPreview: false,
      dirty: false,
      hasStoredPlan: true,
      storedPlanSavedAt: "14/08/26, 10:12",
      storedBoards: 7
    }
  }
];

const TONE_CLASSES: Record<string, string> = {
  empty: "plan-status-empty",
  blocked: "plan-status-blocked",
  preview: "plan-status-preview",
  stale: "plan-status-stale",
  current: "plan-status-current"
};

const PIPELINE_CASES: Array<{ caption: string; orderStatus: OrderStatus | null }> = [
  { caption: "Proyecto en borrador, sin pedido", orderStatus: null },
  { caption: "Pedido esperando al vendedor", orderStatus: "submitted" },
  { caption: "Devuelto para correcciones", orderStatus: "changes_requested" },
  { caption: "En pegado de canto", orderStatus: "edgebanding" },
  { caption: "Entregado", orderStatus: "delivered" },
  { caption: "Cancelado", orderStatus: "cancelled" }
];

const DEMO_BOARDS: BoardMaterialOption[] = [
  { id: "1", code: "AGL15ABE", description: "Aglomerado 15 mm Abedul", width: 2750, height: 1830, thickness: 15, hasGrain: true, dimensionsLabel: "2750 x 1830 mm", imageUrl: null },
  { id: "2", code: "MDF18BLA", description: "MDF 18 mm Blanco", width: 2600, height: 1830, thickness: 18, hasGrain: false, dimensionsLabel: "2600 x 1830 mm", imageUrl: null },
  { id: "3", code: "AGL18ROB", description: "Aglomerado 18 mm Roble Natural", width: 2750, height: 1830, thickness: 18, hasGrain: true, dimensionsLabel: "2750 x 1830 mm", imageUrl: null },
  { id: "4", code: null, description: "Melamina 12 mm Gris Ceniza", width: 2440, height: 1220, thickness: 12, hasGrain: false, dimensionsLabel: "2440 x 1220 mm", imageUrl: null }
];

export function BoardPickerDemo() {
  const [boardId, setBoardId] = useState("1");

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <div className="eyebrow-muted">Materiales</div>
          <h2 className="mt-1 text-[17px] font-bold">Selector de tablero</h2>
        </div>
      </div>
      <div className="p-4">
        <div className="max-w-[520px]">
          <BoardPicker materials={DEMO_BOARDS} selectedId={boardId} onSelect={setBoardId} />
        </div>
        <p className="hint mt-2">Abri el selector para revisar el dialogo completo.</p>
      </div>
    </section>
  );
}

export function PipelineDemo() {
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <div className="eyebrow-muted">Seguimiento</div>
          <h2 className="mt-1 text-[17px] font-bold">Recorrido del trabajo</h2>
        </div>
      </div>
      <div className="space-y-5 p-4">
        {PIPELINE_CASES.map(({ caption, orderStatus }) => (
          <div key={caption}>
            <p className="field-label mb-2">{caption}</p>
            <PipelineStepper projectStatus="draft" orderStatus={orderStatus} />
          </div>
        ))}

        <div>
          <p className="field-label mb-2">Variante compacta, para filas de tabla</p>
          <div className="space-y-1.5">
            <PipelineStepper orderStatus="submitted" compact />
            <PipelineStepper orderStatus="production" compact />
            <PipelineStepper orderStatus="completed" compact />
          </div>
        </div>
      </div>
    </section>
  );
}

export function WorkspaceDemo() {
  const [edges, setEdges] = useState<EdgeSideSelection>({
    edgeTopType: "thick",
    edgeBottomType: "thin",
    edgeLeftType: "both",
    edgeRightType: "none"
  });

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <div className="eyebrow-muted">Workspace</div>
          <h2 className="mt-1 text-[17px] font-bold">Estado del plano y tapacanto</h2>
        </div>
      </div>
      <div className="space-y-4 p-4">
        <div className="space-y-2">
          {PLAN_CASES.map(({ caption, input }) => {
            const state = describePlanState(input);
            return (
              <div key={caption}>
                <p className="field-label mb-1">{caption}</p>
                <div className={`plan-status ${TONE_CLASSES[state.tone]}`}>
                  <span className="plan-status-dot" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="plan-status-title">{state.title}</p>
                    <p className="plan-status-detail">{state.detail}</p>
                    {state.next ? <p className="plan-status-next">{state.next}</p> : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div>
          <p className="field-label mb-1.5">Tapacanto de una pieza</p>
          <EdgeBandPicker value={edges} onChange={setEdges} />
          <p className="hint mt-2">
            Cada click en un lado avanza el espesor: 0,45 mm, 2 mm, los dos, y el cuarto lo saca. Estado actual:{" "}
            {JSON.stringify(edges)}
          </p>
        </div>
      </div>
    </section>
  );
}

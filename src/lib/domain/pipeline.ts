import type { OrderStatus } from "./orders";
import type { ProjectStatus } from "./projects";

/**
 * Etapas del recorrido que hace un trabajo, de la carga de piezas a la entrega.
 *
 * El producto tiene dos maquinas de estados (proyecto y pedido) que el usuario
 * nunca ve como tales: para el es un solo recorrido. Esto las traduce a esa
 * unica linea de tiempo.
 */
export const pipelineStageKeys = ["draft", "optimized", "review", "approved", "production", "done"] as const;

export type PipelineStageKey = (typeof pipelineStageKeys)[number];

export type PipelineStageState = "done" | "current" | "pending";

export type PipelineStage = {
  key: PipelineStageKey;
  label: string;
  /** Que pasa en esta etapa y quien la mueve. */
  hint: string;
  state: PipelineStageState;
  /** Precision sobre la situacion puntual, solo en la etapa actual. */
  note?: string;
};

export type PipelineDeviation = {
  tone: "warn" | "error";
  label: string;
  detail: string;
};

export type Pipeline = {
  stages: PipelineStage[];
  /** Indice de la etapa actual, o -1 si el trabajo salio del recorrido. */
  currentIndex: number;
  deviation: PipelineDeviation | null;
};

const STAGE_DEFINITIONS: Record<PipelineStageKey, { label: string; hint: string }> = {
  draft: {
    label: "Borrador",
    hint: "El cliente carga las piezas y elige el tablero."
  },
  optimized: {
    label: "Optimizado",
    hint: "El proyecto ya tiene plano de corte y se puede enviar al vendedor."
  },
  review: {
    label: "En revision",
    hint: "El vendedor revisa el pedido: lo aprueba o pide correcciones."
  },
  approved: {
    label: "Aprobado",
    hint: "Produccion genera el XML y arranca el corte."
  },
  production: {
    label: "En produccion",
    hint: "Corte en la seccionadora y, si lleva, pegado de canto."
  },
  done: {
    label: "Finalizado",
    hint: "Trabajo terminado y listo para entregar."
  }
};

type Resolution = {
  key: PipelineStageKey | null;
  note?: string;
  deviation?: PipelineDeviation;
};

/** El pedido, cuando existe, manda sobre el estado del proyecto. */
function fromOrder(status: OrderStatus): Resolution {
  switch (status) {
    case "pending":
    case "submitted":
      return { key: "review", note: "Esperando que el vendedor lo tome" };
    case "under_review":
      return { key: "review", note: "El vendedor lo esta revisando" };
    case "changes_requested":
      // El pedido vuelve al cliente: la RPC deja el proyecto en "optimized".
      return {
        key: "optimized",
        deviation: {
          tone: "warn",
          label: "Devuelto para correcciones",
          detail: "El vendedor pidio cambios. Corregi el proyecto y volve a enviarlo."
        }
      };
    case "approved":
      return { key: "approved", note: "Esperando que produccion lo tome" };
    case "production":
      return { key: "production", note: "Cortando en la seccionadora" };
    case "edgebanding":
      return { key: "production", note: "En pegado de canto" };
    case "completed":
      return { key: "done" };
    case "delivered":
      return { key: "done", note: "Entregado al cliente" };
    case "cancelled":
      return {
        key: null,
        deviation: {
          tone: "error",
          label: "Pedido cancelado",
          detail: "Este pedido se cancelo y no sigue el recorrido."
        }
      };
  }
}

function fromProject(status: ProjectStatus): Resolution {
  switch (status) {
    case "draft":
      return { key: "draft" };
    case "optimizing":
      return { key: "draft", note: "Calculando el plano" };
    case "optimized":
      return { key: "optimized", note: "Listo para enviar al vendedor" };
    case "submitted":
    case "under_review":
      return { key: "review" };
    case "approved":
      return { key: "approved" };
    case "in_production":
      return { key: "production" };
    case "completed":
      return { key: "done" };
    case "rejected":
      return {
        key: "optimized",
        deviation: {
          tone: "error",
          label: "Proyecto rechazado",
          detail: "El pedido no paso la revision. Revisa el comentario del vendedor antes de reenviarlo."
        }
      };
    case "cancelled":
      return {
        key: null,
        deviation: {
          tone: "error",
          label: "Proyecto cancelado",
          detail: "Este proyecto se cancelo y no sigue el recorrido."
        }
      };
  }
}

/**
 * `projectStatus` es opcional porque las tablas de pedidos solo conocen el
 * estado del pedido, que de todos modos tiene prioridad cuando existe.
 */
export function resolvePipeline(input: {
  projectStatus?: ProjectStatus | null;
  orderStatus?: OrderStatus | null;
}): Pipeline {
  const resolution = input.orderStatus
    ? fromOrder(input.orderStatus)
    : fromProject(input.projectStatus ?? "draft");
  const currentIndex = resolution.key ? pipelineStageKeys.indexOf(resolution.key) : -1;

  const stages = pipelineStageKeys.map((key, index) => {
    const definition = STAGE_DEFINITIONS[key];
    const state: PipelineStageState =
      currentIndex === -1 || index > currentIndex ? "pending" : index === currentIndex ? "current" : "done";

    return {
      key,
      label: key === "done" && input.orderStatus === "delivered" ? "Entregado" : definition.label,
      hint: definition.hint,
      state,
      ...(state === "current" && resolution.note ? { note: resolution.note } : {})
    };
  });

  return { stages, currentIndex, deviation: resolution.deviation ?? null };
}

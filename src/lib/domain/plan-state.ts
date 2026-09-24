export type PlanStateTone = "empty" | "blocked" | "preview" | "stale" | "current";

export type PlanState = {
  tone: PlanStateTone;
  title: string;
  detail: string;
  next?: string;
};

export type PlanStateInput = {
  hasRows: boolean;
  invalidRows: number;
  isPreview: boolean;
  dirty: boolean;
  hasStoredPlan: boolean;
  storedPlanSavedAt: string | null;
  storedBoards: number;
};

/**
 * Traduce el estado interno del editor a una frase.
 *
 * El orden importa: primero lo que impide avanzar, despues lo que el usuario
 * esta mirando, y al final la situacion normal.
 */
export function describePlanState(input: PlanStateInput): PlanState {
  if (input.invalidRows > 0) {
    return {
      tone: "blocked",
      title: `Hay ${input.invalidRows} fila${input.invalidRows > 1 ? "s" : ""} incompleta${input.invalidRows > 1 ? "s" : ""}`,
      detail: "Cada pieza necesita referencia, cantidad, ancho y alto mayores a cero.",
      next: "Completalas y vas a poder optimizar."
    };
  }

  if (!input.hasRows) {
    return {
      tone: "empty",
      title: "Todavia no cargaste piezas",
      detail: "El plano se arma a partir de la lista de piezas de este proyecto.",
      next: "Agrega una pieza o pega el listado del taller."
    };
  }

  if (input.isPreview) {
    return {
      tone: "preview",
      title: "Vista previa sin guardar",
      detail: "Estas viendo el resultado de los datos que hay en pantalla. El proyecto todavia no cambio.",
      next: "Si te sirve, usa Guardar y optimizar para dejarlo firme y poder enviar el pedido."
    };
  }

  if (!input.hasStoredPlan) {
    return {
      tone: "stale",
      title: "El proyecto no tiene plano todavia",
      detail: "Hay piezas cargadas, pero nunca se corrio la optimizacion.",
      next: "Usa Probar sin guardar para ver como queda, o Guardar y optimizar para dejarlo listo."
    };
  }

  if (input.dirty) {
    return {
      tone: "stale",
      title: "El plano no incluye tus ultimos cambios",
      detail: input.storedPlanSavedAt
        ? `El plano vigente es el que se guardo el ${input.storedPlanSavedAt}.`
        : "El plano vigente es anterior a los cambios que hiciste en pantalla.",
      next: "Usa Guardar y optimizar para actualizarlo."
    };
  }

  return {
    tone: "current",
    title: "Plano al dia",
    detail: `${input.storedBoards} placa${input.storedBoards === 1 ? "" : "s"}${
      input.storedPlanSavedAt ? `, guardado el ${input.storedPlanSavedAt}` : ""
    }. Incluye todos los cambios guardados.`,
    next: "Ya podes enviarlo al vendedor desde Envio a vendedor, mas abajo."
  };
}

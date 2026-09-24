import { describe, expect, it } from "vitest";
import { describePlanState, type PlanStateInput } from "@/lib/domain/plan-state";

const base: PlanStateInput = {
  hasRows: true,
  invalidRows: 0,
  isPreview: false,
  dirty: false,
  hasStoredPlan: true,
  storedPlanSavedAt: "14/08/26, 10:12",
  storedBoards: 7
};

describe("describePlanState", () => {
  it("bloquea primero por filas incompletas, aun con plano al dia", () => {
    const state = describePlanState({ ...base, invalidRows: 2 });
    expect(state.tone).toBe("blocked");
    expect(state.title).toContain("2 filas incompletas");
  });

  it("avisa que no hay piezas antes que cualquier otra cosa", () => {
    const state = describePlanState({ ...base, hasRows: false, hasStoredPlan: false });
    expect(state.tone).toBe("empty");
    expect(state.next).toBeTruthy();
  });

  it("deja claro que la vista previa no guardo nada", () => {
    const state = describePlanState({ ...base, isPreview: true, dirty: true });
    expect(state.tone).toBe("preview");
    expect(state.detail).toContain("El proyecto todavia no cambio");
  });

  it("distingue un proyecto sin plano de uno con plano desactualizado", () => {
    const sinPlano = describePlanState({ ...base, hasStoredPlan: false, storedPlanSavedAt: null });
    expect(sinPlano.tone).toBe("stale");
    expect(sinPlano.title).toContain("no tiene plano");

    const desactualizado = describePlanState({ ...base, dirty: true });
    expect(desactualizado.tone).toBe("stale");
    expect(desactualizado.title).toContain("no incluye tus ultimos cambios");
    expect(desactualizado.detail).toContain("14/08/26, 10:12");
  });

  it("confirma el plano al dia y apunta al paso siguiente", () => {
    const state = describePlanState(base);
    expect(state.tone).toBe("current");
    expect(state.detail).toContain("7 placas");
    expect(state.next).toContain("Envio a vendedor");
  });

  it("singulariza el conteo de placas", () => {
    expect(describePlanState({ ...base, storedBoards: 1 }).detail).toContain("1 placa,");
  });
});

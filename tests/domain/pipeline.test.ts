import { describe, expect, it } from "vitest";
import { pipelineStageKeys, resolvePipeline } from "@/lib/domain/pipeline";

const states = (input: Parameters<typeof resolvePipeline>[0]) =>
  resolvePipeline(input).stages.map((stage) => stage.state);

describe("resolvePipeline", () => {
  it("arranca en borrador cuando el proyecto recien se crea", () => {
    const pipeline = resolvePipeline({ projectStatus: "draft" });
    expect(pipeline.currentIndex).toBe(0);
    expect(states({ projectStatus: "draft" })).toEqual([
      "current",
      "pending",
      "pending",
      "pending",
      "pending",
      "pending"
    ]);
  });

  it("marca como cumplidas las etapas anteriores a la actual", () => {
    expect(states({ projectStatus: "optimized", orderStatus: "approved" })).toEqual([
      "done",
      "done",
      "done",
      "current",
      "pending",
      "pending"
    ]);
  });

  it("el estado del pedido manda sobre el del proyecto", () => {
    // El proyecto sigue diciendo "optimized" mientras el pedido ya esta en corte.
    const pipeline = resolvePipeline({ projectStatus: "optimized", orderStatus: "production" });
    expect(pipeline.stages[pipeline.currentIndex].key).toBe("production");
  });

  it("distingue corte de pegado de canto sin cambiar la etapa", () => {
    const corte = resolvePipeline({ projectStatus: "in_production", orderStatus: "production" });
    const canto = resolvePipeline({ projectStatus: "in_production", orderStatus: "edgebanding" });

    expect(corte.stages[4].note).toBe("Cortando en la seccionadora");
    expect(canto.stages[4].note).toBe("En pegado de canto");
    expect(corte.currentIndex).toBe(canto.currentIndex);
  });

  it("devuelve el trabajo al cliente cuando ventas pide correcciones", () => {
    const pipeline = resolvePipeline({ projectStatus: "optimized", orderStatus: "changes_requested" });
    expect(pipeline.stages[pipeline.currentIndex].key).toBe("optimized");
    expect(pipeline.deviation).toMatchObject({ tone: "warn", label: "Devuelto para correcciones" });
  });

  it("saca del recorrido lo cancelado y no deja ninguna etapa en curso", () => {
    const pipeline = resolvePipeline({ projectStatus: "cancelled", orderStatus: "cancelled" });
    expect(pipeline.currentIndex).toBe(-1);
    expect(pipeline.stages.every((stage) => stage.state === "pending")).toBe(true);
    expect(pipeline.deviation?.tone).toBe("error");
  });

  it("senala el rechazo sin perder el avance del proyecto", () => {
    const pipeline = resolvePipeline({ projectStatus: "rejected" });
    expect(pipeline.stages[pipeline.currentIndex].key).toBe("optimized");
    expect(pipeline.deviation?.tone).toBe("error");
  });

  it("renombra la ultima etapa cuando el pedido ya se entrego", () => {
    expect(resolvePipeline({ projectStatus: "completed", orderStatus: "completed" }).stages[5].label).toBe("Finalizado");
    expect(resolvePipeline({ projectStatus: "completed", orderStatus: "delivered" }).stages[5].label).toBe("Entregado");
  });

  it("devuelve siempre las seis etapas en orden", () => {
    const pipeline = resolvePipeline({ projectStatus: "draft" });
    expect(pipeline.stages.map((stage) => stage.key)).toEqual([...pipelineStageKeys]);
  });
});

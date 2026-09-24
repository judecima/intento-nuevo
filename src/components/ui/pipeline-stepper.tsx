import { CheckIcon } from "@/components/ui/icons";
import { resolvePipeline } from "@/lib/domain/pipeline";
import type { OrderStatus } from "@/lib/domain/orders";
import type { ProjectStatus } from "@/lib/domain/projects";

/**
 * Linea de tiempo del trabajo, de la carga de piezas a la entrega.
 *
 * El estado de cada paso viaja en `data-state` y no en el nombre de la clase:
 * asi las reglas quedan escritas literales en el CSS y Tailwind no las purga.
 */
export function PipelineStepper({
  projectStatus,
  orderStatus,
  compact = false,
  showLabel = true,
  className = ""
}: {
  projectStatus?: ProjectStatus | null;
  orderStatus?: OrderStatus | null;
  /** Solo los marcadores y la etapa actual, para filas de tabla. */
  compact?: boolean;
  /** En `compact`, oculta el texto cuando la fila ya muestra el estado. */
  showLabel?: boolean;
  className?: string;
}) {
  const pipeline = resolvePipeline({ projectStatus, orderStatus });
  const current = pipeline.stages[pipeline.currentIndex];

  if (compact) {
    return (
      <div className={`pipeline-compact ${className}`}>
        <ol aria-label="Etapas del pedido">
          {pipeline.stages.map((stage) => (
            <li key={stage.key} data-state={stage.state} title={`${stage.label}: ${stage.hint}`}>
              <span className="sr-only">
                {stage.label}: {stage.state === "done" ? "completado" : stage.state === "current" ? "en curso" : "pendiente"}
              </span>
            </li>
          ))}
        </ol>
        {showLabel ? (
          <span className="pipeline-compact-label">
            {pipeline.deviation ? pipeline.deviation.label : (current?.label ?? "Fuera del recorrido")}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className={className}>
      <ol className="pipeline" aria-label="Etapas del pedido">
        {pipeline.stages.map((stage, index) => (
          <li key={stage.key} className="pipeline-step" data-state={stage.state} title={stage.hint}>
            <span className="pipeline-marker" aria-hidden="true">
              {stage.state === "done" ? <CheckIcon className="h-3.5 w-3.5" /> : index + 1}
            </span>
            <span className="pipeline-text">
              <span className="pipeline-label">{stage.label}</span>
              <span className="sr-only">
                {stage.state === "done" ? " (completado)" : stage.state === "current" ? " (etapa actual)" : " (pendiente)"}
              </span>
              {stage.note ? <span className="pipeline-note">{stage.note}</span> : null}
            </span>
          </li>
        ))}
      </ol>

      {pipeline.deviation ? (
        <p className="pipeline-deviation" data-tone={pipeline.deviation.tone}>
          <strong>{pipeline.deviation.label}.</strong> {pipeline.deviation.detail}
        </p>
      ) : null}
    </div>
  );
}

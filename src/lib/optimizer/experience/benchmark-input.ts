import type { CanonicalOptimizationCase } from "../canonical-case";
import type { OptimizationInput, OptimizerProfile, OptimizerStrategy } from "../types";

export interface BenchmarkInputOptions {
  strategy?: OptimizerStrategy;
  profile?: OptimizerProfile;
}

/** Mismo criterio que optimizerProfileForStrategy en src/lib/optimizations/project-input.ts. */
export function benchmarkProfileForStrategy(strategy: OptimizerStrategy): OptimizerProfile {
  return strategy === "baseline" ? "fast" : "balanced";
}

/**
 * Adaptador SOLO para el benchmark offline de Exact Memory.
 *
 * Convierte un CanonicalOptimizationCase (tipicamente extraido de un XML historico) en el
 * OptimizationInput que espera el motor, replicando los defaults de produccion de
 * buildOptimizationInputFromProject. No participa del flujo real y no cambia el motor.
 *
 * Decisiones explicitas, aplicadas por igual al camino baseline y al camino experience:
 * - hasGrain null (veta desconocida, todo el universo project) se corre como false. El
 *   fingerprint SI distingue unknown de false, asi que una entrada de un caso unknown nunca
 *   puede reutilizarse en un caso declarado sin veta.
 * - rotationAllowed null y grain null se omiten y quedan a criterio del motor.
 * - minCommercialRemnantLongSide replica max(minRemnant, 400) como en produccion.
 */
export function benchmarkInputFromCanonicalCase(
  canonical: CanonicalOptimizationCase,
  options: BenchmarkInputOptions = {}
): OptimizationInput {
  const strategy = options.strategy ?? "baseline";
  const profile = options.profile ?? benchmarkProfileForStrategy(strategy);
  const minRemnant = canonical.constraints.minRemnant;

  return {
    strategy,
    board: {
      width: canonical.panel.width,
      height: canonical.panel.height,
      ...(canonical.panel.thickness ? { thickness: canonical.panel.thickness } : {})
    },
    material: {
      ...(canonical.material.code ? { code: canonical.material.code } : {}),
      description: canonical.material.description,
      hasGrain: canonical.material.hasGrain ?? false,
      ...(canonical.material.thickness ? { thickness: canonical.material.thickness } : {})
    },
    kerf: canonical.kerf,
    trim: { x: canonical.trim.x, y: canonical.trim.y },
    constraints: {
      profile,
      stages: canonical.constraints.stages ?? 4,
      minRemnant,
      minCommercialRemnantLongSide:
        canonical.constraints.minCommercialRemnantLongSide ?? Math.max(minRemnant, 400)
    },
    pieces: canonical.pieces.map((piece) => ({
      reference: piece.reference,
      ...(piece.description === undefined ? {} : { description: piece.description }),
      quantity: piece.quantity,
      width: piece.width,
      height: piece.height,
      ...(piece.grain === null ? {} : { grain: piece.grain }),
      ...(piece.rotationAllowed === null ? {} : { canRotate: piece.rotationAllowed }),
      edges: { ...piece.edges },
      ...(piece.edgeType ? { edgeType: piece.edgeType } : {})
    }))
  };
}

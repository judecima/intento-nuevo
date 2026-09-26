import { Builder } from './core/builder';
import { withConfig, type BuildConfig } from './core/config';
import type { FurnitureModel, FurnitureParams, ValidationIssue } from './core/types';
import { validateGeometry, validateParams } from './core/validate';
import { TEMPLATES } from './registry';

export * from './core/types';
export { DEFAULT_CONFIG, withConfig, type BuildConfig } from './core/config';
export { cutList, hardwareList, edgeBandMeters, type CutListLine } from './core/bom';
export { toOptimizationInputs, type OptimizerAdapterOptions, type MaterialSpec } from './adapters/optimizer';
export type { OptimizationInput } from '@/lib/optimizer';
export { TEMPLATES, TEMPLATE_TYPES } from './registry';

export class FurnitureValidationError extends Error {
  constructor(readonly issues: ValidationIssue[]) {
    super(issues.map((i) => i.message).join(' '));
  }
}

export interface GenerateOptions {
  config?: Partial<BuildConfig>;
  /** Corre los chequeos geométricos (recomendado en desarrollo y tests). */
  checkGeometry?: boolean;
}

/**
 * Genera un mueble. Lanza FurnitureValidationError si las medidas están fuera de rango
 * o si el modelo resultante no es geométricamente válido.
 */
export function generateFurniture(type: string, params: FurnitureParams, opts: GenerateOptions = {}): FurnitureModel {
  const spec = TEMPLATES[type];
  if (!spec) throw new FurnitureValidationError([{ severity: 'error', code: 'type', message: `Tipo de mueble desconocido: ${type}` }]);

  // Las medidas fijas de la plantilla (escritorio, rack) se imponen.
  const p: FurnitureParams = { ...params };
  for (const k of ['width', 'height', 'depth'] as const) {
    if (spec.ranges[k].min === spec.ranges[k].max) p[k] = spec.ranges[k].min;
  }
  const paramIssues = validateParams(spec, p);
  if (paramIssues.some((i) => i.severity === 'error')) throw new FurnitureValidationError(paramIssues);

  const cfg = withConfig(opts.config);
  const hinges = { ...cfg.hinges, ...(p.hinges ?? {}) };
  if (!cfg.hingeAngles.includes(hinges.openingAngle)) {
    throw new FurnitureValidationError([{ severity: 'error', code: 'hinge-angle', message: `Ángulo de bisagra ${hinges.openingAngle}° no disponible (${cfg.hingeAngles.join(', ')}).` }]);
  }
  if (hinges.mounting !== 'overlay' && hinges.mounting !== 'inset') {
    throw new FurnitureValidationError([{ severity: 'error', code: 'hinge-mounting', message: `Montaje de bisagra inválido: ${hinges.mounting}.` }]);
  }
  const b = new Builder(p.thickness, cfg, hinges);
  try {
    spec.build(p, b);
  } catch (e) {
    throw new FurnitureValidationError([{ severity: 'error', code: 'build', message: (e as Error).message }]);
  }
  const model: FurnitureModel = {
    parts: b.parts,
    hardware: b.hardware,
    summary: spec.summary,
    hasDoors: b.parts.some((q) => q.type.startsWith('door')),
    hasDrawers: b.parts.some((q) => q.type === 'drawer' && !!q.groupId),
    warnings: b.warnings,
  };
  if (opts.checkGeometry ?? true) {
    const geo = validateGeometry(model, p, cfg);
    if (geo.some((i) => i.severity === 'error')) throw new FurnitureValidationError(geo);
  }
  return model;
}

import type { BuildConfig } from './config';
import type { FurnitureModel, FurnitureParams, FurniturePart, TemplateSpec, ValidationIssue } from './types';

/** Valida medidas contra los rangos de la plantilla. */
export function validateParams(spec: TemplateSpec, p: FurnitureParams): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const check = (key: 'width' | 'height' | 'depth', label: string) => {
    const v = p[key];
    const { min, max } = spec.ranges[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      issues.push({ severity: 'error', code: `invalid-${key}`, message: `${label}: valor inválido.` });
    } else if (min !== max && (v < min || v > max)) {
      issues.push({ severity: 'error', code: `range-${key}`, message: `${label} debe estar entre ${min} y ${max} mm (recibido ${v}).` });
    }
  };
  check('width', 'Ancho');
  check('height', 'Alto');
  check('depth', 'Profundidad');
  if (!spec.thicknesses.includes(p.thickness)) {
    issues.push({ severity: 'error', code: 'thickness', message: `Espesor ${p.thickness} mm no admitido (${spec.thicknesses.join(', ')}).` });
  }
  return issues;
}

type Bounds = [number, number, number, number, number, number];
const bounds = (q: FurniturePart): Bounds =>
  [q.x - q.width / 2, q.x + q.width / 2, q.y - q.height / 2, q.y + q.height / 2, q.z - q.depth / 2, q.z + q.depth / 2];
const overlap = (a1: number, a2: number, b1: number, b2: number) => Math.min(a2, b2) - Math.max(a1, b1);

/**
 * Chequeos geométricos del modelo armado:
 * - piezas de tablero que se superponen,
 * - medidas de corte que no coinciden con la caja 3D o no son positivas,
 * - veta incoherente con cutLargo,
 * - holgura de correderas distinta de la configurada.
 */
export function validateGeometry(model: FurnitureModel, p: FurnitureParams, cfg: BuildConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const panels = model.parts.filter((q) => !q.isHardware);
  const tol = 0.5;

  for (const q of panels) {
    if (!(q.cutLargo > 0 && q.cutAncho > 0 && q.cutEspesor > 0)) {
      issues.push({ severity: 'error', code: 'cut-nonpositive', message: `${q.name}: medida de corte no positiva.`, partIds: [q.id] });
    }
    const d3 = [q.width, q.height, q.depth].sort((a, b) => a - b);
    const dc = [q.cutAncho, q.cutLargo].sort((a, b) => a - b);
    if (Math.abs(d3[1] - dc[0]) > 1 || Math.abs(d3[2] - dc[1]) > 1 || Math.abs(d3[0] - q.cutEspesor) > 0.5) {
      issues.push({ severity: 'error', code: 'cut-vs-3d', message: `${q.name}: el corte ${q.cutLargo}×${q.cutAncho} no coincide con el 3D.`, partIds: [q.id] });
    }
    if (q.grainDirection === 'vertical' && Math.abs(q.cutLargo - Math.round(q.height)) > 1) {
      issues.push({ severity: 'error', code: 'grain', message: `${q.name}: veta vertical pero el largo no es el alto.`, partIds: [q.id] });
    }
    if (q.grainDirection === 'horizontal' && Math.abs(q.cutLargo - Math.round(q.height)) <= 1 && Math.abs(q.cutLargo - Math.round(q.width)) > 1 && Math.abs(q.cutLargo - Math.round(q.depth)) > 1) {
      issues.push({ severity: 'error', code: 'grain', message: `${q.name}: veta horizontal pero el largo es el alto.`, partIds: [q.id] });
    }
    const b = bounds(q);
    if (b[0] < -tol || b[1] > p.width + tol || b[2] < -tol || b[3] > model.parts.reduce((m, x) => Math.max(m, x.y + x.height / 2), 0) + tol) {
      issues.push({ severity: 'error', code: 'outside', message: `${q.name}: fuera del mueble.`, partIds: [q.id] });
    }
  }

  for (let i = 0; i < panels.length; i++) {
    for (let j = i + 1; j < panels.length; j++) {
      const a = bounds(panels[i]), c = bounds(panels[j]);
      const ox = overlap(a[0], a[1], c[0], c[1]);
      const oy = overlap(a[2], a[3], c[2], c[3]);
      const oz = overlap(a[4], a[5], c[4], c[5]);
      if (ox > tol && oy > tol && oz > tol) {
        issues.push({
          severity: 'error', code: 'collision',
          message: `${panels[i].name} y ${panels[j].name} se superponen (${ox.toFixed(1)}×${oy.toFixed(1)}×${oz.toFixed(1)} mm).`,
          partIds: [panels[i].id, panels[j].id],
        });
      }
    }
  }

  // Holgura de correderas: caja contra las caras del hueco a su altura.
  const statics = panels.filter((q) => q.type === 'static');
  const groups = new Set(panels.filter((q) => q.type === 'drawer' && q.groupId).map((q) => q.groupId as string));
  for (const g of groups) {
    const sl = panels.find((q) => q.id === `${g}-box-SL`);
    const sr = panels.find((q) => q.id === `${g}-box-SR`);
    if (!sl || !sr) continue;
    const bl = bounds(sl), br = bounds(sr);
    const facing = statics.filter((q) => {
      const s = bounds(q);
      return overlap(s[2], s[3], bl[2], bl[3]) > tol && overlap(s[4], s[5], bl[4], bl[5]) > tol && q.width < q.height && q.width < q.depth;
    });
    const leftFace = Math.max(...facing.map((q) => bounds(q)[1]).filter((x) => x <= bl[0] + tol));
    const rightFace = Math.min(...facing.map((q) => bounds(q)[0]).filter((x) => x >= br[1] - tol));
    const cl = bl[0] - leftFace, cr = rightFace - br[1];
    if (Math.abs(cl - cfg.slideClearance) > tol || Math.abs(cr - cfg.slideClearance) > tol) {
      issues.push({
        severity: 'error', code: 'slide-clearance',
        message: `Cajón ${g}: holgura de corredera ${cl.toFixed(1)} / ${cr.toFixed(1)} mm (debe ser ${cfg.slideClearance}).`,
        partIds: [sl.id, sr.id],
      });
    }
  }

  // Cada cajón debe llevar exactamente un par de correderas en la lista de compra.
  const slidePairs = model.parts.filter((q) => q.hardware?.sku.startsWith('slide-')).reduce((s, q) => s + (q.hardware?.qty ?? 0), 0);
  if (slidePairs !== groups.size) {
    issues.push({ severity: 'error', code: 'slide-count', message: `Correderas: ${slidePairs} pares para ${groups.size} cajones.` });
  }
  return issues;
}

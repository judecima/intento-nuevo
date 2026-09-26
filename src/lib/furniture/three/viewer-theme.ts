import type { FurniturePart } from '../core/types';

export type FurnitureViewerColor =
  | 'blanco'
  | 'gris_claro'
  | 'grafito'
  | 'roble_claro'
  | 'nogal'
  | 'negro';

export const FURNITURE_VIEWER_COLORS: Record<FurnitureViewerColor, string> = {
  blanco: '#FFFFFF',
  gris_claro: '#D9D9D9',
  grafito: '#3A3A3A',
  roble_claro: '#D2B48C',
  nogal: '#7A5230',
  negro: '#1F1F1F',
};

export type FurniturePartAppearance =
  | 'base'
  | 'interior'
  | 'thin-mdf'
  | 'hinge'
  | 'rail'
  | 'piston-body'
  | 'piston-rod';

/**
 * Clasificación visual derivada del mismo FurniturePart que alimenta despiece
 * y optimización. No se reconstruye geometría ni material a partir del nombre.
 */
export function resolveFurniturePartAppearance(part: FurniturePart): FurniturePartAppearance {
  if (part.isHardware) {
    const name = part.name.toLowerCase();
    if (name.includes('riel') || name.includes('corredera')) return 'rail';
    if (name.includes('pist')) return part.type === 'piston-rod' ? 'piston-rod' : 'piston-body';
    return 'hinge';
  }

  if (part.material === 'back' || part.material === 'drawerBottom') return 'thin-mdf';
  if (part.material === 'drawer') return 'interior';

  const name = part.name.toLowerCase();
  if (
    name.includes('estante') ||
    name.includes('refuerzo') ||
    name.includes('divisor') ||
    name.includes('amarre')
  ) {
    return 'interior';
  }

  return 'base';
}

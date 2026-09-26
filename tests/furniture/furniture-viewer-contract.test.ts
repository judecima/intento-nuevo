import { describe, expect, it } from 'vitest';

import { generateFurniture } from '@/lib/furniture';
import {
  FURNITURE_VIEWER_COLORS,
  resolveFurniturePartAppearance,
} from '@/lib/furniture/three/viewer-theme';

function model() {
  return generateFurniture('cabinet_base_120_2p3c', {
    width: 1200,
    height: 870,
    depth: 600,
    thickness: 18,
    hasBack: true,
    hasShelf: true,
    hinges: { mounting: 'overlay', openingAngle: 110, softClose: true },
  });
}

describe('furniture 3D viewer contract', () => {
  it('renders from the same FurnitureModel geometry used by manufacturing', () => {
    const furniture = model();
    const panels = furniture.parts.filter((part) => !part.isHardware);

    expect(panels.length).toBeGreaterThan(0);
    for (const part of panels) {
      expect(part.width).toBeGreaterThan(0);
      expect(part.height).toBeGreaterThan(0);
      expect(part.depth).toBeGreaterThan(0);
      expect(part.cutLargo).toBeGreaterThan(0);
      expect(part.cutAncho).toBeGreaterThan(0);
      expect(part.cutEspesor).toBeGreaterThan(0);
    }
  });

  it('identifies thin MDF by material role rather than by display name', () => {
    const furniture = model();
    const thin = furniture.parts.filter(
      (part) => part.material === 'back' || part.material === 'drawerBottom',
    );

    expect(thin.length).toBeGreaterThan(0);
    expect(thin.every((part) => part.cutEspesor === 5)).toBe(true);
    expect(thin.every((part) => resolveFurniturePartAppearance(part) === 'thin-mdf')).toBe(true);
  });

  it('keeps drawer boxes visually distinguishable as interior material', () => {
    const drawer = model().parts.find((part) => part.material === 'drawer');
    expect(drawer).toBeDefined();
    expect(resolveFurniturePartAppearance(drawer!)).toBe('interior');
  });

  it('publishes the initial six viewer finishes', () => {
    expect(Object.keys(FURNITURE_VIEWER_COLORS)).toEqual([
      'blanco',
      'gris_claro',
      'grafito',
      'roble_claro',
      'nogal',
      'negro',
    ]);
  });
});

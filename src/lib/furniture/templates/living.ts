import type { Builder } from '../core/builder';
import { addBack, carcassSandwich, drawerStack, outer, shared, SKU, verticalDivider, type Carcass } from '../core/assemblies';
import type { FurnitureParams } from '../core/types';
import { legs } from './kitchen';

export const DESK_HEIGHT = 750;
export const DESK_DRAWER_MODULE = 400;
export const RACK_HEIGHT = 500;

/** Escritorio: tapa, pata lateral izquierda y cajonera de 3 cajones a la derecha. */
export function desk(p: FurnitureParams, b: Builder) {
  const T = b.T, g = b.cfg.gaps;
  const W = p.width, H = DESK_HEIGHT, D = p.depth;
  const zf = D / 2, zb = -D / 2;
  const cab = DESK_DRAWER_MODULE;
  const xd = W - cab; // cara izquierda del divisor de la cajonera
  b.panel({ id: 'top', name: 'Tapa Escritorio', box: { x0: 0, x1: W, y0: H - T, y1: H, z0: zb, z1: zf }, grain: 'x', material: 'body', edges: ['front', 'back', 'left', 'right'] });
  b.panel({ id: 'leg-L', name: 'Lateral Izquierdo', box: { x0: 0, x1: T, y0: 0, y1: H - T, z0: zb, z1: zf }, grain: 'y', material: 'body', edges: ['front', 'bottom'] });
  b.panel({ id: 'cab-base', name: 'Base Cajonera', box: { x0: xd, x1: W, y0: 0, y1: T, z0: zb, z1: zf }, grain: 'x', material: 'body', edges: ['front'] });
  b.panel({ id: 'leg-R', name: 'Lateral Derecho', box: { x0: W - T, x1: W, y0: T, y1: H - T, z0: zb, z1: zf }, grain: 'y', material: 'body', edges: ['front'] });
  b.panel({ id: 'div-L', name: 'Divisor Módulo', box: { x0: xd, x1: xd + T, y0: T, y1: H - T, z0: zb, z1: zf }, grain: 'y', material: 'body', edges: ['front'] });
  // Respaldo (faldón) entre la pata y la cajonera, retirado 50 mm de la espalda.
  const rh = Math.round(H * 0.4);
  b.panel({ id: 'mod-back', name: 'Respaldo Estructural', box: { x0: T, x1: xd, y0: H - T - rh, y1: H - T, z0: zb + 50, z1: zb + 50 + T }, grain: 'x', material: 'body', edges: ['bottom'] });
  b.addHardware(SKU.confirmat[0], SKU.confirmat[1], b.cfg.jointScrews(D) * 6 + 2 * 2);

  const c: Carcass = { W, H, D, zf, zb, interior: { x0: xd + T, x1: W - T, y0: T, y1: H - T } };
  drawerStack(b, c, {
    idPrefix: 'desk-dr', frontFrom: shared(xd + T / 2), frontTo: outer(W),
    bayX0: xd + T, bayX1: W - T,
    y0: g.outer, y1: H - T - g.between,
    interiorY0: T, interiorY1: H - T, count: 3,
  });
  if (W - cab > 1200) b.warn('Tapa de escritorio con más de 1200 mm sin apoyo: conviene un refuerzo bajo la tapa.');
}

/** Rack de TV con dos cajones grandes lado a lado. */
export function tvRack(p: FurnitureParams, b: Builder) {
  const T = b.T, g = b.cfg.gaps;
  const c = carcassSandwich(b, { ...p, height: RACK_HEIGHT }, 'panel');
  if (p.hasBack) addBack(b, c);
  const xm = c.W / 2;
  verticalDivider(b, c, 'div', 'Divisor Central', xm, c.interior.y0, c.interior.y1);
  const common = { y0: g.outer, y1: c.H - g.outer, interiorY0: c.interior.y0, interiorY1: c.interior.y1, count: 1 };
  drawerStack(b, c, { idPrefix: 'rack-dr-L', frontFrom: outer(0), frontTo: shared(xm), bayX0: c.interior.x0, bayX1: xm - T / 2, ...common });
  drawerStack(b, c, { idPrefix: 'rack-dr-R', frontFrom: shared(xm), frontTo: outer(c.W), bayX0: xm + T / 2, bayX1: c.interior.x1, ...common });
  legs(b, c.W);
}

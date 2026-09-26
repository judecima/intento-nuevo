import type { Builder } from '../core/builder';
import {
  addBack, carcassSandwich, carcassThrough, doors, drawerStack, horizontalDivider, open, outer, SKU,
 } from '../core/assemblies';
import type { FurnitureParams } from '../core/types';
import { hangers, legs } from './kitchen';

export const CLOSET_DRAWER_ZONE = 500;
export const CLOSET_ROD_Y = 1700;

export function closet(p: FurnitureParams, b: Builder) {
  const T = b.T, g = b.cfg.gaps;
  const c = carcassSandwich(b, p, 'panel');
  addBack(b, c); // el placard siempre lleva fondo
  const yd = CLOSET_DRAWER_ZONE;
  horizontalDivider(b, c, 'div-H', 'Divisor Horizontal', yd, c.interior.x0, c.interior.x1);

  doors(b, c, [
    { id: 'door-L', name: 'Puerta Izquierda', from: outer(0), to: open(c.W / 2), hinge: 'left', hingeX: T },
    { id: 'door-R', name: 'Puerta Derecha', from: open(c.W / 2), to: outer(c.W), hinge: 'right', hingeX: c.W - T },
  ], yd + g.between / 2, c.H - g.outer, [yd + T / 2, c.interior.y1]);

  drawerStack(b, c, {
    idPrefix: 'cl-dr', frontFrom: outer(0), frontTo: outer(c.W),
    bayX0: c.interior.x0, bayX1: c.interior.x1,
    y0: g.outer, y1: yd - g.between / 2,
    interiorY0: c.interior.y0, interiorY1: yd - T / 2, count: 2,
  });

  const rodY = Math.min(CLOSET_ROD_Y, c.H - T - 60);
  if (rodY - yd > 900) {
    const len = c.interior.x1 - c.interior.x0;
    b.hardwarePart(
      { id: 'bar', name: 'Barral', width: len, height: 25, depth: 25, x: c.W / 2, y: rodY, z: 0, type: 'hardware' },
      { sku: SKU.rod[0], name: SKU.rod[1], qty: Math.round(len) / 1000, unit: 'm' },
    );
    b.addHardware(SKU.rodSupport[0], SKU.rodSupport[1], 2);
  }
  legs(b, c.W);
}

export function bookshelf(p: FurnitureParams, b: Builder) {
  const T = b.T, c = carcassSandwich(b, p, 'panel');
  if (p.hasBack) addBack(b, c);
  const innerH = c.interior.y1 - c.interior.y0;
  // Estantes fijos cada ~350 mm (4 estantes en 1800 mm).
  const n = Math.max(1, Math.round(innerH / 350) - 1);
  const step = (innerH - n * T) / (n + 1);
  for (let i = 1; i <= n; i++) {
    const yc = Math.round(c.interior.y0 + i * step +
(i - 1) * T + T ? 0 : 0);
    const yc = Math.round(c.interior.y0 + i * step + (i - 1) * T + T / 2);
    horizontalDivider(b, c, `estante-${i}`, `Estante ${i}`, yc, c.interior.x0, c.interior.x1);
  }
  if (c.interior.x1 - c.interior.x0 > b.cfg.shelfSpanWarning) {
    b.warn(`Estantes de ${Math.round(c.interior.x1 - c.interior.x0)} mm de luz: pueden flechar, conviene un divisor vertical.`);
  }
}

/** Alacena con puerta rebatible hacia arriba, bisagras superiores y pistón a gas. */
export function wallFlip(p: FurnitureParams, b: Builder) {
  const T = b.T, g = b.cfg.gaps.outer;
  const c = carcassThrough(b, p);
  if (p.hasBack) addBack(b, c);
  if (b.inset) b.warn('La alacena rebatible usa puerta superpuesta: el montaje embutido no aplica.');
  const x0 = g, x1 = c.W - g, y0 = g, y1 = c.H - g;
  const doorW = x1 - x0, doorH = y1 - y0;
  const hingeCount = doorW <= 600 ? 2 : doorW <= 1000 ? 3 : 4;
  const door = b.panel({
    id: 'door-flip', name: 'Puerta Abatible', box: { x0, x1, y0, y1, z0: c.zf, z1: c.zf + T },
    grain: 'x', material: 'front', edges: 'all', type: 'door-flip',
    pivot: { x: c.W / 2, y: c.H, z: c.zf },
  });
  door.hingeCount = hingeCount;
  for (let i = 0; i < hingeCount; i++) {
    const hx = x0 + 100 + (i * (doorW - 200)) / (hingeCount - 1);
    b.hardwarePart(
      { id: `hinge-flip-${i}`, groupId: 'door-flip', name: 'Bisagra Interna 90°', width: 35, height: 35, depth: 12, x: hx, y: c.H - 10, z: c.zf - 6, type: 'hardware' },
      { sku: 'hinge-flip', name: 'Bisagra para puerta rebatible', qty: 1, unit: 'u' },
    );
  }
  const sides: ('left' | 'right')[] = c.W <= 800 ? ['right'] : ['left', 'right'];
  for (const side of sides) {
    const sx = side === 'left' ? T + 5 : c.W - T - 5;
    const anchor = { x: sx, y: 60, z: c.zf - 20 };
    const piston = b.hardwarePart(
      { id: `piston-${side}`, name: 'Pistón a Gas', width: 15, height: 15, depth: 220, x: anchor.x, y: anchor.y, z: anchor.z, type: 'piston-body' },
      { sku: 'gas-piston', name: 'Pistón a gas para puerta rebatible', qty: 1, unit: 'u' },
    );
    piston.pistonConfig = {
      side, anchorMueble: anchor,
      anchorPuertaLocal: { x: side === 'left' ? -doorW / 2 + 40 : doorW / 2 - 40, y: doorH / 2 - 30, z: -T / 2 },
      doorId: 'door-flip', lengthClosed: 220, lengthOpen: 340,
    };
  }
  if (doorW > 1000) b.warn('Puerta rebatible de más de 1000 mm: verificar la fuerza del pistón con el proveedor.');
  b.addHardware(SKU.handle[0], SKU.handle[1], 1);
  hangers(b);
}

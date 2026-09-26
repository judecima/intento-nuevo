import type { Builder } from '../core/builder';
import {
  addBack, carcassSandwich, doors, drawerStack, open, outer, shelves, SKU, type Carcass,
} from '../core/assemblies';
import type { FurnitureParams } from '../core/types';

export function legs(b: Builder, W: number) {
  b.addHardware(SKU.leg[0], SKU.leg[1], W > 1000 ? 6 : 4);
}
export function hangers(b: Builder) {
  b.addHardware(SKU.wallHanger[0], SKU.wallHanger[1], 2);
}

/** Dos puertas iguales que cubren todo el ancho, bisagras en los laterales. */
export function doorPair(b: Builder, c: Carcass, y0: number, y1: number, insetY: [number, number], prefix = 'door') {
  const T = b.T;
  doors(b, c, [
    { id: `${prefix}-L`, name: 'Puerta Izquierda', from: outer(0), to: open(c.W / 2), hinge: 'left', hingeX: T },
    { id: `${prefix}-R`, name: 'Puerta Derecha', from: open(c.W / 2), to: outer(c.W), hinge: 'right', hingeX: c.W - T },
  ], y0, y1, insetY);
}

export function kitchenBase(p: FurnitureParams, b: Builder) {
  const c = carcassSandwich(b, p, 'rails');
  if (p.hasBack) addBack(b, c);
  if (p.hasShelf) shelves(b, c, 'shelf', 'Estante Interno', c.interior.x0, c.interior.x1, [Math.round(c.H / 2)]);
  doorPair(b, c, 0, c.H - b.cfg.gaps.underCountertop, [c.interior.y0, c.interior.y1]);
  legs(b, c.W);
}

export function kitchenWall(p: FurnitureParams, b: Builder) {
  const c = carcassSandwich(b, p, 'panel');
  if (p.hasBack) addBack(b, c);
  if (p.hasShelf) shelves(b, c, 'shelf', 'Estante Interno', c.interior.x0, c.interior.x1, [Math.round(c.H / 2)]);
  const g = b.cfg.gaps.outer;
  doorPair(b, c, g, c.H - g, [c.interior.y0, c.interior.y1]);
  hangers(b);
}

export function kitchenDrawers(p: FurnitureParams, b: Builder) {
  const c = carcassSandwich(b, p, 'rails');
  if (p.hasBack) addBack(b, c);
  drawerStack(b, c, {
    idPrefix: 'dr', frontFrom: outer(0), frontTo: outer(c.W),
    bayX0: c.interior.x0, bayX1: c.interior.x1,
    y0: 0, y1: c.H - b.cfg.gaps.underCountertop,
    interiorY0: c.interior.y0, interiorY1: c.interior.y1, count: 3,
  });
  legs(b, c.W);
}

/**
 * Porta anafe. El anafe ocupa el espacio bajo la mesada, así que el frente superior
 * es FIJO (tapa falsa): un cajón ahí chocaría con el cuerpo del anafe y la conexión de gas.
 */
export const COOKTOP_FRONT_H = 180;
export function kitchenCooktop(p: FurnitureParams, b: Builder) {
  const c = carcassSandwich(b, p, 'rails');
  if (p.hasBack) addBack(b, c);
  const g = b.cfg.gaps;
  const T = b.T;
  // Embutido: el frente fijo va entre laterales, bajo el amarre frontal.
  const fx0 = b.inset ? T + g.inset : g.outer;
  const fx1 = b.inset ? c.W - T - g.inset : c.W - g.outer;
  const fy1 = b.inset ? c.interior.y1 - g.inset : c.H - g.underCountertop;
  const fy0 = fy1 - COOKTOP_FRONT_H;
  const fz0 = b.inset ? c.zf - T : c.zf;
  b.panel({
    id: 'cooktop-front', name: 'Frente Fijo Anafe', box: { x0: fx0, x1: fx1, y0: fy0, y1: fy1, z0: fz0, z1: fz0 + T },
    grain: 'x', material: 'front', edges: 'all',
  });
  b.addHardware('front-clip', 'Escuadra para frente fijo', 2);
  const doorTop = fy0 - (b.inset ? g.inset : g.between);
  if (p.hasShelf) shelves(b, c, 'shelf', 'Estante Interno', c.interior.x0, c.interior.x1, [Math.round(doorTop / 2)]);
  // En embutido, la cara superior del hueco de puertas es el borde del frente fijo (doors() resta la luz).
  doorPair(b, c, 0, doorTop, [c.interior.y0, fy0]);
  legs(b, c.W);
}

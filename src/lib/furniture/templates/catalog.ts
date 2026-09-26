import type { Builder } from '../core/builder';
import {
  addBack, carcassSandwich, doors, drawerStack, horizontalDivider, open, outer, shared, shelves, verticalDivider,
  type Carcass, type DoorSpec,
} from '../core/assemblies';
import type { FurnitureParams } from '../core/types';
import { hangers, legs } from './kitchen';

export const CATALOG_DRAWER_MODULE = 400;
export const MICROWAVE_LOWER = 750;
export const MICROWAVE_NICHE = 450;

type Kind = 'base' | 'wall' | 'tower';

function body(b: Builder, p: FurnitureParams, kind: Kind): Carcass {
  const c = carcassSandwich(b, p, kind === 'base' ? 'rails' : 'panel');
  if (p.hasBack || kind !== 'base') addBack(b, c);
  if (kind === 'wall') hangers(b); else legs(b, c.W);
  return c;
}

/** Alto de puertas según el tipo de cuerpo, más las caras interiores para el modo embutido. */
function doorY(b: Builder, c: Carcass, kind: Kind): [number, number, [number, number]] {
  const g = b.cfg.gaps;
  const inset: [number, number] = [c.interior.y0, c.interior.y1];
  return kind === 'base' ? [0, c.H - g.underCountertop, inset] : [g.outer, c.H - g.outer, inset];
}

/** Una hoja que cubre [from, to]. */
const leaf = (id: string, name: string, from: DoorSpec['from'], to: DoorSpec['to'], hinge: 'left' | 'right', hingeX: number): DoorSpec =>
  ({ id, name, from, to, hinge, hingeX });

/**
 * Módulo de 3 puertas: divisor a 2/3 del ancho útil [x0, x1].
 * Tramo A (2 puertas, sin divisor entre ellas) y tramo B (1 puerta).
 * Las bisagras siempre apoyan sobre un lateral o un divisor.
 */
function threeDoors(b: Builder, c: Carcass, p: FurnitureParams, kind: Kind, x0: number, x1: number, rightBoundary: DoorSpec['to'], rightHingeX: number) {
  const T = b.T;
  const xd = Math.round(x0 + ((x1 - x0) * 2) / 3);
  verticalDivider(b, c, 'div', 'Divisor Estructural', xd, c.interior.y0, c.interior.y1);
  const [y0, y1, iy] = doorY(b, c, kind);
  doors(b, c, [
    leaf('d-1', 'Puerta 1', outer(0), open(xd / 2), 'left', T),
    leaf('d-2', 'Puerta 2', open(xd / 2), shared(xd), 'right', xd - T / 2),
    leaf('d-3', 'Puerta 3', shared(xd), rightBoundary, 'right', rightHingeX),
  ], y0, y1, iy);
  const ys = [Math.round(c.H / 2)];
  if (p.hasShelf) shelves(b, c, 'sh-A', 'Estante Grande', c.interior.x0, xd - T / 2, ys);
  if (p.hasShelf2) shelves(b, c, 'sh-B', 'Estante Pequeño', xd + T / 2, x1, ys);
}

export function catalog(type: string) {
  return (p: FurnitureParams, b: Builder) => {
    const T = b.T;
    switch (type) {
      case 'cabinet_base_120_2p3c':
      case 'cabinet_base_140_3p3c': {
        const c = body(b, p, 'base');
        const xd = c.W - CATALOG_DRAWER_MODULE; // centro del divisor de la cajonera
        verticalDivider(b, c, 'div-dr', 'Divisor Cajonera', xd, c.interior.y0, c.interior.y1);
        drawerStack(b, c, {
          idPrefix: 'dr', frontFrom: shared(xd), frontTo: outer(c.W),
          bayX0: xd + T / 2, bayX1: c.interior.x1,
          y0: 0, y1: c.H - b.cfg.gaps.underCountertop,
          interiorY0: c.interior.y0, interiorY1: c.interior.y1, count: 3,
        });
        if (type === 'cabinet_base_140_3p3c') {
          threeDoors(b, c, p, 'base', c.interior.x0, xd - T / 2, shared(xd), xd - T / 2);
        } else {
          const [y0, y1, iy] = doorY(b, c, 'base');
          doors(b, c, [
            leaf('d-1', 'Puerta Izquierda', outer(0), open(xd / 2), 'left', T),
            leaf('d-2', 'Puerta Derecha', open(xd / 2), shared(xd), 'right', xd - T / 2),
          ], y0, y1, iy);
          if (p.hasShelf) shelves(b, c, 'sh', 'Estante Interno', c.interior.x0, xd - T / 2, [Math.round(c.H / 2)]);
        }
        return;
      }
      case 'cabinet_wall_120_3p':
      case 'cabinet_wall_140_3p':
      case 'cabinet_wall_3p':
      case 'cabinet_base_3p': {
        const kind: Kind = type.includes('wall') ? 'wall' : 'base';
        const c = body(b, p, kind);
        threeDoors(b, c, p, kind, c.interior.x0, c.interior.x1, outer(c.W), c.W - T);
        return;
      }
      case 'cabinet_wall_60_1p':
      case 'cabinet_base_single_60_1p':
      case 'cabinet_hood_60': {
        const kind: Kind = type.includes('base') ? 'base' : 'wall';
        const c = body(b, p, kind);
        const [y0, y1, iy] = doorY(b, c, kind);
        doors(b, c, [leaf('door', 'Puerta', outer(0), outer(c.W), 'left', T)], y0, y1, iy);
        if (p.hasShelf && type !== 'cabinet_hood_60') shelves(b, c, 'sh', 'Estante Interno', c.interior.x0, c.interior.x1, [Math.round(c.H / 2)]);
        if (type === 'cabinet_hood_60') b.warn('Módulo para campana: calar la base según el ducto de la campana elegida.');
        return;
      }
      case 'cabinet_base_double_80_2p': {
        const c = body(b, p, 'base');
        const [y0, y1, iy] = doorY(b, c, 'base');
        doors(b, c, [
          leaf('door-L', 'Puerta Izquierda', outer(0), open(c.W / 2), 'left', T),
          leaf('door-R', 'Puerta Derecha', open(c.W / 2), outer(c.W), 'right', c.W - T),
        ], y0, y1, iy);
        if (p.hasShelf) shelves(b, c, 'sh', 'Estante Interno', c.interior.x0, c.interior.x1, [Math.round(c.H / 2)]);
        return;
      }
      case 'cabinet_pantry_60_2p': {
        const c = body(b, p, 'tower');
        const [y0, y1, iy] = doorY(b, c, 'tower');
        // Hoja única de alto completo (diseño original del catálogo).
        doors(b, c, [leaf('door-main', 'Puerta Despensero Única', outer(0), outer(c.W), 'right', c.W - T)], y0, y1, iy);
        const ys = [1, 2, 3, 4].map((i) => Math.round((c.H / 5) * i));
        shelves(b, c, 'sh', 'Estante Despensero', c.interior.x0, c.interior.x1, ys);
        return;
      }
      case 'cabinet_microwave_60': {
        const c = body(b, p, 'tower');
        const g = b.cfg.gaps;
        const yLow = MICROWAVE_LOWER, yHigh = MICROWAVE_LOWER + MICROWAVE_NICHE;
        horizontalDivider(b, c, 'div-niche-B', 'Base Nicho Horno', yLow, c.interior.x0, c.interior.x1);
        horizontalDivider(b, c, 'div-niche-T', 'Techo Nicho Horno', yHigh, c.interior.x0, c.interior.x1);
        doors(b, c, [leaf('d-inf', 'Puerta Inferior', outer(0), outer(c.W), 'right', c.W - T)], g.outer, yLow - T / 2 - g.between / 2, [c.interior.y0, yLow - T / 2]);
        doors(b, c, [leaf('d-sup', 'Puerta Superior', outer(0), outer(c.W), 'right', c.W - T)], yHigh + T / 2 + g.between / 2, c.H - g.outer, [yHigh + T / 2, c.interior.y1]);
        shelves(b, c, 'sh-inf', 'Estante Inferior', c.interior.x0, c.interior.x1, [Math.round((c.interior.y0 + yLow - T / 2) / 2)]);
        return;
      }
      default:
        throw new Error(`Tipo de catálogo desconocido: ${type}`);
    }
  };
}

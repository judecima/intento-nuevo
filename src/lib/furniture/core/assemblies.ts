import { box, type Builder } from './builder';
import type { FurnitureParams, HingeCrank } from './types';

/** Geometría de un cuerpo ya armado. */
export interface Carcass {
  W: number; H: number; D: number;
  /** z del frente y de la espalda del cuerpo. */
  zf: number; zb: number;
  /** Hueco interior (caras internas de laterales, base y techo). */
  interior: { x0: number; x1: number; y0: number; y1: number };
  /** Cuerpo con amarres: el amarre trasero ocupa la espalda en la parte superior. */
  rails?: boolean;
}

export const SKU = {
  confirmat: ['confirmat-7x50', 'Tornillo confirmat 7×50'],
  backScrew: ['screw-3.5x16', 'Tornillo 3,5×16 para fondo'],
  drawerScrew: ['screw-4x40', 'Tornillo 4×40 para caja de cajón'],
  shelfPin: ['shelf-pin-5', 'Soporte de estante 5 mm'],
  handle: ['handle', 'Tirador'],
  leg: ['leg-adjustable', 'Pata regulable para bajo mesada'],
  wallHanger: ['wall-hanger', 'Soporte colgante regulable'],
  hinge: ['hinge-35', 'Bisagra cazoleta 35 mm'],
  rod: ['hanger-rod', 'Barral ovalado'],
  rodSupport: ['rod-support', 'Soporte de barral'],
} as const;

const joint = (b: Builder, depth: number, joints: number) =>
  b.addHardware(SKU.confirmat[0], SKU.confirmat[1], b.cfg.jointScrews(depth) * joints);

/**
 * Cuerpo "sándwich": base (y tapa, si hay) de ancho completo; laterales entre ellas.
 * top = 'rails' reemplaza la tapa por amarres (bajo mesada que lleva mesada encima).
 */
export function carcassSandwich(b: Builder, p: FurnitureParams, top: 'panel' | 'rails'): Carcass {
  const { width: W, height: H, depth: D } = p;
  const T = b.T;
  const zf = D / 2, zb = -D / 2;
  b.panel({ id: 'base', name: 'Base Inferior', box: box(0, W, 0, T, zb, zf), grain: 'x', material: 'body', edges: ['front'] });
  const latTop = top === 'panel' ? H - T : H;
  b.panel({ id: 'lat-L', name: 'Lateral Izquierdo', box: box(0, T, T, latTop, zb, zf), grain: 'y', material: 'body', edges: ['front'] });
  b.panel({ id: 'lat-R', name: 'Lateral Derecho', box: box(W - T, W, T, latTop, zb, zf), grain: 'y', material: 'body', edges: ['front'] });
  joint(b, D, 2);
  if (top === 'panel') {
    b.panel({ id: 'tapa', name: 'Tapa Superior', box: box(0, W, H - T, H, zb, zf), grain: 'x', material: 'body', edges: ['front'] });
    joint(b, D, 2);
    return { W, H, D, zf, zb, interior: { x0: T, x1: W - T, y0: T, y1: H - T } };
  }
  const R = b.cfg.railHeight;
  b.panel({ id: 'amarre-F', name: 'Amarre Frontal', box: box(T, W - T, H - T, H, zf - R, zf), grain: 'x', material: 'body', edges: ['front'] });
  b.panel({ id: 'amarre-B', name: 'Amarre Trasero', box: box(T, W - T, H - R, H, zb, zb + T), grain: 'x', material: 'body' });
  joint(b, R, 4);
  return { W, H, D, zf, zb, interior: { x0: T, x1: W - T, y0: T, y1: H - T }, rails: true };
}

/** Cuerpo con laterales pasantes (de piso a techo); base y tapa entre laterales. */
export function carcassThrough(b: Builder, p: FurnitureParams): Carcass {
  const { width: W, height: H, depth: D } = p;
  const T = b.T;
  const zf = D / 2, zb = -D / 2;
  b.panel({ id: 'lat-L', name: 'Lateral Izquierdo', box: box(0, T, 0, H, zb, zf), grain: 'y', material: 'body', edges: ['front'] });
  b.panel({ id: 'lat-R', name: 'Lateral Derecho', box: box(W - T, W, 0, H, zb, zf), grain: 'y', material: 'body', edges: ['front'] });
  b.panel({ id: 'base', name: 'Base Inferior', box: box(T, W - T, 0, T, zb, zf), grain: 'x', material: 'body', edges: ['front'] });
  b.panel({ id: 'tapa', name: 'Tapa Superior', box: box(T, W - T, H - T, H, zb, zf), grain: 'x', material: 'body', edges: ['front'] });
  joint(b, D, 4);
  return { W, H, D, zf, zb, interior: { x0: T, x1: W - T, y0: T, y1: H - T } };
}

/** Fondo clavado por detrás del cuerpo, 1 mm retirado de cada borde. */
export function addBack(b: Builder, c: Carcass) {
  const t = b.cfg.backThickness;
  b.panel({ id: 'fondo', name: `Fondo ${t} mm`, box: box(1, c.W - 1, 1, c.H - 1, c.zb - t, c.zb), grain: 'free', material: 'back' });
  const perimeterM = (2 * (c.W - 2) + 2 * (c.H - 2)) / 1000;
  b.addHardware(SKU.backScrew[0], SKU.backScrew[1], Math.ceil(perimeterM * b.cfg.backScrewsPerMeter));
}

/**
 * Divisor vertical centrado en `xc`, entre y0 e y1.
 * En cuerpos con amarres, el divisor termina delante del amarre trasero.
 */
export function verticalDivider(b: Builder, c: Carcass, id: string, name: string, xc: number, y0: number, y1: number, depth?: number) {
  const T = b.T;
  depth = depth ?? (c.rails ? c.D - T : c.D);
  b.panel({ id, name, box: box(xc - T / 2, xc + T / 2, y0, y1, c.zf - depth, c.zf), grain: 'y', material: 'body', edges: ['front'] });
  joint(b, depth, 2);
}

/** Divisor horizontal fijo (estante estructural) centrado en `yc`. */
export function horizontalDivider(b: Builder, c: Carcass, id: string, name: string, yc: number, x0: number, x1: number) {
  const T = b.T;
  b.panel({ id, name, box: box(x0, x1, yc - T / 2, yc + T / 2, c.zb, c.zf), grain: 'x', material: 'body', edges: ['front'] });
  joint(b, c.D, 2);
}

/** Con puertas embutidas, el estante debe quedar detrás de la puerta. */
export const shelfSetback = (b: Builder) => (b.inset ? Math.max(b.cfg.shelfFrontSetback, b.T + 2) : b.cfg.shelfFrontSetback);

/** Estantes móviles dentro de un hueco [x0, x1] (caras interiores). */
export function shelves(b: Builder, c: Carcass, idPrefix: string, name: string, x0: number, x1: number, ys: number[]) {
  const T = b.T;
  const cl = b.cfg.shelfSideClearance;
  const span = x1 - x0;
  if (span > b.cfg.shelfSpanWarning && T <= 18) {
    b.warn(`Estante de ${Math.round(span)} mm de luz en ${T} mm: puede flechar, conviene un apoyo intermedio.`);
  }
  ys.forEach((yc, i) => {
    b.panel({
      id: ys.length === 1 ? idPrefix : `${idPrefix}-${i + 1}`,
      name: ys.length === 1 ? name : `${name} ${i + 1}`,
      box: box(x0 + cl, x1 - cl, yc - T / 2, yc + T / 2, c.zb, c.zf - shelfSetback(b)),
      grain: 'x', material: 'body', edges: ['front'],
    });
  });
  b.addHardware(SKU.shelfPin[0], SKU.shelfPin[1], 4 * ys.length);
}

/**
 * Límite entre puertas/frentes vecinos.
 * outer:  borde exterior del mueble, sobre un lateral.
 * shared: centro de un divisor que comparten dos hojas.
 * open:   punto de encuentro entre dos hojas sin divisor detrás.
 */
export interface Boundary { x: number; kind: 'outer' | 'shared' | 'open' }

export const outer = (x: number): Boundary => ({ x, kind: 'outer' });
export const shared = (x: number): Boundary => ({ x, kind: 'shared' });
export const open = (x: number): Boundary => ({ x, kind: 'open' });

/**
 * Tramo horizontal que ocupa una hoja entre dos límites.
 * Superpuesta: cubre el canto del lateral o medio divisor.
 * Embutida: va entre las caras interiores, con luz perimetral.
 * Se redondea hacia adentro: dos hojas nunca se superponen.
 */
function spanBetween(b: Builder, a: Boundary, c: Boundary): [number, number] {
  const T = b.T, g = b.cfg.gaps;
  const inward = (k: Boundary) => {
    if (!b.inset) return k.kind === 'outer' ? g.outer : g.between / 2;
    if (k.kind === 'outer') return T + g.inset;
    if (k.kind === 'shared') return T / 2 + g.inset;
    return g.inset / 2;
  };
  return [Math.ceil(a.x + inward(a)), Math.floor(c.x - inward(c))];
}

export interface DoorSpec {
  from: Boundary;
  to: Boundary;
  /** Lado donde van las bisagras y x del panel donde se atornillan. */
  hinge: 'left' | 'right';
  hingeX: number;
  name: string;
  id: string;
}

const CRANK_NAME: Record<HingeCrank, string> = { recta: 'Recta', semicodo: 'Semicodo', codo: 'Codo' };

/** Embutida → codo, divisor compartido → semicodo, exterior → recta. */
function hingeCrank(b: Builder, pivot: Boundary): HingeCrank {
  if (b.inset) return 'codo';
  return pivot.kind === 'shared' ? 'semicodo' : 'recta';
}

/**
 * Puertas de abrir. Calcula medidas según el montaje, bisagras (tipo, ángulo, cierre suave) y tiradores.
 * y0/y1: alto en modo superpuesto. insetY: caras interiores del hueco (obligatorio para modo embutido).
 */
export function doors(b: Builder, c: Carcass, specs: DoorSpec[], y0: number, y1: number, insetY?: [number, number]) {
  const T = b.T;
  const { openingAngle, softClose } = b.hinges;
  if (b.inset) {
    if (!insetY) throw new Error('Puertas embutidas sin caras interiores definidas.');
    y0 = insetY[0] + b.cfg.gaps.inset;
    y1 = inset[1] - b.cfg.gaps.inset;
  }
  const z0 = b.inset ? c.zf - T : c.zf;
  if (openingAngle === 165) b.warn('Apertura de 165°: dejar espacio libre junto a paredes y otros muebles.');
  for (const s of specs) {
    const [x0, x1] = spanBetween(b, s.from, s.to);
    const h = y1 - y0, w = x1 - x0;
    const pivotX = s.hinge === 'left' ? x0 : x1;
    const yc = (y0 + y1) / 2;
    const door = b.panel({
      id: s.id, name: s.name, box: box(x0, x1, y0, y1, z0, z0 + T),
      grain: 'y', material: 'front', edges: 'all',
      type: s.hinge === 'left' ? 'door-left' : 'door-right',
      pivot: { x: pivotX, y: yc, z: z0 },
    });
    door.openingAngle = openingAngle;
    if (h > 2000) b.warn(`Puerta de ${Math.round(h)} mm de alto: riesgo de alabeo, conviene dividirla.`);
    if (w > 600) b.warn(`Puerta de ${Math.round(w)} mm de ancho: supera el ancho recomendado de 600 mm.`);
    const crank = hingeCrank(b, s.hinge === 'left' ? s.from : s.to);
    const ref = {
      sku: `hinge-35-${crank}-${openingAngle}${softClose ? '-sc' : ''}`,
      name: `Bisagra cazoleta 35 mm ${CRANK_NAME[crank]} ${openingAngle}°${softClose ? ' cierre suave' : ''}`,
      qty: 1, unit: 'u' as const,
    };
    const n = b.cfg.hingeCount(h, w);
    door.hingeCount = n;
    for (let i = 0; i < n; i++) {
      const hy = y0 + 100 + (i * (h - 200)) / (n - 1);
      b.hardwarePart(
        { id: `hinge-${s.id}-${i}`, groupId: s.id, name: 'Bisagra Euro 35mm', width: 35, height: 35, depth: 12,
          x: s.hingeX, y: hy, z: c.zf - 10, type: 'hardware' },
        ref,
      );
    }
    b.addHardware(SKU.handle[0], SKU.handle[1], 1);
  }
}

export interface DrawerStackSpec {
  idPrefix: string;
  /** Límites del frente (overlay) y del hueco interior donde corre la caja. */
  frontFrom: Boundary;
  frontTo: Boundary;
  bayX0: number;
  bayX1: number;
  /** Zona vertical que cubren los frentes. */
  y0: number;
  y1: number;
  /** Límites verticales del hueco interior (para no chocar base ni amarres). */
  interiorY0: number;
  interiorY1: number;
  count: number;
  frontName?: string;
}

/** Elige el largo comercial de corredera que entra en la profundidad disponible. */
export function slideLength(b: Builder, depth: number): number {
  const avail = depth - b.cfg.slideRearClearance;
  const fit = b.cfg.slideLengths.filter((l) => l <= avail);
  if (fit.length === 0) throw new Error(`Profundidad ${depth} mm insuficiente para correderas (mínimo ${b.cfg.slideLengths[0] + b.cfg.slideRearClearance}).`);
  return fit[fit.length - 1];
}

/**
 * Pila de cajones con correderas telescópicas.
 * Caja de 4 piezas + piso clavado por debajo. La caja deja exactamente
 * `slideClearance` por lado contra las caras del hueco.
 */
export function drawerStack(b: Builder, c: Carcass, s: DrawerStackSpec) {
  const T = b.T, cfg = b.cfg;
  const [fx0, fx1] = spanBetween(b, s.frontFrom, s.frontTo);
  const gap = b.inset ? cfg.gaps.inset : cfg.gaps.between;
  // Embutidos: los frentes ocupan el hueco interior; superpuestos: la zona indicada.
  const zy0 = b.inset ? s.interiorY0 + cfg.gaps.inset : s.y0;
  const zy1 = b.inset ? s.interiorY1 - cfg.gaps.inset : s.y1;
  const frontH = Math.floor((zy1 - zy0 - gap * (s.count - 1)) / s.count);
  // Con frente embutido, la caja arranca detrás del frente.
  const zTop = b.inset ? c.zf - T : c.zf;
  const L = slideLength(b, zTop - c.zb);
  const boxW = s.bayX1 - s.bayX0 - 2 * cfg.slideClearance;
  const bx0 = s.bayX0 + cfg.slideClearance, bx1 = s.bayX1 - cfg.slideClearance;
  const bt = cfg.drawerBottomThickness;
  if (boxW < 2 * T + 50) throw new Error(`Hueco de ${s.bayX1 - s.bayX0} mm demasiado angosto para un cajón.`);

  for (let i = 0; i < s.count; i++) {
    const g = `${s.idPrefix}-${i}`;
    const fy0 = zy0 + i * (frontH + gap);
    const fy1 = fy0 + frontH;
    // Caja: piso por debajo, dentro del hueco interior y del tramo de su propio frente.
    const floor = Math.max(fy0 + cfg.drawerBoxBottomOffset, s.interiorY0 + 3);
    const ceiling = Math.min(fy1 - 5, s.interiorY1 - 5);
    const boxH = Math.min(Math.round(frontH * cfg.drawerBoxHeightRatio), Math.floor(ceiling - floor - bt));
    if (boxH < cfg.drawerBoxMinHeight) throw new Error(`Cajón ${i + 1}: alto de caja ${boxH} mm, por debajo del mínimo ${cfg.drawerBoxMinHeight}.`);
    const by0 = floor + bt, by1 = by0 + boxH;
    const zb = zTop - L;

    b.panel({ id: `${g}-front`, groupId: g, name: s.frontName ?? 'Frente Cajón', box: { x0: fx0, x1: fx1, y0: fy0, y1: fy1, z0: zTop, z1: zTop + T }, grain: 'x', material: 'front', edges: 'all', type: 'drawer' });
    b.panel({ id: `${g}-box-SL`, groupId: g, name: 'Lateral Izq. Caja', box: { x0: bx0, x1: bx0 + T, y0: by0, y1: by1, z0: zb, z1: zTop }, grain: 'z', material: 'drawer', edges: ['top'], edgeType: cfg.edges.drawerBox, type: 'drawer' });
    b.panel({ id: `${g}-box-SR`, groupId: g, name: 'Lateral Der. Caja', box: { x0: bx1 - T, x1: bx1, y0: by0, y1: by1, z0: zb, z1: zTop }, grain: 'z', material: 'drawer', edges: ['top'], edgeType: cfg.edges.drawerBox, type: 'drawer' });
    b.panel({ id: `${g}-box-F`, groupId: g, name: 'Frente Estruct. Caja', box: { x0: bx0 + T, x1: bx1 - T, y0: by0, y1: by1, z0: zTop - T, z1: zTop }, grain: 'x', material: 'drawer', edges: ['top'], edgeType: cfg.edges.drawerBox, type: 'drawer' });
    b.panel({ id: `${g}-box-B`, groupId: g, name: 'Trasera Estruct. Caja', box: { x0: bx0 + T, x1: bx1 - T, y0: by0, y1: by1, z0: zb, z1: zb + T }, grain: 'x', material: 'drawer', edges: ['top'], edgeType: cfg.edges.drawerBox, type: 'drawer' });
    b.panel({ id: `${g}-box-bottom`, groupId: g, name: `Piso Cajón ${bt}mm`, box: { x0: bx0, x1: bx1, y0: floor, y1: floor + bt, z0: zb, z1: zTop }, grain: 'free', material: 'drawerBottom', type: 'drawer' });

    const rail = { sku: `slide-telescopic-${L}`, name: `Corredera telescópica ${L} mm (par)`, unit: 'par' as const };
    const ry = by0 + boxH / 2;
    b.hardwarePart({ id: `${g}-rail-L`, groupId: g, name: 'Riel Telescópico (Juego)', width: cfg.slideClearance, height: 35, depth: L, x: s.bayX0 + cfg.slideClearance / 2, y: ry, z: zTop - L / 2, type: 'hardware' }, { ...rail, qty: 1 });
    // La otra mitad del par: solo visual, ya contada en el lateral izquierdo.
    b.hardwarePart({ id: `${g}-rail-R`, groupId: g, name: 'Riel Telescópico (Juego)', width: cfg.slideClearance, height: 35, depth: L, x: s.bayX1 - cfg.slideClearance / 2, y: ry, z: zTop - L / 2, type: 'hardware' }, { ...rail, qty: 0 });

    b.addHardware(SKU.drawerScrew[0], SKU.drawerScrew[1], 4 * 2);
    b.addHardware(SKU.backScrew[0], SKU.backScrew[1], Math.ceil(((2 * boxW + 2 * L) / 1000) * cfg.backScrewsPerMeter));
    b.addHardware(SKU.handle[0], SKU.handle[1], 1);
  }
}

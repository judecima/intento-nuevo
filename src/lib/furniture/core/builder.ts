import type { BuildConfig } from './config';
import type {
  Axis,
  EdgeBandType,
  FurniturePart,
  GrainDirection,
  HingeOptions,
  HardwareLine,
  HardwareRef,
  MaterialRole,
  PartEdges,
  PartType,
} from './types';

/** Caja alineada a los ejes, en mm. */
export interface Box {
  x0: number; x1: number;
  y0: number; y1: number;
  z0: number; z1: number;
}

export const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Box =>
  ({ x0, x1, y0, y1, z0, z1 });

/** Cara física de la pieza en el mueble armado. */
export type Face = 'front' | 'back' | 'top' | 'bottom' | 'left' | 'right';
const FACE_AXIS: Record<Face, [Axis, 'min' | 'max']> = {
  front: ['z', 'max'], back: ['z', 'min'],
  top: ['y', 'max'], bottom: ['y', 'min'],
  left: ['x', 'min'], right: ['x', 'max'],
};

export interface PanelSpec {
  id: string;
  name: string;
  box: Box;
  /** Eje del mueble en el que corre la veta. 'free' = la veta no importa. */
  grain: Axis | 'free';
  material: MaterialRole;
  /** Caras con tapacanto. 'all' = los cuatro cantos. */
  edges?: Face[] | 'all';
  edgeType?: EdgeBandType;
  type?: PartType;
  groupId?: string;
  pivot?: { x: number; y: number; z: number };
}

const size = (b: Box, a: Axis) => (a === 'x' ? b.x1 - b.x0 : a === 'y' ? b.y1 - b.y0 : b.z1 - b.z0);

/**
 * Acumula piezas, herrajes y advertencias de un mueble.
 * Toda pieza de tablero se crea con `panel()`, que deriva las medidas de corte
 * de la caja 3D: así el listado de corte no puede contradecir al 3D.
 */
export class Builder {
  readonly parts: FurniturePart[] = [];
  readonly hardware: HardwareLine[] = [];
  readonly warnings: string[] = [];

  readonly hinges: HingeOptions;

  constructor(readonly T: number, readonly cfg: BuildConfig, hinges?: Partial<HingeOptions>) {
    this.hinges = { ...cfg.hinges, ...(hinges ?? {}) };
  }

  get inset(): boolean {
    return this.hinges.mounting === 'inset';
  }

  panel(spec: PanelSpec): FurniturePart {
    const b = spec.box;
    const dims: Record<Axis, number> = { x: size(b, 'x'), y: size(b, 'y'), z: size(b, 'z') };
    for (const a of ['x', 'y', 'z'] as Axis[]) {
      if (!(dims[a] > 0)) throw new Error(`Pieza "${spec.name}" (${spec.id}) con medida no positiva en ${a}: ${dims[a]}`);
    }
    // El eje de espesor es el de menor dimensión.
    const thickAxis = (['x', 'y', 'z'] as Axis[]).reduce((m, a) => (dims[a] < dims[m] ? a : m), 'x' as Axis);
    const faceAxes = (['x', 'y', 'z'] as Axis[]).filter((a) => a !== thickAxis) as [Axis, Axis];

    let largoAxis: Axis;
    if (spec.grain !== 'free' && spec.grain !== thickAxis) largoAxis = spec.grain;
    else largoAxis = dims[faceAxes[0]] >= dims[faceAxes[1]] ? faceAxes[0] : faceAxes[1];
    const anchoAxis = faceAxes[0] === largoAxis ? faceAxes[1] : faceAxes[0];

    const grainMatters = spec.grain !== 'free';
    const grainDirection: GrainDirection = !grainMatters ? 'libre' : largoAxis === 'y' ? 'vertical' : 'horizontal';

    const edges: PartEdges = { top: 'none', bottom: 'none', left: 'none', right: 'none' };
    const type = spec.edgeType ?? (spec.material === 'front' ? this.cfg.edges.front : this.cfg.edges.body);
    const faces: Face[] = spec.edges === 'all' ? ['front', 'back', 'top', 'bottom', 'left', 'right'] : spec.edges ?? [];
    for (const f of faces) {
      const [axis, end] = FACE_AXIS[f];
      if (axis === anchoAxis) edges[end === 'max' ? 'top' : 'bottom'] = type;
      else if (axis === largoAxis) edges[end === 'max' ? 'right' : 'left'] = type;
      // Caras sobre el eje de espesor son las caras del tablero: no llevan canto.
    }

    const part: FurniturePart = {
      id: spec.id,
      groupId: spec.groupId,
      name: spec.name,
      width: dims.x, height: dims.y, depth: dims.z,
      x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, z: (b.z0 + b.z1) / 2,
      type: spec.type ?? 'static',
      pivot: spec.pivot,
      cutLargo: Math.round(dims[largoAxis]),
      cutAncho: Math.round(dims[anchoAxis]),
      cutEspesor: Math.round(dims[thickAxis] * 10) / 10,
      grainDirection,
      material: spec.material,
      edges,
      grainMatters,
    };
    this.parts.push(part);
    return part;
  }

  /** Herraje con representación 3D. `qty` es lo que aporta a la lista de compra. */
  hardwarePart(
    p: Omit<FurniturePart, 'cutLargo' | 'cutAncho' | 'cutEspesor' | 'grainDirection' | 'isHardware' | 'hardware'>,
    ref: HardwareRef,
  ): FurniturePart {
    const part: FurniturePart = {
      ...p,
      isHardware: true,
      cutLargo: 0, cutAncho: 0, cutEspesor: 0,
      grainDirection: 'libre',
      hardware: ref,
    };
    this.parts.push(part);
    return part;
  }

  /** Herraje sin geometría (tornillos, soportes, tiradores). */
  addHardware(sku: string, name: string, qty: number, unit: HardwareLine['unit'] = 'u') {
    if (qty <= 0) return;
    this.hardware.push({ sku, name, qty, unit });
  }

  warn(message: string) {
    if (!this.warnings.includes(message)) this.warnings.push(message);
  }
}

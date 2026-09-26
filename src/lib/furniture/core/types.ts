/**
 * Tipos del módulo de muebles paramétricos.
 *
 * El módulo no depende de Next, React ni three.js: se puede copiar tal cual
 * al repositorio del optimizador. `FurniturePart` es compatible con el `Part`
 * que consume `SceneManager` (mismos campos), más información de corte.
 *
 * Coordenadas (mm):
 *   x: 0 (izquierda) → W (derecha)
 *   y: 0 (piso)      → H (arriba)
 *   z: -D/2 (atrás)  → +D/2 (frente del cuerpo). Puertas y frentes quedan por delante de +D/2.
 */

export type GrainDirection = 'vertical' | 'horizontal' | 'libre';
export type Axis = 'x' | 'y' | 'z';
export type EdgeBandType = 'none' | 'thin' | 'thick';

/** overlay = puerta superpuesta al cuerpo; inset = puerta embutida, al ras del frente. */
export type HingeMounting = 'overlay' | 'inset';
export type HingeAngle = 95 | 110 | 165;
/** Tipo de bisagra cazoleta según cómo apoya la puerta (se deduce de la geometría). */
export type HingeCrank = 'recta' | 'semicodo' | 'codo';

export interface HingeOptions {
  mounting: HingeMounting;
  openingAngle: HingeAngle;
  softClose: boolean;
}

/** Material lógico. Cada maderera mapea estos roles a materiales reales. */
export type MaterialRole = 'body' | 'front' | 'back' | 'drawer' | 'drawerBottom';

export type PartType =
  | 'static'
  | 'door-left'
  | 'door-right'
  | 'door-flip'
  | 'drawer'
  | 'hardware'
  | 'piston-body'
  | 'piston-rod';

/**
 * Tapacanto por lado de la pieza de corte.
 * top/bottom: cantos paralelos al largo (cutLargo).
 * left/right: cantos en los extremos del largo.
 * Es la misma convención que `edges`/`edgeTypes` del optimizador.
 */
export interface PartEdges {
  top: EdgeBandType;
  bottom: EdgeBandType;
  left: EdgeBandType;
  right: EdgeBandType;
}

export interface HardwareRef {
  /** Clave estable para agregar y mapear al catálogo de la maderera. */
  sku: string;
  name: string;
  /** Cantidad que aporta esta pieza 3D a la lista de compra (0 = solo visual). */
  qty: number;
  unit: 'u' | 'par' | 'm';
}

export interface FurniturePart {
  id: string;
  groupId?: string;
  name: string;
  /** Dimensiones y centro de la caja 3D (para el render). */
  width: number;
  height: number;
  depth: number;
  x: number;
  y: number;
  z: number;
  type: PartType;
  pivot?: { x: number; y: number; z: number };
  isHardware?: boolean;

  /** Medidas de corte. Regla única: cutLargo SIEMPRE sigue la veta (si la hay). */
  cutLargo: number;
  cutAncho: number;
  cutEspesor: number;
  grainDirection: GrainDirection;
  hingeCount?: number;
  /** Ángulo máximo de apertura de puertas (grados), para la animación. */
  openingAngle?: number;
  pistonConfig?: {
    side: 'left' | 'right';
    anchorMueble: { x: number; y: number; z: number };
    anchorPuertaLocal: { x: number; y: number; z: number };
    doorId: string;
    lengthClosed: number;
    lengthOpen: number;
  };

  /** Solo tableros. */
  material?: MaterialRole;
  edges?: PartEdges;
  /** false si la veta del tablero no importa para esta pieza (fondos, pisos de cajón). */
  grainMatters?: boolean;

  /** Solo herrajes 3D. */
  hardware?: HardwareRef;
}

/** Herraje sin representación 3D (tornillos, soportes, tiradores...). */
export interface HardwareLine {
  sku: string;
  name: string;
  qty: number;
  unit: 'u' | 'par' | 'm';
}

export interface FurnitureParams {
  width: number;
  height: number;
  depth: number;
  thickness: number;
  hasBack?: boolean;
  hasShelf?: boolean;
  hasShelf2?: boolean;
  /** Bisagras. Si se omite, se usan los valores por defecto de la configuración. */
  hinges?: Partial<HingeOptions>;
}

export interface FurnitureModel {
  parts: FurniturePart[];
  /** Herrajes sin geometría, ya contados. */
  hardware: HardwareLine[];
  summary: string;
  hasDoors: boolean;
  hasDrawers: boolean;
  warnings: string[];
}

export interface ParamRange {
  min: number;
  max: number;
}

export interface TemplateSpec {
  type: string;
  label: string;
  /** Rangos admitidos. Si min === max, la medida es fija. */
  ranges: { width: ParamRange; height: ParamRange; depth: ParamRange };
  thicknesses: number[];
  build: (params: FurnitureParams, ctx: import('./builder').Builder) => void;
  summary: string;
}

export interface ValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  partIds?: string[];
}

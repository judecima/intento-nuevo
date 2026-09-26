import type { EdgeBandType, HingeAngle, HingeOptions } from './types';

/**
 * Reglas constructivas. Son los valores por defecto; cada maderera puede
 * sobrescribirlos (por ejemplo, holgura de correderas o tipo de tapacanto).
 */
export interface BuildConfig {
  backThickness: number;
  drawerBottomThickness: number;
  /** Luces de puertas y frentes. */
  gaps: {
    /** Contra el borde exterior del mueble. */
    outer: number;
    /** Entre dos puertas/frentes vecinos (total, se reparte mitad y mitad). */
    between: number;
    /** Luz superior de puertas de bajo mesada (bajo la mesada). */
    underCountertop: number;
    /** Luz perimetral de puertas y frentes embutidos (inset). */
    inset: number;
  };
  /** Bisagras por defecto y ángulos que se pueden ofrecer. */
  hinges: HingeOptions;
  hingeAngles: HingeAngle[];
  /** Holgura por lado entre caja de cajón y cuerpo (corredera telescópica). */
  slideClearance: number;
  /** Largos comerciales de corredera telescópica. */
  slideLengths: number[];
  /** Espacio mínimo detrás de la caja del cajón. */
  slideRearClearance: number;
  /** Separación entre el piso del cajón y el borde inferior del frente. */
  drawerBoxBottomOffset: number;
  /** Alto de caja / alto de frente. */
  drawerBoxHeightRatio: number;
  drawerBoxMinHeight: number;
  /** Holgura lateral de estantes (por lado). */
  shelfSideClearance: number;
  /** Retiro del estante respecto del frente del cuerpo. */
  shelfFrontSetback: number;
  /** Luz máxima recomendada de estante en 18 mm sin apoyo intermedio. */
  shelfSpanWarning: number;
  railHeight: number;
  edges: { body: EdgeBandType; front: EdgeBandType; drawerBox: EdgeBandType };
  /** Tornillos por unión según profundidad de la unión. */
  jointScrews: (depth: number) => number;
  /** Tornillos por metro de perímetro para fijar el fondo. */
  backScrewsPerMeter: number;
  hingeCount: (doorHeight: number, doorWidth: number) => number;
}

export const DEFAULT_CONFIG: BuildConfig = {
  backThickness: 5,
  drawerBottomThickness: 5,
  gaps: { outer: 2, between: 3, underCountertop: 3, inset: 2 },
  hinges: { mounting: 'overlay', openingAngle: 110, softClose: true },
  hingeAngles: [95, 110, 165],
  slideClearance: 13,
  slideLengths: [250, 300, 350, 400, 450, 500, 550, 600],
  slideRearClearance: 30,
  drawerBoxBottomOffset: 15,
  drawerBoxHeightRatio: 0.7,
  drawerBoxMinHeight: 60,
  shelfSideClearance: 1,
  shelfFrontSetback: 20,
  shelfSpanWarning: 900,
  railHeight: 60,
  edges: { body: 'thin', front: 'thick', drawerBox: 'thin' },
  jointScrews: (depth) => (depth <= 350 ? 2 : 3),
  backScrewsPerMeter: 7,
  hingeCount: (h, w) => {
    let n = h <= 900 ? 2 : h <= 1500 ? 3 : h <= 2000 ? 4 : 5;
    if (w > 600) n += 1;
    return n;
  },
};

export function withConfig(overrides?: Partial<BuildConfig>): BuildConfig {
  if (!overrides) return DEFAULT_CONFIG;
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
    gaps: { ...DEFAULT_CONFIG.gaps, ...(overrides.gaps ?? {}) },
    edges: { ...DEFAULT_CONFIG.edges, ...(overrides.edges ?? {}) },
    hinges: { ...DEFAULT_CONFIG.hinges, ...(overrides.hinges ?? {}) },
  };
}

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

export type OptimizerStrategy = "baseline" | "v10";
export type OptimizerProfile = "fast" | "balanced" | "deep";
export type OptimizationEdgeBandType = "none" | "thin" | "thick" | "both";

export interface OptimizationBoardInput {
  width: number;
  height: number;
  thickness?: number;
}

export interface OptimizationMaterialInput {
  id?: string;
  code?: string;
  description: string;
  hasGrain: boolean;
  thickness?: number;
}

export interface OptimizationTrimInput {
  x: number;
  y: number;
}

export interface OptimizationConstraintsInput {
  profile?: OptimizerProfile;
  stages?: number;
  minRemnant: number;
  minCommercialRemnantLongSide?: number;
  allowOneBoard?: boolean;
  allowPatternMaster?: boolean;
  allowMultiSlice?: boolean;
  allowDeadStripCompaction?: boolean;
}

export interface OptimizationPieceEdgesInput {
  top?: boolean;
  bottom?: boolean;
  left?: boolean;
  right?: boolean;
}

export interface OptimizationPieceInput {
  id?: string;
  reference: string;
  description?: string;
  quantity: number;
  width: number;
  height: number;
  grain?: boolean;
  canRotate?: boolean;
  edges?: OptimizationPieceEdgesInput;
  edgeType?: OptimizationEdgeBandType;
  metadata?: Record<string, unknown>;
}

export interface OptimizationInput {
  board: OptimizationBoardInput;
  material: OptimizationMaterialInput;
  kerf: number;
  trim: OptimizationTrimInput;
  constraints: OptimizationConstraintsInput;
  pieces: OptimizationPieceInput[];
  strategy?: OptimizerStrategy;
  projectId?: string;
  projectVersion?: number;
}

export interface OptimizationPlacementEdges {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
}

/**
 * Traza de decisiones (region / rebanada) que llevo a colocar la pieza.
 * Alimenta el modo diagnostico del visor de plano.
 */
export interface OptimizationPlacementTrace {
  level: number | null;
  type: string;
  region: { x: number; y: number; width: number; height: number } | null;
  block: { x: number; y: number; width: number; height: number } | null;
  slice: number | null;
  provisionalSlice: number | null;
  direction: string | null;
  multiplier: number | null;
  anchorPiece: string;
  anchorWidth: number | null;
  anchorHeight: number | null;
  anchorRotated: boolean;
}

export interface OptimizationPlacement {
  id: string;
  boardIndex: number;
  pieceId: string;
  reference: string;
  description: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotated: boolean;
  level: number;
  /** Medidas de la pieza tal como se cargaron, antes de rotar. */
  sourceWidth: number;
  sourceHeight: number;
  edges: OptimizationPlacementEdges;
  edgeType: OptimizationEdgeBandType;
  trace: OptimizationPlacementTrace[];
}

export interface OptimizationCut {
  boardIndex: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  level: number;
  length: number;
  terminal: boolean;
}

export interface OptimizationRemnant {
  boardIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  area: number;
  commercial: boolean;
}

export interface OptimizationBoardResult {
  boardIndex: number;
  width: number;
  height: number;
  placements: OptimizationPlacement[];
  cuts: OptimizationCut[];
  remnants: OptimizationRemnant[];
}

export interface OptimizationMetrics {
  boardCount: number;
  pieceCount: number;
  expectedPieceCount: number;
  utilizationPercentage: number;
  wastePercentage: number;
  totalAreaM2: number;
  cutAreaM2: number;
  commercialRemnantAreaM2: number;
  largestCommercialRemnantM2: number;
  secondLargestCommercialRemnantM2: number;
  commercialRemnantCount: number;
  cutCount: number;
  sawMeters: number;
  edgeBand045Meters: number;
  edgeBand2mmMeters: number;
  engineMs?: number;
  cacheHit?: boolean;
}

export interface OptimizationValidation {
  ok: boolean;
  industrial: LegacyIndustrialValidation;
  independentSlices: IndependentSlicesValidation;
}

export interface OptimizationResult {
  algorithmVersion: string;
  inputHash?: string;
  strategy: OptimizerStrategy;
  profile?: OptimizerProfile;
  projectId?: string;
  projectVersion?: number;
  boards: OptimizationBoardResult[];
  placements: OptimizationPlacement[];
  cuts: OptimizationCut[];
  remnants: OptimizationRemnant[];
  metrics: OptimizationMetrics;
  validation: OptimizationValidation;
  raw: LegacyPlan;
}

export interface MachineProfileInput {
  name?: string;
  manufacturer?: string;
  model?: string;
  xmlFormat?: string;
  kerf?: number;
  configuration?: Record<string, unknown>;
}

export interface MachineXmlInput {
  material?: string;
  thickness?: number;
  machineProfile?: MachineProfileInput;
}

export interface LegacyLineInput {
  ref: string;
  detalle: string;
  cant: number;
  base: number;
  altura: number;
  veta: boolean;
  edgeType?: OptimizationEdgeBandType;
  cantos?: {
    arr?: boolean;
    aba?: boolean;
    izq?: boolean;
    der?: boolean;
  } | null;
}

export interface LegacyOptimizerOptions {
  placaBase: number;
  placaAltura: number;
  refiladoX: number;
  refiladoY: number;
  sierra: number;
  etapas: number;
  materialConVeta: boolean;
  descontarCanto: boolean;
  cantoEspesor: number;
  restoMin: number;
  restoMax: number;
  usarOneBoard?: boolean;
  usarMaster?: boolean;
  usarMultiSlice?: boolean;
  usarCompactacion?: boolean;
  rondasPatrones?: number;
  msMaster?: number;
  semillasRescate?: number;
  msRescate?: number;
  [key: string]: unknown;
}

export interface LegacyPiece {
  id?: number;
  ref?: string;
  detalle?: string;
  base?: number;
  altura?: number;
  cantos?: {
    arr?: boolean;
    aba?: boolean;
    izq?: boolean;
    der?: boolean;
  } | null;
  _codigoXml?: string;
  _corte?: {
    base: number;
    altura: number;
  };
  [key: string]: unknown;
}

export interface LegacyDiagStep {
  nivel?: number;
  tipo?: string;
  dir?: string | number;
  mult?: number;
  rebanada?: number;
  rebanadaProvisional?: number;
  region?: { x?: number; y?: number; w?: number; h?: number };
  bloque?: { x?: number; y?: number; w?: number; h?: number };
  piezaAncla?: string;
  piezaFinal?: string;
  baseAncla?: number;
  alturaAncla?: number;
  rotadaAncla?: boolean;
  [key: string]: unknown;
}

export interface LegacyPlacement {
  x: number;
  y: number;
  base: number;
  altura: number;
  rotada?: boolean;
  nivel?: number;
  pieza?: LegacyPiece;
  _diagPath?: LegacyDiagStep[];
  [key: string]: unknown;
}

export interface LegacyCut {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  nivel?: number;
  largo?: number;
  terminal?: boolean;
  [key: string]: unknown;
}

export interface LegacyRemnant {
  x: number;
  y: number;
  w: number;
  h: number;
  placa?: number;
  [key: string]: unknown;
}

export interface LegacyRemnantQuality {
  mayor: number;
  segundo: number;
  fragmentos: number;
  total: number;
  areas: number[];
}

export interface LegacyTreePart {
  cut: number;
  type: number;
  pieza?: LegacyPiece | null;
  bloque?: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  hijo?: LegacyTreeNode;
  [key: string]: unknown;
}

export interface LegacyTreeNode {
  x: number;
  y: number;
  w: number;
  h: number;
  dir: "x" | "y";
  nivel: number;
  partes?: LegacyTreePart[];
  [key: string]: unknown;
}

export interface LegacyBoard {
  ancho: number;
  alto: number;
  colocadas?: LegacyPlacement[];
  cortes?: LegacyCut[];
  restos?: LegacyRemnant[];
  arbol?: LegacyTreeNode;
  [key: string]: unknown;
}

export interface LegacySummary {
  placas?: number;
  piezas?: number;
  m2Totales?: number;
  m2Cortados?: number;
  aprovechamiento?: number;
  desperdicio?: number;
  cortes?: number;
  metrosSierra?: number;
  sobrantes?: number;
  m2Sobrantes?: number;
  origen?: string;
  [key: string]: unknown;
}

export interface LegacyPlan {
  placas: LegacyBoard[];
  opts: LegacyOptimizerOptions;
  resumen?: LegacySummary;
  sobrantes?: LegacyRemnant[];
  metricasV10?: unknown;
  cotaV10?: number;
  [key: string]: unknown;
}

export interface LegacyOptimizerReturn {
  plan: LegacyPlan;
  metricas?: unknown;
  cota?: number;
}

export interface LegacyIndustrialValidation {
  ok: boolean;
  placas: number;
  piezasEsperadas: number;
  piezasColocadas: number;
  idsUnicos: number;
  duplicados: unknown[];
  coberturaCompleta: boolean;
  geometriaValida: boolean;
  secuenciaCompleta: boolean;
  cortesTerminales: number;
  detallePlacas: unknown[];
  [key: string]: unknown;
}

export interface IndependentSlicesValidation {
  ok: boolean;
  errores: string[];
}

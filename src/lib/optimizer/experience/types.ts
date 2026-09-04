import type { OptimizationResult, OptimizerProfile, OptimizerStrategy } from "../types";

/** Version del esquema del store. Cambiarla invalida todas las entradas guardadas. */
export const EXPERIENCE_STORE_VERSION = "experience-store-v1";

/**
 * Feature flag. Exact Memory nace apagada: mientras esto sea false, el flujo real
 * corre exactamente como antes. Etapa 4A se usa desde un runner offline, no en produccion.
 */
export const experienceMemoryEnabled = false;

export interface ExperienceLookupKey {
  exactFingerprint: string;
  strategy: OptimizerStrategy;
  profile?: OptimizerProfile;
}

export interface ExactExperienceEntry extends ExperienceLookupKey {
  storeVersion: string;
  fingerprintVersion: string;
  optimizerVersion: string;
  /** Plan producido por NUESTRO optimizador. Nunca un plan de Lepton. */
  plan: OptimizationResult;
  boards: number;
  expectedPieceCount: number;
  /**
   * Clave de equivalencia de la pieza que origino cada colocacion, alineada con
   * plan.placements. Permite reasignar las etiquetas del pedido nuevo al reutilizar.
   */
  pieceKeys: string[];
  createdAt: string;
  metrics?: {
    originalEngineMs?: number;
  };
}

export interface ExactExperienceStore {
  readonly name: string;
  /** true en un store congelado: save() es no-op, asi que nadie debe reportar que aprendio. */
  readonly readonly?: boolean;
  get(key: ExperienceLookupKey): ExactExperienceEntry | null;
  save(entry: ExactExperienceEntry): void;
  has(key: ExperienceLookupKey): boolean;
  delete(key: ExperienceLookupKey): boolean;
  clear(): void;
  size(): number;
  list(): ExactExperienceEntry[];
  /** Persiste lo pendiente. No-op en el store en memoria. */
  flush(): void;
}

export interface ExperienceStoreOptions {
  /** Limite de entradas. Al superarlo se descarta la mas antigua. */
  maxEntries?: number;
}

export interface FileExperienceStoreOptions extends ExperienceStoreOptions {
  /** Escribir el archivo en cada save. Poner en false para cargas masivas y llamar flush(). */
  autoFlush?: boolean;
}

export type ExperienceOutcome = "disabled" | "hit" | "miss" | "fallback";

/** Desglose de costos de la capa de experiencia, en ms. */
export interface ExperienceTimings {
  fingerprintMs: number;
  lookupMs: number;
  deserializeMs: number;
  validationMs: number;
  engineMs: number;
  totalMs: number;
}

export interface ExperienceInfo {
  enabled: boolean;
  outcome: ExperienceOutcome;
  exactFingerprint?: string;
  /** Motivo por el que una entrada candidata no se pudo reutilizar. */
  invalidReason?: string;
  recorded: boolean;
  timings: ExperienceTimings;
  originalEngineMs?: number | null;
}

/** Contadores agregados de una corrida. El runner los acumula entre casos. */
export interface ExperienceStats {
  cases: number;
  exactHits: number;
  misses: number;
  invalidCacheEntries: number;
  fallbacks: number;
  recorded: number;
}

export function createExperienceStats(): ExperienceStats {
  return { cases: 0, exactHits: 0, misses: 0, invalidCacheEntries: 0, fallbacks: 0, recorded: 0 };
}

export interface ExperienceOptions {
  /** Por defecto false: sin esto el comportamiento es exactamente el de optimizeProject. */
  enabled?: boolean;
  store?: ExactExperienceStore;
  /** Guardar el resultado cuando no hubo hit. Por defecto true si hay store. */
  record?: boolean;
  /** Contadores opcionales que el runner acumula entre casos. */
  stats?: ExperienceStats;
}

export interface ExperienceOptimizationResult extends OptimizationResult {
  experience: ExperienceInfo;
}

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { LEGACY_OPTIMIZER_VERSION } from "../engine/legacy-engine";
import { EXACT_FINGERPRINT_VERSION } from "../fingerprints";
import type { OptimizationResult } from "../types";
import {
  EXPERIENCE_STORE_VERSION,
  type ExactExperienceEntry,
  type ExactExperienceStore,
  type ExperienceLookupKey,
  type ExperienceStoreOptions,
  type FileExperienceStoreOptions
} from "./types";

export interface ExperienceEntryInput extends ExperienceLookupKey {
  plan: OptimizationResult;
  pieceKeys: string[];
  originalEngineMs?: number | null;
  createdAt?: string;
}

export function experienceEntryKey(key: ExperienceLookupKey): string {
  return `${key.exactFingerprint}|${key.strategy}|${key.profile ?? "default"}`;
}

export function createExperienceEntry(input: ExperienceEntryInput): ExactExperienceEntry {
  const originalEngineMs = input.originalEngineMs ?? input.plan.metrics.engineMs ?? null;

  return {
    exactFingerprint: input.exactFingerprint,
    strategy: input.strategy,
    ...(input.profile ? { profile: input.profile } : {}),
    storeVersion: EXPERIENCE_STORE_VERSION,
    fingerprintVersion: EXACT_FINGERPRINT_VERSION,
    optimizerVersion: input.plan.algorithmVersion,
    plan: input.plan,
    boards: input.plan.metrics.boardCount,
    expectedPieceCount: input.plan.metrics.expectedPieceCount,
    pieceKeys: input.pieceKeys,
    createdAt: input.createdAt ?? new Date().toISOString(),
    ...(originalEngineMs === null ? {} : { metrics: { originalEngineMs } })
  };
}

/**
 * Una entrada solo es utilizable si coinciden version de store, de fingerprint y de motor.
 * Si cambia cualquiera de las tres, la entrada se ignora: MISS, sin migracion automatica.
 */
export function isEntryCompatible(entry: ExactExperienceEntry | null | undefined): boolean {
  if (!entry || typeof entry !== "object") return false;
  if (entry.storeVersion !== EXPERIENCE_STORE_VERSION) return false;
  if (entry.fingerprintVersion !== EXACT_FINGERPRINT_VERSION) return false;
  if (entry.optimizerVersion !== LEGACY_OPTIMIZER_VERSION) return false;
  if (!entry.plan || !Array.isArray(entry.plan.placements)) return false;
  if (!Array.isArray(entry.pieceKeys)) return false;
  return entry.pieceKeys.length === entry.plan.placements.length;
}

/** Store en memoria. Es el que usan los tests y el runner offline. */
export function createMemoryExperienceStore(options: ExperienceStoreOptions = {}): ExactExperienceStore {
  return createMapStore("memory", new Map(), options, () => {}, true);
}

/**
 * Store local en un archivo JSON. Sin red, sin base de datos, sin dependencias nuevas.
 * Etapa 3A solo necesita persistir y releer localmente para poder congelar el store
 * entre la corrida de TRAIN y la de HOLDOUT.
 */
export function createFileExperienceStore(
  path: string,
  options: FileExperienceStoreOptions = {}
): ExactExperienceStore {
  const entries = new Map<string, ExactExperienceEntry>();

  for (const entry of readEntriesFile(path)) {
    if (isEntryCompatible(entry)) entries.set(experienceEntryKey(entry), entry);
  }

  const persist = () => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      JSON.stringify({ storeVersion: EXPERIENCE_STORE_VERSION, entries: [...entries.values()] }),
      "utf8"
    );
  };

  return createMapStore(`file:${path}`, entries, options, persist, options.autoFlush ?? true);
}

/**
 * Store en un directorio: una entrada por archivo, indexado por hash de la clave.
 *
 * createFileExperienceStore mantiene todas las entradas en memoria y reescribe un unico
 * JSON, lo que no escala al corpus completo: un plan pesa cientos de KB y miles de entradas
 * superan el tamano maximo de string de V8. Aca cada entrada se lee recien cuando se la
 * consulta, asi que la memoria del proceso no crece con el tamano de la memoria aprendida
 * y el costo de deserializar un plan queda medido en cada hit, que es lo que pasaria con
 * un backend real.
 */
export function createDirectoryExperienceStore(dir: string): ExactExperienceStore {
  const fileFor = (key: ExperienceLookupKey): string =>
    join(dir, createHash("sha256").update(experienceEntryKey(key)).digest("hex").slice(0, 32) + ".json");

  const get = (key: ExperienceLookupKey): ExactExperienceEntry | null => {
    let raw: string;
    try {
      raw = readFileSync(fileFor(key), "utf8");
    } catch {
      return null;
    }

    let entry: ExactExperienceEntry;
    try {
      entry = JSON.parse(raw) as ExactExperienceEntry;
    } catch {
      // Archivo corrupto: se trata como MISS, nunca como error hacia afuera.
      return null;
    }

    // La clave guardada tiene que ser la buscada: defensa contra un archivo cruzado.
    if (experienceEntryKey(entry) !== experienceEntryKey(key)) return null;
    return isEntryCompatible(entry) ? entry : null;
  };

  return {
    name: `dir:${dir}`,
    get,
    has: (key) => get(key) !== null,
    save(entry) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(fileFor(entry), JSON.stringify(entry), "utf8");
    },
    delete(key) {
      const path = fileFor(key);
      if (!existsSync(path)) return false;
      unlinkSync(path);
      return true;
    },
    clear() {
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
    },
    size: () => entryFiles(dir).length,
    /** Lee todo el directorio. Solo para tests e inspeccion, no para el camino caliente. */
    list() {
      const entries: ExactExperienceEntry[] = [];
      for (const name of entryFiles(dir)) {
        try {
          const entry = JSON.parse(readFileSync(join(dir, name), "utf8")) as ExactExperienceEntry;
          if (isEntryCompatible(entry)) entries.push(entry);
        } catch {
          /* archivo corrupto: se ignora */
        }
      }
      return entries;
    },
    flush() {
      /* cada save ya escribio su propio archivo */
    }
  };
}

function entryFiles(dir: string): string[] {
  try {
    return readdirSync(dir).filter((name) => name.endsWith(".json"));
  } catch {
    return [];
  }
}

/** Store de solo lectura: util para congelar la memoria antes de evaluar un holdout. */
export function freezeExperienceStore(store: ExactExperienceStore): ExactExperienceStore {
  return {
    ...store,
    name: `frozen:${store.name}`,
    readonly: true,
    save() {
      /* congelado: el holdout no puede poblar la memoria */
    },
    delete() {
      return false;
    },
    clear() {
      /* congelado */
    },
    flush() {
      /* congelado */
    }
  };
}

function createMapStore(
  name: string,
  entries: Map<string, ExactExperienceEntry>,
  options: ExperienceStoreOptions,
  persist: () => void,
  persistOnSave: boolean
): ExactExperienceStore {
  const get = (key: ExperienceLookupKey): ExactExperienceEntry | null => {
    const entry = entries.get(experienceEntryKey(key));
    if (!entry) return null;
    if (!isEntryCompatible(entry)) {
      entries.delete(experienceEntryKey(key));
      return null;
    }
    return entry;
  };

  return {
    name,
    get,
    has: (key) => get(key) !== null,
    save(entry) {
      saveEntry(entries, options, entry);
      if (persistOnSave) persist();
    },
    delete(key) {
      const deleted = entries.delete(experienceEntryKey(key));
      if (deleted) persist();
      return deleted;
    },
    clear() {
      entries.clear();
      persist();
    },
    size: () => entries.size,
    list: () => [...entries.values()],
    flush: persist
  };
}

function saveEntry(
  entries: Map<string, ExactExperienceEntry>,
  options: ExperienceStoreOptions,
  entry: ExactExperienceEntry
): void {
  const key = experienceEntryKey(entry);
  if (entries.has(key)) entries.delete(key);
  entries.set(key, entry);

  const max = options.maxEntries;
  if (max == null || max <= 0) return;
  while (entries.size > max) {
    const oldest = entries.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

function readEntriesFile(path: string): ExactExperienceEntry[] {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as { entries?: unknown };
    if (!Array.isArray(parsed.entries)) return [];
    return parsed.entries as ExactExperienceEntry[];
  } catch {
    // Un archivo corrupto se ignora entero: nunca debe romper una optimizacion.
    return [];
  }
}

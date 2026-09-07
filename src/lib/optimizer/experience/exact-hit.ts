import { canonicalizeOptimizationInput } from "../canonical-case";
import { optimizeProject } from "../engine/legacy-engine";
import { exactFingerprint } from "../fingerprints";
import type { OptimizationInput, OptimizationResult } from "../types";
import { buildPieceKeys, revalidateExactHit } from "./revalidate";
import { createExperienceEntry } from "./store";
import type {
  ExperienceInfo,
  ExperienceOptimizationResult,
  ExperienceOptions,
  ExperienceTimings
} from "./types";

const now = (): number => Number(process.hrtime.bigint()) / 1e6;

/**
 * Etapa 4A - Exact Hit experimental.
 *
 * No reemplaza ni modifica a optimizeProject: lo envuelve. Con la experiencia
 * deshabilitada delega y devuelve exactamente el resultado del motor.
 *
 * Un plan guardado solo se devuelve si el fingerprint exacto coincide Y ademas pasa la
 * revalidacion completa. Una entrada invalida nunca produce un error hacia afuera:
 * se cuenta como invalidCacheEntry y se recalcula con el motor.
 */
export function optimizeProjectWithExperience(
  input: OptimizationInput,
  options: ExperienceOptions = {}
): ExperienceOptimizationResult {
  const startedAt = now();
  const stats = options.stats;
  if (stats) stats.cases++;

  const store = options.store;
  if (!options.enabled || !store) {
    const engineStart = now();
    const result = optimizeProject(input);
    const engineMs = now() - engineStart;
    return withExperience(result, {
      enabled: false,
      outcome: "disabled",
      recorded: false,
      timings: timings({ engineMs, totalMs: now() - startedAt })
    });
  }

  const canonical = canonicalizeOptimizationInput(input);
  const fingerprint = exactFingerprint(canonical);
  const fingerprintMs = now() - startedAt;

  const lookupStart = now();
  const entry = store.get({
    exactFingerprint: fingerprint,
    strategy: input.strategy ?? "baseline",
    ...(input.constraints.profile ? { profile: input.constraints.profile } : {})
  });
  const lookupMs = now() - lookupStart;

  if (entry) {
    // El plan se clona antes de devolverlo: quien lo reciba no debe poder mutar el store.
    const deserializeStart = now();
    const cloned = cloneEntryPlan(entry.plan);
    const deserializeMs = now() - deserializeStart;

    const validationStart = now();
    const revalidated = revalidateExactHit({ ...entry, plan: cloned }, input, canonical);
    const validationMs = now() - validationStart;

    if (revalidated.ok) {
      if (stats) stats.exactHits++;
      const totalMs = now() - startedAt;
      return withExperience(
        {
          ...revalidated.result,
          metrics: { ...revalidated.result.metrics, engineMs: totalMs, cacheHit: false }
        },
        {
          enabled: true,
          outcome: "hit",
          exactFingerprint: fingerprint,
          recorded: false,
          originalEngineMs: entry.metrics?.originalEngineMs ?? null,
          timings: timings({ fingerprintMs, lookupMs, deserializeMs, validationMs, engineMs: 0, totalMs })
        }
      );
    }

    // Entrada invalida: se descarta y se recalcula. Nunca se propaga un error al usuario.
    if (stats) {
      stats.invalidCacheEntries++;
      stats.fallbacks++;
    }
    const engineStart = now();
    const computed = optimizeProject(input);
    const engineMs = now() - engineStart;
    return withExperience(computed, {
      enabled: true,
      outcome: "fallback",
      exactFingerprint: fingerprint,
      invalidReason: revalidated.reason,
      recorded: false,
      timings: timings({ fingerprintMs, lookupMs, deserializeMs, validationMs, engineMs, totalMs: now() - startedAt })
    });
  }

  if (stats) stats.misses++;
  const engineStart = now();
  const computed = optimizeProject(input);
  const engineMs = now() - engineStart;

  const pieceKeys = buildPieceKeys(computed, input);
  // Un store congelado no aprende, asi que tampoco puede reportar que aprendio.
  const recorded =
    (options.record ?? true) && !store.readonly && computed.validation.ok && pieceKeys !== null;
  if (recorded && pieceKeys) {
    store.save(
      createExperienceEntry({
        exactFingerprint: fingerprint,
        strategy: input.strategy ?? "baseline",
        ...(input.constraints.profile ? { profile: input.constraints.profile } : {}),
        plan: computed,
        pieceKeys,
        originalEngineMs: computed.metrics.engineMs ?? null
      })
    );
    if (stats) stats.recorded++;
  }

  return withExperience(computed, {
    enabled: true,
    outcome: "miss",
    exactFingerprint: fingerprint,
    recorded,
    timings: timings({ fingerprintMs, lookupMs, engineMs, totalMs: now() - startedAt })
  });
}

function withExperience(result: OptimizationResult, experience: ExperienceInfo): ExperienceOptimizationResult {
  return { ...result, experience };
}

function timings(partial: Partial<ExperienceTimings>): ExperienceTimings {
  return {
    fingerprintMs: round(partial.fingerprintMs ?? 0),
    lookupMs: round(partial.lookupMs ?? 0),
    deserializeMs: round(partial.deserializeMs ?? 0),
    validationMs: round(partial.validationMs ?? 0),
    engineMs: round(partial.engineMs ?? 0),
    totalMs: round(partial.totalMs ?? 0)
  };
}

function cloneEntryPlan(plan: OptimizationResult): OptimizationResult {
  return structuredClone(plan);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

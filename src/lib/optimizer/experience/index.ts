export {
  EXPERIENCE_STORE_VERSION,
  createExperienceStats,
  experienceMemoryEnabled
} from "./types";
export {
  createDirectoryExperienceStore,
  createExperienceEntry,
  createFileExperienceStore,
  createMemoryExperienceStore,
  experienceEntryKey,
  freezeExperienceStore,
  isEntryCompatible
} from "./store";
export { benchmarkInputFromCanonicalCase, benchmarkProfileForStrategy } from "./benchmark-input";
export { buildPieceKeys, revalidateExactHit } from "./revalidate";
export { optimizeProjectWithExperience } from "./exact-hit";
export type * from "./types";
export type { BenchmarkInputOptions } from "./benchmark-input";
export type { ExperienceEntryInput } from "./store";
export type { ExactHitRevalidation } from "./revalidate";

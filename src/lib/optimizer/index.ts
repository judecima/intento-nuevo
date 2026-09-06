export { optimizationInputSchema } from "./schema";
export { analyzeFurnitureStructure } from "./analysis/furniture-structure";
export type * from "./analysis/furniture-structure";
export { canonicalizeOptimizationInput, serializeCanonicalOptimizationCase } from "./canonical-case";
export { CanonicalXmlParseError, parseCanonicalXml } from "./canonical-xml";
export { EXACT_FINGERPRINT_VERSION, exactFingerprint, exactFingerprintPayload, exactPieceKey } from "./fingerprints";
export {
  EXPERIENCE_STORE_VERSION,
  benchmarkInputFromCanonicalCase,
  benchmarkProfileForStrategy,
  buildPieceKeys,
  createDirectoryExperienceStore,
  createExperienceEntry,
  createExperienceStats,
  createFileExperienceStore,
  createMemoryExperienceStore,
  experienceEntryKey,
  experienceMemoryEnabled,
  freezeExperienceStore,
  isEntryCompatible,
  optimizeProjectWithExperience,
  revalidateExactHit
} from "./experience";
export { generateMachineXml } from "./exporters/machine-xml";
export { getOptimizationInputHash, LEGACY_OPTIMIZER_VERSION, optimizeProject } from "./engine/legacy-engine";
export { validateIndependentSlices } from "./validators/independent-slices";
export type * from "./canonical-case";
export type * from "./canonical-xml";
export type * from "./experience";
export type * from "./fingerprints";
export type * from "./types";

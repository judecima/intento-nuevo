export { optimizationInputSchema } from "./schema";
export { generateMachineXml } from "./exporters/machine-xml";
export { getOptimizationInputHash, LEGACY_OPTIMIZER_VERSION, optimizeProject } from "./engine/legacy-engine";
export { validateIndependentSlices } from "./validators/independent-slices";
export type * from "./types";

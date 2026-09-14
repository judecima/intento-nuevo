import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { optimizar, calidadPlanPlacas } = require("../../../../src/lib/optimizer/legacy/motor.cjs");
export const FAST_INCUMBENT_VERSION = "generic-fast-incumbent-v1";
export const FAST_INCUMBENT_POLICY = "single-seed+1pass+2restarts+beam0+rescue0-v1";
export function generateFastIncumbent(lines, config, { seed = 1000, maxSyncPieces = 160 } = {}) {
  if (!Array.isArray(lines) || !lines.length) return { status: "NOT_APPLICABLE", incumbent: null, telemetry: { version: FAST_INCUMBENT_VERSION, policy: FAST_INCUMBENT_POLICY, calls: 0 } };
  const pieces = lines.reduce((s, l) => s + Number(l.cant || 0), 0);
  const indexed = lines.map((l, i) => ({ ...structuredClone(l), ref: i, _refOriginal: l.ref }));
  const result = optimizar(indexed, { ...structuredClone(config), semilla: seed, ruido: .3, pases: 1, restartsPorPlaca: 2, usarRescue: false, maxPiezasBeam: 0, multiVariantes: false });
  return { status: "COMPLETE", incumbent: { placas: result.placas ?? [], calidad: calidadPlanPlacas(result.placas ?? [], config), seed }, telemetry: { version: FAST_INCUMBENT_VERSION, policy: FAST_INCUMBENT_POLICY, calls: 1, pieces, executionClass: pieces <= maxSyncPieces ? "SYNC_CANDIDATE" : "BACKGROUND_CANDIDATE", requiresFallbackCertification: true } };
}

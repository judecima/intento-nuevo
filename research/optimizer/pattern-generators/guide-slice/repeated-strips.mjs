import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { optimizar } = require("../../../../src/lib/optimizer/legacy/motor.cjs");

export const REPEATED_STRIPS_VERSION = "repeated-strips-focused-v1";
export const REPEATED_STRIPS_POLICY = "repeat>=4+narrow<=25%+qty>=50%+focused-full-order-v1";

function legalOrientations(line, config) {
  const base = Number(line.base), height = Number(line.altura);
  const out = [{ base, height, rotated: false }];
  const rotationBlocked = Boolean(config.materialConVeta && line.veta);
  if (!rotationBlocked && Math.abs(base - height) > 1e-9) out.push({ base: height, height: base, rotated: true });
  return out;
}

export function detectRepeatedStrips(lines, config, {
  minRepeat = 4,
  narrowRatio = 0.25,
  minStripTypes = 2,
  minStripQuantityRatio = 0.50,
  maxTypes = 20,
  maxPieces = 160,
} = {}) {
  if (!Array.isArray(lines) || lines.length < 2 || lines.length > maxTypes) return null;
  const totalPieces = lines.reduce((sum, line) => sum + Number(line.cant || 0), 0);
  if (!Number.isSafeInteger(totalPieces) || totalPieces <= 0 || totalPieces > maxPieces) return null;
  const width = Number(config.placaBase) - Number(config.refiladoX || 0);
  const height = Number(config.placaAltura) - Number(config.refiladoY || 0);
  if (!(width > 0 && height > 0)) return null;

  const stripTypes = [];
  let stripQuantity = 0;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const quantity = Number(line.cant);
    if (!Number.isSafeInteger(quantity) || quantity < minRepeat) continue;
    const qualifies = legalOrientations(line, config).some((o) =>
      Math.min(o.base / width, o.height / height) <= narrowRatio + 1e-12
    );
    if (!qualifies) continue;
    stripTypes.push(index);
    stripQuantity += quantity;
  }
  const ratio = stripQuantity / totalPieces;
  if (stripTypes.length < minStripTypes || ratio + 1e-12 < minStripQuantityRatio) return null;
  return { stripTypes, stripQuantity, totalPieces, ratio, narrowRatio, minRepeat };
}

function patternFromPlate(plate, typeCount) {
  const vector = new Array(typeCount).fill(0);
  for (const placement of plate.colocadas ?? []) {
    const type = placement.pieza?.ref;
    if (!Number.isSafeInteger(type) || type < 0 || type >= typeCount) throw new Error("repeated-strips: invalid internal type reference");
    vector[type]++;
  }
  if (!vector.some(Boolean)) return null;
  return {
    uso: new Map(vector.map((count, type) => [type, count]).filter(([, count]) => count > 0)),
    area: plate.colocadas.reduce((sum, placement) => sum + placement.base * placement.altura, 0),
    placa: plate,
  };
}

export function generateRepeatedStripPatterns(lines, config, options = {}) {
  const detection = detectRepeatedStrips(lines, config, options);
  if (!detection) {
    return { status: "NOT_APPLICABLE", patterns: [], telemetry: { version: REPEATED_STRIPS_VERSION, policy: REPEATED_STRIPS_POLICY, calls: 0 } };
  }
  const indexed = lines.map((line, index) => ({ ...structuredClone(line), ref: index, _refOriginal: line.ref }));
  const focused = {
    ...structuredClone(config),
    ruido: 0.3,
    pases: 2,
    restartsPorPlaca: 6,
    usarRescue: false,
    maxPiezasBeam: 0,
    multiVariantes: false,
    semilla: 1000,
  };
  const result = optimizar(indexed, focused);
  const patterns = (result.placas ?? []).map((plate) => patternFromPlate(plate, indexed.length)).filter(Boolean);
  return {
    status: "COMPLETE",
    patterns,
    telemetry: {
      version: REPEATED_STRIPS_VERSION,
      policy: REPEATED_STRIPS_POLICY,
      calls: 1,
      detection,
      focused: { ruido: 0.3, pases: 2, restartsPorPlaca: 6, usarRescue: false, maxPiezasBeam: 0, multiVariantes: false, semilla: 1000 },
      generatedBoards: result.placas?.length ?? 0,
      rootAxes: result.placas?.map((plate) => plate.arbol?.dir ?? null) ?? [],
    },
  };
}

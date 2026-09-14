import { createRequire } from "node:module";
import { digest, freezeDeep } from "./canonical.mjs";
const require = createRequire(import.meta.url);
const { medidaCorte, orientaciones } = require("../../../src/lib/optimizer/legacy/motor.cjs");

export const CONTEXT_VERSION = "b0-context-v1";
export const UNIT_SCALE = 1000; // Exact within the existing XML export precision.

export function toUnits(value, label = "dimension") {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new RangeError(`${label}: invalid dimension`);
  const match = String(value).match(/^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i);
  const fraction = match[2] ?? "";
  let integer = BigInt(match[1] + fraction);
  const shift = 3 + Number(match[3] ?? 0) - fraction.length;
  if (shift >= 0) integer *= 10n ** BigInt(shift);
  else {
    const divisor = 10n ** BigInt(-shift);
    if (integer % divisor !== 0n) throw new RangeError(`${label}: unsupported XML precision (no rounding)`);
    integer /= divisor;
  }
  const result = Number(integer);
  if (!Number.isSafeInteger(result)) throw new RangeError(`${label}: unsafe scaled dimension`);
  return result;
}
export const fromUnits = (value) => value / UNIT_SCALE;

export function createContext(lines, config) {
  if (!Array.isArray(lines) || !lines.length) throw new TypeError("nonempty lines required");
  const opts = {
    placaBase: config.placaBase, placaAltura: config.placaAltura,
    refiladoX: config.refiladoX ?? 0, refiladoY: config.refiladoY ?? 0,
    sierra: config.sierra ?? 0, etapas: config.etapas ?? 4,
    materialConVeta: config.materialConVeta ?? false,
    descontarCanto: config.descontarCanto ?? false, cantoEspesor: config.cantoEspesor ?? 0,
    restoMin: config.restoMin ?? 250, restoMax: config.restoMax ?? 400,
    material: config.material ?? "MATERIAL", thickness: config.thickness ?? 18,
  };
  if (!Number.isSafeInteger(opts.etapas) || opts.etapas < 1 || opts.etapas > 8) throw new RangeError("invalid stages");
  for (const name of ["materialConVeta", "descontarCanto"]) if (typeof opts[name] !== "boolean") throw new TypeError(`invalid ${name}`);
  for (const name of ["placaBase", "placaAltura", "refiladoX", "refiladoY", "sierra", "cantoEspesor", "restoMin", "restoMax", "thickness"]) toUnits(opts[name], name);
  const width = toUnits(opts.placaBase) - toUnits(opts.refiladoX);
  const height = toUnits(opts.placaAltura) - toUnits(opts.refiladoY);
  if (width <= 0 || height <= 0) throw new RangeError("nonpositive usable board");
  const copiedLines = structuredClone(lines);
  const types = copiedLines.map((line, index) => {
    if (!Number.isSafeInteger(line.cant) || line.cant <= 0) throw new RangeError(`type ${index}: invalid demand`);
    const nominalWidth = toUnits(line.base), nominalHeight = toUnits(line.altura);
    if (!nominalWidth || !nominalHeight) throw new RangeError(`type ${index}: nonpositive piece`);
    const e = opts.descontarCanto ? toUnits(opts.cantoEspesor) : 0;
    const cutWidth = nominalWidth - e * (Number(Boolean(line.cantos?.izq)) + Number(Boolean(line.cantos?.der)));
    const cutHeight = nominalHeight - e * (Number(Boolean(line.cantos?.arr)) + Number(Boolean(line.cantos?.aba)));
    if (cutWidth <= 0 || cutHeight <= 0) throw new RangeError(`type ${index}: nonpositive cut dimensions`);
    const expected = medidaCorte(line, opts);
    if (Math.abs(expected.base - fromUnits(cutWidth)) > 1e-6 || Math.abs(expected.altura - fromUnits(cutHeight)) > 1e-6) throw new Error("effective dimensions differ from kernel");
    const orientations = orientaciones({ ...line, _corte: { base: fromUnits(cutWidth), altura: fromUnits(cutHeight) } }, opts.materialConVeta)
      .map((o) => ({ width: toUnits(o.base), height: toUnits(o.altura), rotated: o.rotada }));
    if (!orientations.some((o) => o.width <= width && o.height <= height)) throw new RangeError(`type ${index}: does not fit`);
    const reference = String(line.ref !== undefined && line.ref !== null && line.ref !== "" ? line.ref : index + 1);
    return { index, quantity: line.cant, reference, cutWidth, cutHeight, orientations };
  });
  const data = { version: CONTEXT_VERSION, scale: UNIT_SCALE, opts, lines: copiedLines, types, width, height, kerf: toUnits(opts.sierra) };
  return freezeDeep({ ...data, contextHash: digest(data) });
}

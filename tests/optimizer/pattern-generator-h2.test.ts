import { createRequire } from "node:module";
import { expect, it } from "vitest";
import { parseCanonicalXml } from "@/lib/optimizer/canonical-xml";
import { validateIndependentSlices } from "@/lib/optimizer/validators/independent-slices";
import { readB0PhysicalXml } from "./helpers/b0-xml-roundtrip";
const require = createRequire(import.meta.url);
const { createContext } = require("../../research/optimizer/pattern-generators/context.mjs");
const { generatePatterns } = require("../../research/optimizer/pattern-generators/and-or.mjs");
const { exportPlanCopy } = require("../../research/optimizer/pattern-generators/physical-pattern.mjs");
const { H2_FIXTURES, H2_LIMITS } = require("../../research/optimizer/pattern-generators/h2-fixtures.mjs") as {
  H2_FIXTURES: Array<{ name: string; context: ReturnType<typeof createContext> }>;
  H2_LIMITS: Record<string, number>;
};
const { materializar } = require("../../src/lib/optimizer/legacy/materializar.cjs");
const { validarPlanIndustrial } = require("../../src/lib/optimizer/legacy/validador_industrial_v3.cjs");

it.each(H2_FIXTURES)("H2 generated patterns survive physical XML reimport: $name", ({ context }) => {
  const result = generatePatterns(context, H2_LIMITS, { maxVariantsPerUsageVector: 100000 });
  expect(result.status).toBe("COMPLETE");
  expect(result.patterns.length).toBeGreaterThan(0);
  for (const pattern of result.patterns) {
    // Template coverage is its usage, not the whole order. Keep original type
    // indices when assigning physical IDs, including zero-demand lines.
    const lines = context.lines.map((line: object, type: number) => ({ ...line, cant: pattern.uso.get(type) ?? 0 }));
    const plan = materializar([pattern], lines, context.opts);
    const count = lines.reduce((sum: number, line: { cant: number }) => sum + line.cant, 0);
    expect(plan).not.toBeNull();
    expect(validarPlanIndustrial(plan, count).ok).toBe(true);
    expect(validateIndependentSlices(plan).ok).toBe(true);
    const xml = exportPlanCopy(plan);
    const imported = parseCanonicalXml(xml);
    expect(imported.stats.pieceQuantity).toBe(count);
    const wanted = context.types.filter((t: { index: number }) => pattern.uso.has(t.index)).map(
      (t: { index: number; reference: string; cutWidth: number; cutHeight: number }) =>
        [t.reference, Math.max(t.cutWidth, t.cutHeight) / 1000, Math.min(t.cutWidth, t.cutHeight) / 1000, pattern.uso.get(t.index)]);
    expect(imported.case.pieces.map((p) => [p.reference, p.width, p.height, p.quantity]).sort()).toEqual(wanted.sort());
    const physical = readB0PhysicalXml(xml, context.opts, pattern.placa.arbol.dir);
    expect(physical[0].colocadas.map((p) => [p.x, p.y, p.base, p.altura, p.pieza.ref])).toEqual(
      plan.placas[0].colocadas.map((p: { x: number; y: number; base: number; altura: number; pieza: { _codigoXml: string } }) =>
        [p.x, p.y, p.base, p.altura, p.pieza._codigoXml]));
    for (const placement of plan.placas[0].colocadas) {
      expect(placement._diagPath.at(-1).refFinal).toBe(placement.pieza.tipo);
      expect(placement._diagPath.at(-1).bloque).toEqual({ x: placement.x, y: placement.y, w: placement.base, h: placement.altura });
    }
  }
});

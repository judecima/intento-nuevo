import { createRequire } from "node:module";
import { expect, it } from "vitest";
import { parseCanonicalXml } from "@/lib/optimizer/canonical-xml";
import { validateIndependentSlices } from "@/lib/optimizer/validators/independent-slices";
import { readB0PhysicalXml } from "./helpers/b0-xml-roundtrip";
const require = createRequire(import.meta.url);
const { generatePatterns } = require("../../research/optimizer/pattern-generators/b01/and-or.mjs");
const { exportPlanCopy } = require("../../research/optimizer/pattern-generators/physical-pattern.mjs");
const { H2_FIXTURES, H2_LIMITS } = require("../../research/optimizer/pattern-generators/h2-fixtures.mjs") as {
  H2_FIXTURES: Array<{ name: string; context: any }>; H2_LIMITS: Record<string, number>;
};
const { materializar } = require("../../src/lib/optimizer/legacy/materializar.cjs");
const { validarPlanIndustrial } = require("../../src/lib/optimizer/legacy/validador_industrial_v3.cjs");

it.each(H2_FIXTURES)("B0.1 physical/XML roundtrip: $name", ({ context }) => {
  const result = generatePatterns(context, H2_LIMITS, { maxVariantsPerUsageVector: 100000 });
  expect(result.status).toBe("COMPLETE");
  expect(result.patterns.length).toBeGreaterThan(0);
  for (const pattern of result.patterns) {
    const lines = context.lines.map((line: object, type: number) => ({ ...line, cant: pattern.uso.get(type) ?? 0 }));
    const plan = materializar([pattern], lines, context.opts);
    const count = lines.reduce((sum: number, line: { cant: number }) => sum + line.cant, 0);
    expect(validarPlanIndustrial(plan, count).ok).toBe(true);
    expect(validateIndependentSlices(plan).ok).toBe(true);
    const xml = exportPlanCopy(plan), imported = parseCanonicalXml(xml);
    expect(imported.stats.pieceQuantity).toBe(count);
    const physical = readB0PhysicalXml(xml, context.opts, pattern.placa.arbol.dir);
    expect(physical[0].colocadas.map((p) => [p.x, p.y, p.base, p.altura, p.pieza.ref])).toEqual(
      plan.placas[0].colocadas.map((p: any) => [p.x, p.y, p.base, p.altura, p.pieza._codigoXml]));
    for (const p of plan.placas[0].colocadas) expect(p._diagPath.at(-1).refFinal).toBe(p.pieza.tipo);
  }
});

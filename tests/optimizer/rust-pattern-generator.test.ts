import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";
import { validateIndependentSlices } from "@/lib/optimizer/validators/independent-slices";
import { parseCanonicalXml } from "@/lib/optimizer/canonical-xml";

const require = createRequire(import.meta.url);
const { stableJson } = require("../../research/optimizer/pattern-generators/canonical.mjs");
const { patternContent, orderPatternPool } = require("../../research/optimizer/pattern-generators/ordering.mjs");
const { exportPlanCopy } = require("../../research/optimizer/pattern-generators/physical-pattern.mjs");
const { generatePatterns: generatePatternsJs } = require("../../research/optimizer/pattern-generators/b01/and-or.mjs");
const { generatePatternsRust, isRustPatternGeneratorAvailable } = require(
  "../../research/optimizer/pattern-generators/rust/adapter.mjs",
);
const { H2_FIXTURES, H2_LIMITS } = require("../../research/optimizer/pattern-generators/h2-fixtures.mjs");
const { materializar } = require("../../src/lib/optimizer/legacy/materializar.cjs");
const { validarPlanIndustrial } = require("../../src/lib/optimizer/legacy/validador_industrial_v3.cjs");

const nativeAvailable = isRustPatternGeneratorAvailable();
if (process.env.REQUIRE_RUST_PATTERN_GENERATOR === "1" && !nativeAvailable) {
  throw new Error("Rust pattern generator native addon is required but was not built.");
}

const describeNative = nativeAvailable ? describe : describe.skip;
const K = 100_000;

function canonicalRoots(roots: Array<any>) {
  return [...new Set(roots.map((root) => stableJson({
    rootAxis: root.rootAxis,
    usage: root.usageVector,
    tree: root.cutTree,
  })))].sort();
}

function canonicalPool(patterns: Array<any>, context: any) {
  return orderPatternPool(patterns, context).map((pattern: any) => stableJson(patternContent(pattern)));
}

describeNative("Rust B0.1 pattern generator parity", () => {
  it.each(H2_FIXTURES)("matches JS root grammar exactly: $name", ({ context }: any) => {
    const js = generatePatternsJs(context, H2_LIMITS, { maxVariantsPerUsageVector: K });
    const rust = generatePatternsRust(context, H2_LIMITS, { maxVariantsPerUsageVector: K });

    expect(js.status).toBe("COMPLETE");
    expect(rust.status).toBe("COMPLETE");
    expect(canonicalRoots(rust.roots)).toEqual(canonicalRoots(js.roots));
    expect(rust.failures).toEqual([]);
  });

  it.each(H2_FIXTURES)("materializes the same physical pattern pool: $name", ({ context }: any) => {
    const js = generatePatternsJs(context, H2_LIMITS, { maxVariantsPerUsageVector: K });
    const rust = generatePatternsRust(context, H2_LIMITS, { maxVariantsPerUsageVector: K });

    expect(canonicalPool(rust.patterns, context)).toEqual(canonicalPool(js.patterns, context));

    for (const pattern of rust.patterns) {
      const lines = context.lines.map((line: object, type: number) => ({
        ...line,
        cant: pattern.uso.get(type) ?? 0,
      }));
      const plan = materializar([pattern], lines, context.opts);
      const expected = lines.reduce((sum: number, line: { cant: number }) => sum + line.cant, 0);

      expect(plan).not.toBeNull();
      expect(validarPlanIndustrial(plan, expected).ok).toBe(true);
      expect(validateIndependentSlices(plan).ok).toBe(true);

      const xml = exportPlanCopy(plan);
      const parsed = parseCanonicalXml(xml);
      expect(parsed.stats.pieceQuantity).toBe(expected);
    }
  });

  it("is deterministic across repeated native calls", () => {
    const context = H2_FIXTURES.find((fixture: any) => fixture.name === "two-stages").context;
    const hashes = Array.from({ length: 3 }, () =>
      generatePatternsRust(context, H2_LIMITS, { maxVariantsPerUsageVector: K }).rootHash,
    );
    expect(new Set(hashes).size).toBe(1);
  });

  it("respects a hard work limit without claiming COMPLETE", () => {
    const context = H2_FIXTURES.find((fixture: any) => fixture.name === "two-stages").context;
    const result = generatePatternsRust(
      context,
      { ...H2_LIMITS, maxExpansions: 20 },
      { maxVariantsPerUsageVector: 8 },
    );
    expect(result.status).toBe("WORK_LIMIT");
    expect(result.telemetry.used.expansions).toBeLessThanOrEqual(20);
  });
});

import { detectCommonBand, generateCommonBandPatterns } from "./common-band.mjs";
import { generateGuideSlicePatterns, selectHubType } from "./generator.mjs";
import { detectRepeatedStrips, generateRepeatedStripPatterns } from "./repeated-strips.mjs";
import { detectPartialCommonBand, generatePartialCommonBandPatterns } from "./partial-common-band.mjs";
import { detectWeakRepeatedStrips, generateWeakRepeatedStripPatterns } from "./weak-repeated-strips.mjs";
import { detectLargeRepeatedStrips, generateLargeRepeatedStripPatterns } from "./large-repeated-strips.mjs";
import { detectWeakPartialBand, generateWeakPartialBandPatterns } from "./weak-partial-band.mjs";

export const INDUSTRIAL_PORTFOLIO_VERSION = "industrial-portfolio-v1.5";

export function selectIndustrialMode(lines, config = {}, {
  hubDominance = 0.5,
  maxHubTypes = 8,
  maxCommonBandTypes = 4,
  repeatedStrips = {},
  partialCommonBand = {},
  weakRepeatedStrips = {},
  largeRepeatedStrips = {},
  weakPartialBand = {},
} = {}) {
  const band = detectCommonBand(lines, { maxTypes: maxCommonBandTypes });
  if (band) return { mode: "COMMON_BAND", band };
  if (!Array.isArray(lines) || !lines.length) return { mode: "NOT_APPLICABLE" };
  if (lines.length === 1) return { mode: "NOT_APPLICABLE", reason: "MONOTYPE_EXISTING_PATH" };

  const total = lines.reduce((sum, line) => sum + Number(line.cant || 0), 0);
  if (!(total > 0)) return { mode: "NOT_APPLICABLE" };

  if (lines.length <= maxHubTypes) {
    const hubType = selectHubType(lines), ratio = Number(lines[hubType].cant) / total;
    if (ratio >= hubDominance) return { mode: "GUIDE_HUB", hubType, ratio };
  }

  const strips = detectRepeatedStrips(lines, config, repeatedStrips);
  if (strips) return { mode: "REPEATED_STRIPS", strips };

  const partialBand = detectPartialCommonBand(lines, config, partialCommonBand);
  if (partialBand) return { mode: "PARTIAL_COMMON_BAND", partialBand };

  const weakStrips = detectWeakRepeatedStrips(lines, config, weakRepeatedStrips);
  if (weakStrips) return { mode: "WEAK_REPEATED_STRIPS", weakStrips };

  const largeStrips = detectLargeRepeatedStrips(lines, config, largeRepeatedStrips);
  if (largeStrips) return { mode: "LARGE_REPEATED_STRIPS", largeStrips };

  const weakBand = detectWeakPartialBand(lines, config, weakPartialBand);
  if (weakBand) return { mode: "WEAK_PARTIAL_BAND", weakBand };

  return { mode: "NOT_APPLICABLE" };
}

export function generateIndustrialPortfolio(lines, config, options = {}) {
  const selected = selectIndustrialMode(lines, config, options);

  if (selected.mode === "COMMON_BAND") {
    const result = generateCommonBandPatterns(lines, config, { maxTypes: options.maxCommonBandTypes ?? 4 });
    return { ...result, telemetry: { ...result.telemetry, portfolioVersion: INDUSTRIAL_PORTFOLIO_VERSION, mode: selected.mode } };
  }
  if (selected.mode === "GUIDE_HUB") {
    const result = generateGuideSlicePatterns(lines, config, { hubType: selected.hubType });
    return { status: "COMPLETE", ...result, telemetry: { ...result.telemetry, portfolioVersion: INDUSTRIAL_PORTFOLIO_VERSION, mode: selected.mode, hubRatio: selected.ratio } };
  }
  if (selected.mode === "REPEATED_STRIPS") {
    const result = generateRepeatedStripPatterns(lines, config, options.repeatedStrips ?? {});
    return { ...result, telemetry: { ...result.telemetry, portfolioVersion: INDUSTRIAL_PORTFOLIO_VERSION, mode: selected.mode } };
  }
  if (selected.mode === "PARTIAL_COMMON_BAND") {
    const result = generatePartialCommonBandPatterns(lines, config, options.partialCommonBand ?? {});
    return { ...result, telemetry: { ...result.telemetry, portfolioVersion: INDUSTRIAL_PORTFOLIO_VERSION, mode: selected.mode } };
  }
  if (selected.mode === "WEAK_REPEATED_STRIPS") {
    const result = generateWeakRepeatedStripPatterns(lines, config, options.weakRepeatedStrips ?? {});
    return { ...result, telemetry: { ...result.telemetry, portfolioVersion: INDUSTRIAL_PORTFOLIO_VERSION, mode: selected.mode } };
  }
  if (selected.mode === "LARGE_REPEATED_STRIPS") {
    const result = generateLargeRepeatedStripPatterns(lines, config, options.largeRepeatedStrips ?? {});
    return { ...result, telemetry: { ...result.telemetry, portfolioVersion: INDUSTRIAL_PORTFOLIO_VERSION, mode: selected.mode } };
  }
  if (selected.mode === "WEAK_PARTIAL_BAND") {
    const result = generateWeakPartialBandPatterns(lines, config, options.weakPartialBand ?? {});
    return { ...result, telemetry: { ...result.telemetry, portfolioVersion: INDUSTRIAL_PORTFOLIO_VERSION, mode: selected.mode } };
  }

  return {
    status: "NOT_APPLICABLE",
    patterns: [],
    telemetry: {
      portfolioVersion: INDUSTRIAL_PORTFOLIO_VERSION,
      mode: selected.mode,
      reason: selected.reason ?? null,
      calls: 0,
    },
  };
}

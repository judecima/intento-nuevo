import { detectCommonBand, generateCommonBandPatterns } from "./common-band.mjs";
import { generateGuideSlicePatterns, selectHubType } from "./generator.mjs";
import { detectRepeatedStrips, generateRepeatedStripPatterns } from "./repeated-strips.mjs";

export const INDUSTRIAL_PORTFOLIO_VERSION = "industrial-portfolio-v1.2";

export function selectIndustrialMode(lines, config = {}, {
  hubDominance = 0.5,
  maxHubTypes = 8,
  maxCommonBandTypes = 4,
  repeatedStrips = {},
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
  return { status: "NOT_APPLICABLE", patterns: [], telemetry: { portfolioVersion: INDUSTRIAL_PORTFOLIO_VERSION, mode: selected.mode, reason: selected.reason ?? null, calls: 0 } };
}

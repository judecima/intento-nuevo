import { detectCommonBand, generateCommonBandPatterns } from "./common-band.mjs";
import { generateGuideSlicePatterns, selectHubType } from "./generator.mjs";

export const INDUSTRIAL_PORTFOLIO_VERSION = "industrial-portfolio-v1";

export function selectIndustrialMode(lines, { hubDominance = 0.5, maxHubTypes = 8, maxCommonBandTypes = 4 } = {}) {
  const band = detectCommonBand(lines, { maxTypes: maxCommonBandTypes });
  if (band) return { mode: "COMMON_BAND", band };
  if (!Array.isArray(lines) || !lines.length || lines.length > maxHubTypes) return { mode: "NOT_APPLICABLE" };
  const total = lines.reduce((sum, line) => sum + Number(line.cant || 0), 0);
  if (!(total > 0)) return { mode: "NOT_APPLICABLE" };
  const hubType = selectHubType(lines), ratio = Number(lines[hubType].cant) / total;
  if (ratio >= hubDominance) return { mode: "GUIDE_HUB", hubType, ratio };
  return { mode: "NOT_APPLICABLE", hubType, ratio };
}

export function generateIndustrialPortfolio(lines, config, options = {}) {
  const selected = selectIndustrialMode(lines, options);
  if (selected.mode === "COMMON_BAND") {
    const result = generateCommonBandPatterns(lines, config, { maxTypes: options.maxCommonBandTypes ?? 4 });
    return { ...result, telemetry: { ...result.telemetry, portfolioVersion: INDUSTRIAL_PORTFOLIO_VERSION, mode: selected.mode } };
  }
  if (selected.mode === "GUIDE_HUB") {
    const result = generateGuideSlicePatterns(lines, config, { hubType: selected.hubType });
    return { status: "COMPLETE", ...result, telemetry: { ...result.telemetry, portfolioVersion: INDUSTRIAL_PORTFOLIO_VERSION, mode: selected.mode, hubRatio: selected.ratio } };
  }
  return { status: "NOT_APPLICABLE", patterns: [], telemetry: { portfolioVersion: INDUSTRIAL_PORTFOLIO_VERSION, mode: selected.mode, calls: 0 } };
}

import type { CSSProperties } from "react";
import { DEFAULT_PRIMARY_COLOR, DEFAULT_SECONDARY_COLOR, normalizeHexColor } from "./identity";

type BrandThemeInput = {
  primaryColor?: string | null;
  secondaryColor?: string | null;
};

export type BrandThemeStyle = CSSProperties & Record<`--${string}`, string>;

export function brandThemeStyle(brand: BrandThemeInput): BrandThemeStyle {
  const primary = normalizeHexColor(brand.primaryColor, DEFAULT_PRIMARY_COLOR);
  const secondary = normalizeHexColor(brand.secondaryColor, DEFAULT_SECONDARY_COLOR);
  const primaryContainer = mix(primary, "#ffffff", 0.16);
  const tertiaryContainer = mix(secondary, "#ffffff", 0.28);
  const primaryStrong = mix(primary, "#000000", 0.78);
  const secondaryStrong = mix(secondary, "#000000", 0.78);

  return {
    "--brand-primary": primary,
    "--brand-secondary": secondary,
    "--brand-primary-strong": primaryStrong,
    "--brand-secondary-strong": secondaryStrong,
    "--brand-primary-hover-surface": withAlpha(primary, 0.08),
    "--brand-primary-focus-surface": withAlpha(primary, 0.12),

    "--md-primary": primary,
    "--md-on-primary": contrastText(primary),
    "--md-primary-container": primaryContainer,
    "--md-on-primary-container": contrastText(primaryContainer),
    "--md-primary-fixed-dim": mix(primary, "#ffffff", 0.36),
    "--md-inverse-primary": mix(primary, "#ffffff", 0.34),

    "--md-tertiary": secondary,
    "--md-on-tertiary": contrastText(secondary),
    "--md-tertiary-container": tertiaryContainer,
    "--md-on-tertiary-container": contrastText(tertiaryContainer),

    "--teal": primary,
    "--teal-claro": mix(primary, "#ffffff", 0.8),
    "--teal-suave": primaryContainer,
    "--sierra": secondary,
    "--sierra-fuerte": secondaryStrong,
    "--accent": secondary,

    "--rail": mix(primary, "#000000", 0.24),
    "--rail-soft": mix(primary, "#000000", 0.34),
    "--rail-outline": withAlpha(mix(primary, "#ffffff", 0.5), 0.3),
    "--rail-active": withAlpha(mix(primary, "#ffffff", 0.64), 0.24),
    "--rail-on-active": mix(primary, "#ffffff", 0.18)
  };
}

export function brandThemeCssText(brand: BrandThemeInput): string {
  return Object.entries(brandThemeStyle(brand))
    .map(([property, value]) => `${property}:${value}`)
    .join(";");
}

type Rgb = { r: number; g: number; b: number };

function mix(color: string, target: string, colorWeight: number): string {
  const a = hexToRgb(color);
  const b = hexToRgb(target);
  const weight = clamp01(colorWeight);
  return rgbToHex({
    r: Math.round(a.r * weight + b.r * (1 - weight)),
    g: Math.round(a.g * weight + b.g * (1 - weight)),
    b: Math.round(a.b * weight + b.b * (1 - weight))
  });
}

function withAlpha(color: string, alpha: number): string {
  const { r, g, b } = hexToRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${clamp01(alpha)})`;
}

function contrastText(color: string): "#111111" | "#ffffff" {
  const luminance = relativeLuminance(hexToRgb(color));
  const contrastWithBlack = (luminance + 0.05) / 0.05;
  const contrastWithWhite = 1.05 / (luminance + 0.05);
  return contrastWithWhite >= contrastWithBlack ? "#ffffff" : "#111111";
}

function relativeLuminance({ r, g, b }: Rgb): number {
  const [sr, sg, sb] = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * sr + 0.7152 * sg + 0.0722 * sb;
}

function hexToRgb(color: string): Rgb {
  const hex = color.replace("#", "");
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16)
  };
}

function rgbToHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

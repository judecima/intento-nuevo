export const DEFAULT_BRAND_NAME = "Plan de corte SaaS";
export const DEFAULT_ORGANIZATION_NAME = "Organizacion";
export const DEFAULT_PRIMARY_COLOR = "#12666b";
export const DEFAULT_SECONDARY_COLOR = "#f5b301";

const hexColorPattern = /^#[0-9a-f]{6}$/i;

export type BrandIdentity = {
  name: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string | null;
};

export function normalizeBrandName(value: string | null | undefined, fallback = DEFAULT_BRAND_NAME): string {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

export function normalizeHexColor(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && hexColorPattern.test(trimmed) ? trimmed : fallback;
}

export function normalizeLogoUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

export function normalizeBrandIdentity(
  value: {
    name?: string | null;
    primaryColor?: string | null;
    secondaryColor?: string | null;
    logoUrl?: string | null;
  },
  fallbackName = DEFAULT_BRAND_NAME
): BrandIdentity {
  return {
    name: normalizeBrandName(value.name, fallbackName),
    primaryColor: normalizeHexColor(value.primaryColor, DEFAULT_PRIMARY_COLOR),
    secondaryColor: normalizeHexColor(value.secondaryColor, DEFAULT_SECONDARY_COLOR),
    logoUrl: normalizeLogoUrl(value.logoUrl)
  };
}

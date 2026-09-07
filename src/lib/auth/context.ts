import { cache } from "react";
import { isSupabaseConfigured } from "@/lib/env";
import {
  DEFAULT_BRAND_NAME,
  DEFAULT_PRIMARY_COLOR,
  DEFAULT_SECONDARY_COLOR,
  normalizeBrandIdentity
} from "@/lib/branding/identity";
import type { OrganizationRole } from "@/lib/domain/roles";
import { getRouteScopeFromHeaders } from "@/lib/routing/server";
import { routeScopeFromSlug, type RouteScope } from "@/lib/routing/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Organization = Database["public"]["Tables"]["organizations"]["Row"];
export type PlatformBranding = {
  legalName: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string | null;
};

export const defaultPlatformBranding: PlatformBranding = {
  legalName: DEFAULT_BRAND_NAME,
  primaryColor: DEFAULT_PRIMARY_COLOR,
  secondaryColor: DEFAULT_SECONDARY_COLOR,
  logoUrl: null
};

export type OrganizationMembership = {
  organizationId: string;
  role: OrganizationRole;
  active: boolean;
  organization: Pick<
    Organization,
    "id" | "name" | "slug" | "active" | "primary_color" | "secondary_color" | "delivery_time_days" | "logo_url"
  > | null;
};

export type AppUserContext = {
  supabaseConfigured: boolean;
  routeScope: RouteScope | null;
  routeBasePath: string;
  user: {
    id: string;
    email: string | null;
  } | null;
  profile: Profile | null;
  memberships: OrganizationMembership[];
  activeOrganization: OrganizationMembership["organization"];
  role: OrganizationRole | null;
  /** Super usuario de plataforma: administra organizaciones y membresias. */
  isPlatformAdmin: boolean;
  loadError: string | null;
  platformBranding: PlatformBranding;
};

type MembershipQueryRow = {
  organization_id: string;
  role: OrganizationRole;
  active: boolean;
  organizations: OrganizationMembership["organization"];
};

const emptyContext = (
  supabaseConfigured: boolean,
  loadError: string | null = null,
  routeScope: RouteScope | null = null
): AppUserContext => ({
  supabaseConfigured,
  routeScope,
  routeBasePath: routeScope?.basePath ?? "",
  user: null,
  profile: null,
  memberships: [],
  activeOrganization: null,
  role: null,
  isPlatformAdmin: false,
  loadError,
  platformBranding: defaultPlatformBranding
});

export const getCurrentUserContext = cache(async (scopeSlug?: string): Promise<AppUserContext> => {
  const routeScope = scopeSlug ? routeScopeFromSlug(scopeSlug) : getRouteScopeFromHeaders();

  if (!isSupabaseConfigured()) {
    return emptyContext(false, null, routeScope);
  }

  const supabase = createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    return emptyContext(true, authError?.message ?? null, routeScope);
  }

  const user = {
    id: authData.user.id,
    email: authData.user.email ?? null
  };

  const [profileResult, membershipsResult, platformResult, brandingResult] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    loadMemberships(supabase, user.id),
    supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
    supabase.from("platform_settings").select("legal_name, primary_color, secondary_color, logo_url").eq("id", true).maybeSingle()
  ]);

  const membershipRows = (membershipsResult.data ?? []) as unknown as MembershipQueryRow[];
  const memberships = membershipRows.map((membership) => ({
    organizationId: membership.organization_id,
    role: membership.role,
    active: membership.active,
    organization: membership.organizations
  }));
  const activeMembership = resolveActiveMembership(memberships, routeScope);

  return {
    supabaseConfigured: true,
    routeScope,
    routeBasePath: routeScope?.basePath ?? "",
    user,
    profile: profileResult.data ?? null,
    memberships,
    activeOrganization: activeMembership?.organization ?? null,
    role: activeMembership?.role ?? null,
    isPlatformAdmin: Boolean(platformResult.data),
    // Branding puede no existir todavía en una base que aún no recibió la
    // migración; en ese caso se usan defaults sin bloquear la aplicación.
    loadError: profileResult.error?.message ?? membershipsResult.error?.message ?? null,
    platformBranding: brandingResult.data ? toPlatformBranding(brandingResult.data) : defaultPlatformBranding
  };
});

function toPlatformBranding(value: {
  legal_name: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  logo_url: string | null;
}): PlatformBranding {
  const brand = normalizeBrandIdentity({
    name: value.legal_name,
    primaryColor: value.primary_color,
    secondaryColor: value.secondary_color,
    logoUrl: value.logo_url
  });
  return {
    legalName: brand.name,
    primaryColor: brand.primaryColor,
    secondaryColor: brand.secondaryColor,
    logoUrl: brand.logoUrl
  };
}

function resolveActiveMembership(
  memberships: OrganizationMembership[],
  routeScope: RouteScope | null
): OrganizationMembership | null {
  if (routeScope?.kind === "platform") return null;

  if (routeScope?.kind === "organization") {
    return memberships.find((membership) => membership.organization?.slug === routeScope.slug) ?? null;
  }

  return memberships[0] ?? null;
}

async function loadMemberships(supabase: ReturnType<typeof createSupabaseServerClient>, userId: string) {
  const scoped = supabase
    .from("organization_members")
    .select("organization_id, role, active, organizations(id, name, slug, active, primary_color, secondary_color, delivery_time_days, logo_url)")
    .eq("user_id", userId)
    .eq("active", true);
  const result = await scoped;
  if (!result.error || !/column .* does not exist/i.test(result.error.message)) return result;

  const fallback = await supabase
    .from("organization_members")
    .select("organization_id, role, active, organizations(id, name, slug, active)")
    .eq("user_id", userId)
    .eq("active", true);
  return fallback as unknown as typeof result;
}

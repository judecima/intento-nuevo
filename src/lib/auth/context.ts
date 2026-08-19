import { cache } from "react";
import { isSupabaseConfigured } from "@/lib/env";
import type { OrganizationRole } from "@/lib/domain/roles";
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
  legalName: "Plan de corte SaaS",
  primaryColor: "#12666b",
  secondaryColor: "#f5b301",
  logoUrl: null
};

export type OrganizationMembership = {
  organizationId: string;
  role: OrganizationRole;
  active: boolean;
  organization: Pick<Organization, "id" | "name" | "slug" | "active" | "primary_color" | "secondary_color" | "logo_url"> | null;
};

export type AppUserContext = {
  supabaseConfigured: boolean;
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
  organizations: Pick<Organization, "id" | "name" | "slug" | "active" | "primary_color" | "secondary_color" | "logo_url"> | null;
};

const emptyContext = (
  supabaseConfigured: boolean,
  loadError: string | null = null
): AppUserContext => ({
  supabaseConfigured,
  user: null,
  profile: null,
  memberships: [],
  activeOrganization: null,
  role: null,
  isPlatformAdmin: false,
  loadError,
  platformBranding: defaultPlatformBranding
});

export const getCurrentUserContext = cache(async (): Promise<AppUserContext> => {
  if (!isSupabaseConfigured()) {
    return emptyContext(false);
  }

  const supabase = createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    return emptyContext(true, authError?.message ?? null);
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

  return {
    supabaseConfigured: true,
    user,
    profile: profileResult.data ?? null,
    memberships,
    activeOrganization: memberships[0]?.organization ?? null,
    role: memberships[0]?.role ?? null,
    isPlatformAdmin: Boolean(platformResult.data),
    // Branding puede no existir todavía en una base que aún no recibió la
    // migración; en ese caso se usan defaults sin bloquear la aplicación.
    loadError: profileResult.error?.message ?? membershipsResult.error?.message ?? null,
    platformBranding: brandingResult.data
      ? { legalName: brandingResult.data.legal_name, primaryColor: brandingResult.data.primary_color, secondaryColor: brandingResult.data.secondary_color, logoUrl: brandingResult.data.logo_url }
      : defaultPlatformBranding
  };
});

async function loadMemberships(supabase: ReturnType<typeof createSupabaseServerClient>, userId: string) {
  const scoped = supabase
    .from("organization_members")
    .select("organization_id, role, active, organizations(id, name, slug, active, primary_color, secondary_color, logo_url)")
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

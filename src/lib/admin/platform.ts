import type { AppUserContext } from "@/lib/auth/context";
import { canManagePlatform, platformDomainErrors } from "@/lib/domain/platform";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

type OrganizationRow = Database["public"]["Tables"]["organizations"]["Row"];
type MemberRow = Database["public"]["Tables"]["organization_members"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export type PlatformOrganizationMember = {
  userId: string;
  role: MemberRow["role"];
  active: boolean;
  createdAt: string;
  fullName: string | null;
  email: string | null;
};

export type PlatformOrganization = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  allowCustomerSignup: boolean;
  createdAt: string;
  members: PlatformOrganizationMember[];
  projectCount: number;
  materialCount: number;
};

/**
 * Listado del ABM. La lectura usa service role porque cruza tenants (proyectos
 * y materiales de organizaciones donde el super usuario no es miembro); las
 * escrituras van con la sesion del usuario para que RLS valide `is_platform_admin`.
 */
export async function listPlatformOrganizations(context: AppUserContext): Promise<PlatformOrganization[]> {
  if (!canManagePlatform(context)) {
    throw new Error(platformDomainErrors.forbidden);
  }

  const supabase = createSupabaseAdminClient();
  const [organizationsResult, membersResult] = await Promise.all([
    supabase.from("organizations").select("*").order("created_at", { ascending: true }),
    supabase.from("organization_members").select("*").order("created_at", { ascending: true })
  ]);

  if (organizationsResult.error) {
    throw new Error(`ORGANIZATIONS_QUERY_FAILED: ${organizationsResult.error.message}`);
  }

  if (membersResult.error) {
    throw new Error(`ORGANIZATION_MEMBERS_QUERY_FAILED: ${membersResult.error.message}`);
  }

  const organizations = (organizationsResult.data ?? []) as OrganizationRow[];
  const members = (membersResult.data ?? []) as MemberRow[];
  const userIds = [...new Set(members.map((member) => member.user_id))];

  const profilesById = new Map<string, ProfileRow>();
  if (userIds.length > 0) {
    const { data, error } = await supabase.from("profiles").select("*").in("id", userIds);
    if (error) {
      throw new Error(`PROFILES_QUERY_FAILED: ${error.message}`);
    }
    for (const profile of (data ?? []) as ProfileRow[]) {
      profilesById.set(profile.id, profile);
    }
  }

  const [projectCounts, materialCounts] = await Promise.all([
    countByOrganization(supabase, "projects"),
    countByOrganization(supabase, "materials")
  ]);

  return organizations.map((organization) => ({
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    active: organization.active,
    allowCustomerSignup: organization.allow_customer_signup,
    createdAt: organization.created_at,
    projectCount: projectCounts.get(organization.id) ?? 0,
    materialCount: materialCounts.get(organization.id) ?? 0,
    members: members
      .filter((member) => member.organization_id === organization.id)
      .map((member) => {
        const profile = profilesById.get(member.user_id) ?? null;
        return {
          userId: member.user_id,
          role: member.role,
          active: member.active,
          createdAt: member.created_at,
          fullName: profile?.full_name ?? null,
          email: profile?.email ?? null
        };
      })
  }));
}

/** Cuenta filas por organizacion sin traerlas: solo para mostrar uso en el ABM. */
async function countByOrganization(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  table: "projects" | "materials"
): Promise<Map<string, number>> {
  const { data, error } = await supabase.from(table).select("organization_id");

  if (error) {
    throw new Error(`${table.toUpperCase()}_COUNT_FAILED: ${error.message}`);
  }

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ organization_id: string }>) {
    counts.set(row.organization_id, (counts.get(row.organization_id) ?? 0) + 1);
  }

  return counts;
}

export async function findProfileByEmail(email: string): Promise<ProfileRow | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("profiles").select("*").ilike("email", email).limit(1);

  if (error) {
    throw new Error(`PROFILES_QUERY_FAILED: ${error.message}`);
  }

  return ((data ?? []) as ProfileRow[])[0] ?? null;
}

export async function countOrganizationData(organizationId: string): Promise<number> {
  const supabase = createSupabaseAdminClient();
  const [projects, orders] = await Promise.all([
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("organization_id", organizationId)
  ]);

  if (projects.error) throw new Error(`PROJECTS_COUNT_FAILED: ${projects.error.message}`);
  if (orders.error) throw new Error(`ORDERS_COUNT_FAILED: ${orders.error.message}`);

  return Number(projects.count ?? 0) + Number(orders.count ?? 0);
}

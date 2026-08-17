import type { AppUserContext } from "@/lib/auth/context";
import { adminDomainErrors, canAdminister } from "@/lib/domain/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

export type AdminOrganizationMember = {
  organization_id: string;
  user_id: string;
  role: Database["public"]["Enums"]["organization_role"];
  active: boolean;
  created_at: string;
  profile: Pick<Database["public"]["Tables"]["profiles"]["Row"], "id" | "full_name" | "email" | "phone"> | null;
};

export type AdminMachineProfileRow = Database["public"]["Tables"]["machine_profiles"]["Row"];
export type AuditLogRow = Database["public"]["Tables"]["audit_log"]["Row"];

type OrganizationMemberRow = Database["public"]["Tables"]["organization_members"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export async function listOrganizationMembers(
  context: AppUserContext,
  organizationId: string
): Promise<AdminOrganizationMember[]> {
  assertAdminContext(context, organizationId);

  const supabase = createSupabaseAdminClient();
  const { data: membersData, error: membersError } = await supabase
    .from("organization_members")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (membersError) {
    throw new Error(`ORGANIZATION_MEMBERS_QUERY_FAILED: ${membersError.message}`);
  }

  const members = (membersData ?? []) as OrganizationMemberRow[];
  const userIds = members.map((member) => member.user_id);
  const profilesById = new Map<string, ProfileRow>();

  if (userIds.length > 0) {
    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select("id, full_name, email, phone, created_at, updated_at")
      .in("id", userIds);

    if (profilesError) {
      throw new Error(`PROFILES_QUERY_FAILED: ${profilesError.message}`);
    }

    for (const profile of (profilesData ?? []) as ProfileRow[]) {
      profilesById.set(profile.id, profile);
    }
  }

  return members.map((member) => ({
    ...member,
    profile: profilesById.get(member.user_id) ?? null
  }));
}

export async function listAdminMachineProfiles(
  context: AppUserContext,
  organizationId: string
): Promise<AdminMachineProfileRow[]> {
  assertAdminContext(context, organizationId);

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("machine_profiles")
    .select("*")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`MACHINE_PROFILES_QUERY_FAILED: ${error.message}`);
  }

  return ((data ?? []) as AdminMachineProfileRow[]).map(coerceMachineProfile);
}

export async function listAuditLog(
  context: AppUserContext,
  organizationId: string,
  limit = 120
): Promise<AuditLogRow[]> {
  assertAdminContext(context, organizationId);

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("audit_log")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`${adminDomainErrors.auditQueryFailed}: ${error.message}`);
  }

  return (data ?? []) as AuditLogRow[];
}

function assertAdminContext(context: AppUserContext, organizationId: string) {
  if (
    !context.user ||
    !context.activeOrganization ||
    context.activeOrganization.id !== organizationId ||
    !canAdminister(context.role)
  ) {
    throw new Error(adminDomainErrors.forbidden);
  }
}

function coerceMachineProfile(row: AdminMachineProfileRow): AdminMachineProfileRow {
  return {
    ...row,
    kerf: Number(row.kerf),
    min_piece_width: Number(row.min_piece_width),
    min_piece_height: Number(row.min_piece_height)
  };
}

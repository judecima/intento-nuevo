import { organizationAuthEmail } from "@/lib/auth/organization-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function migrateLegacySingleTenantAuthUser(input: {
  userId: string;
  organizationId: string;
  email: string;
}): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const [{ data: memberships, error: membershipError }, { data: platformAdmin, error: platformError }] =
    await Promise.all([
      admin
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", input.userId)
        .eq("active", true),
      admin.from("platform_admins").select("user_id").eq("user_id", input.userId).maybeSingle()
    ]);

  if (membershipError || platformError || platformAdmin) return false;
  const activeMemberships = memberships ?? [];
  if (activeMemberships.length !== 1 || activeMemberships[0]?.organization_id !== input.organizationId) {
    return false;
  }

  const { error } = await admin.auth.admin.updateUserById(input.userId, {
    email: organizationAuthEmail(input.email, input.organizationId),
    email_confirm: true
  });

  return !error;
}

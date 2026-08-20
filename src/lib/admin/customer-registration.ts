import { organizationAuthEmail } from "@/lib/auth/organization-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function attachCustomerToDefaultOrganization(input: {
  userId: string;
  email: string;
  fullName: string;
}): Promise<boolean> {
  const supabaseAdmin = createSupabaseAdminClient();
  const organizationId = await resolveDefaultOrganizationId();

  if (!organizationId) return false;

  const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
    {
      id: input.userId,
      email: input.email,
      full_name: input.fullName
    },
    { onConflict: "id" }
  );

  if (profileError) return false;

  const { data: existingMember, error: memberLookupError } = await supabaseAdmin
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", input.userId)
    .maybeSingle();

  if (memberLookupError) return false;
  if (existingMember) return true;

  const { error: memberError } = await supabaseAdmin.from("organization_members").insert({
    organization_id: organizationId,
    user_id: input.userId,
    role: "customer",
    active: true
  });

  return !memberError;
}

export async function createOrganizationCustomerAuthUser(input: {
  organizationId: string;
  email: string;
  fullName: string;
  password: string;
}): Promise<{ ok: true; userId: string; authEmail: string } | { ok: false; duplicate: boolean }> {
  const supabaseAdmin = createSupabaseAdminClient();
  const authEmail = organizationAuthEmail(input.email, input.organizationId);
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: authEmail,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      full_name: input.fullName,
      organization_id: input.organizationId,
      tenant_email: input.email
    }
  });

  if (error || !data.user) {
    return { ok: false, duplicate: error?.status === 422 };
  }

  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .upsert({ id: data.user.id, email: input.email, full_name: input.fullName }, { onConflict: "id" });

  if (profileError) {
    return { ok: false, duplicate: false };
  }

  return { ok: true, userId: data.user.id, authEmail };
}

async function resolveDefaultOrganizationId(): Promise<string | null> {
  const supabaseAdmin = createSupabaseAdminClient();
  const organizationSlug = process.env.DEFAULT_ORGANIZATION_SLUG?.trim();
  let query = supabaseAdmin
    .from("organizations")
    .select("id")
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1);

  if (organizationSlug) {
    query = query.eq("slug", organizationSlug);
  }

  const { data, error } = await query.maybeSingle();
  if (error) return null;

  return data?.id ?? null;
}

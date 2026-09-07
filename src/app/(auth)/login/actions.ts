"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/env";
import { migrateLegacySingleTenantAuthUser } from "@/lib/admin/tenant-auth-migration";
import { organizationAuthEmail } from "@/lib/auth/organization-auth";
import { getPublicOrganization } from "@/lib/organizations/public-access";
import { organizationPath, platformPath } from "@/lib/routing/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export async function signInWithPassword(formData: FormData): Promise<void> {
  return signInForPlatform(formData);
}

export async function signInForPlatform(formData: FormData): Promise<void> {
  if (!isSupabaseConfigured()) {
    redirect(platformPath("/login?error=supabase_not_configured"));
  }

  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password")
  });

  if (!parsed.success) {
    redirect(platformPath("/login?error=invalid_input"));
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error || !data.user) {
    redirect(platformPath("/login?error=invalid_credentials"));
  }

  const { data: platformAdmin } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (!platformAdmin) {
    await supabase.auth.signOut();
    redirect(platformPath("/login?error=not_platform_admin"));
  }

  redirect(platformPath("/dashboard"));
}

export async function signInForOrganization(formData: FormData): Promise<void> {
  const slug = String(formData.get("organizationSlug") ?? "").trim().toLowerCase();
  if (!isSupabaseConfigured()) redirect(`/${encodeURIComponent(slug)}/login?error=supabase_not_configured`);

  const organization = await getPublicOrganization(slug).catch(() => null);
  if (!organization) redirect(`/${encodeURIComponent(slug)}/login?error=organization_not_found`);

  const parsed = signInSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) redirect(`/${encodeURIComponent(slug)}/login?error=invalid_input`);

  const supabase = createSupabaseServerClient();
  const authEmail = organizationAuthEmail(parsed.data.email, organization.id);
  const { data: scopedAuthData, error } = await supabase.auth.signInWithPassword({
    email: authEmail,
    password: parsed.data.password
  });
  let authData = scopedAuthData;
  let legacyAuth = false;

  if (error || !authData.user) {
    const legacy = await supabase.auth.signInWithPassword(parsed.data);
    if (legacy.error || !legacy.data.user) redirect(`/${encodeURIComponent(slug)}/login?error=invalid_credentials`);
    authData = legacy.data;
    legacyAuth = true;
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organization.id)
    .eq("user_id", authData.user.id)
    .eq("active", true)
    .maybeSingle();
  if (!membership && !legacyAuth && organization.allowCustomerSignup) {
    const { error: joinError } = await supabase.rpc("join_organization_as_customer", { target_slug: organization.slug });
    if (!joinError) redirect(organizationPath(organization.slug, "/dashboard"));
  }
  if (!membership) {
    await supabase.auth.signOut();
    redirect(`/${encodeURIComponent(slug)}/login?error=not_member`);
  }

  if (legacyAuth) {
    const migrated = await migrateLegacySingleTenantAuthUser({
      userId: authData.user.id,
      organizationId: organization.id,
      email: parsed.data.email
    });
    if (!migrated) {
      await supabase.auth.signOut();
      redirect(`/${encodeURIComponent(slug)}/login?error=tenant_password_required`);
    }

    const refreshed = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: parsed.data.password
    });
    if (refreshed.error || !refreshed.data.user) {
      await supabase.auth.signOut();
      redirect(`/${encodeURIComponent(slug)}/login?error=invalid_credentials`);
    }
  }

  redirect(organizationPath(organization.slug, "/dashboard"));
}

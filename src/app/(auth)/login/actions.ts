"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/env";
import { getPublicOrganization } from "@/lib/organizations/public-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export async function signInWithPassword(formData: FormData): Promise<void> {
  if (!isSupabaseConfigured()) {
    redirect("/login?error=supabase_not_configured");
  }

  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password")
  });

  if (!parsed.success) {
    redirect("/login?error=invalid_input");
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    redirect("/login?error=invalid_credentials");
  }

  redirect("/dashboard");
}

export async function signInForOrganization(formData: FormData): Promise<void> {
  const slug = String(formData.get("organizationSlug") ?? "").trim().toLowerCase();
  const organization = await getPublicOrganization(slug).catch(() => null);
  if (!organization) redirect(`/${encodeURIComponent(slug)}/login?error=organization_not_found`);

  const parsed = signInSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) redirect(`/${encodeURIComponent(slug)}/login?error=invalid_input`);

  const supabase = createSupabaseServerClient();
  const { data: authData, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !authData.user) redirect(`/${encodeURIComponent(slug)}/login?error=invalid_credentials`);

  const [{ data: membership }, { data: platformAdmin }] = await Promise.all([
    supabase.from("organization_members").select("user_id").eq("organization_id", organization.id).eq("user_id", authData.user.id).eq("active", true).maybeSingle(),
    supabase.from("platform_admins").select("user_id").eq("user_id", authData.user.id).maybeSingle()
  ]);
  if (!membership && !platformAdmin && organization.allowCustomerSignup) {
    const { error: joinError } = await supabase.rpc("join_organization_as_customer", { target_slug: organization.slug });
    if (!joinError) redirect("/dashboard");
  }
  if (!membership && !platformAdmin) {
    await supabase.auth.signOut();
    redirect(`/${encodeURIComponent(slug)}/login?error=not_member`);
  }

  redirect("/dashboard");
}

"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { attachCustomerToDefaultOrganization } from "@/lib/admin/customer-registration";
import { isSupabaseServerConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const signUpSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128)
});

export async function signUpCustomerWithPassword(formData: FormData): Promise<void> {
  if (!isRegistrationConfigured()) {
    redirect("/register?error=supabase_not_configured");
  }

  const parsed = signUpSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password")
  });

  if (!parsed.success) {
    redirect("/register?error=invalid_input");
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        full_name: parsed.data.fullName
      }
    }
  });

  if (error || !data.user) {
    redirect("/register?error=register_failed");
  }

  const attached = await attachCustomerToDefaultOrganization({
    userId: data.user.id,
    email: parsed.data.email,
    fullName: parsed.data.fullName
  });

  if (!attached) {
    redirect("/register?error=organization_missing");
  }

  redirect("/login?notice=registered");
}

/** Registro usado por las rutas tenant: nunca depende de una organización por defecto. */
export async function signUpCustomerForOrganization(formData: FormData): Promise<void> {
  const scopedForm = new FormData();
  scopedForm.set("slug", String(formData.get("organizationSlug") ?? ""));
  scopedForm.set("fullName", String(formData.get("fullName") ?? ""));
  scopedForm.set("email", String(formData.get("email") ?? ""));
  scopedForm.set("password", String(formData.get("password") ?? ""));

  const { getPublicOrganization } = await import("@/lib/organizations/public-access");
  const organization = await getPublicOrganization(String(scopedForm.get("slug"))).catch(() => null);
  if (!organization) redirect(`/${encodeURIComponent(String(scopedForm.get("slug")))}/register?error=organization_not_found`);

  const supabase = createSupabaseServerClient();
  const parsed = signUpSchema.safeParse({
    fullName: scopedForm.get("fullName"),
    email: scopedForm.get("email"),
    password: scopedForm.get("password")
  });
  if (!parsed.success) redirect(`/${encodeURIComponent(organization.slug)}/register?error=invalid_input`);
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.fullName } }
  });
  if (error || !data.user) redirect(`/${encodeURIComponent(organization.slug)}/register?error=signup_failed`);
  if (!data.session) redirect(`/${encodeURIComponent(organization.slug)}/register?error=confirm_email`);
  const { error: joinError } = await supabase.rpc("join_organization_as_customer", { target_slug: organization.slug });
  if (joinError) redirect(`/${encodeURIComponent(organization.slug)}/register?error=join_failed`);
  redirect("/dashboard");
}

function isRegistrationConfigured(): boolean {
  return isSupabaseServerConfigured();
}

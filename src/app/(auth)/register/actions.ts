"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { attachCustomerToDefaultOrganization, createOrganizationCustomerAuthUser } from "@/lib/admin/customer-registration";
import { isSupabaseServerConfigured } from "@/lib/env";
import { organizationPath } from "@/lib/routing/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const signUpSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
  confirmPassword: z.string().min(8).max(128)
}).refine((value) => value.password === value.confirmPassword, {
  path: ["confirmPassword"],
  message: "PASSWORD_MISMATCH"
});

export async function signUpCustomerWithPassword(formData: FormData): Promise<void> {
  if (!isRegistrationConfigured()) {
    redirect("/register?error=supabase_not_configured");
  }

  const parsed = signUpSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword")
  });

  if (!parsed.success) {
    redirect(`/register?error=${signUpErrorCode(parsed.error)}`);
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
  scopedForm.set("confirmPassword", String(formData.get("confirmPassword") ?? ""));

  const { getPublicOrganization } = await import("@/lib/organizations/public-access");
  const organization = await getPublicOrganization(String(scopedForm.get("slug"))).catch(() => null);
  if (!organization) redirect(`/${encodeURIComponent(String(scopedForm.get("slug")))}/register?error=organization_not_found`);
  if (!isRegistrationConfigured()) redirect(`/${encodeURIComponent(organization.slug)}/register?error=supabase_not_configured`);

  const parsed = signUpSchema.safeParse({
    fullName: scopedForm.get("fullName"),
    email: scopedForm.get("email"),
    password: scopedForm.get("password"),
    confirmPassword: scopedForm.get("confirmPassword")
  });
  if (!parsed.success) {
    redirect(`/${encodeURIComponent(organization.slug)}/register?error=${signUpErrorCode(parsed.error)}`);
  }

  const created = await createOrganizationCustomerAuthUser({
    organizationId: organization.id,
    email: parsed.data.email,
    fullName: parsed.data.fullName,
    password: parsed.data.password
  });
  if (!created.ok) {
    redirect(
      `/${encodeURIComponent(organization.slug)}/register?error=${
        created.duplicate ? "email_taken" : "signup_failed"
      }`
    );
  }

  const supabase = createSupabaseServerClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: created.authEmail,
    password: parsed.data.password
  });
  if (signInError) redirect(`/${encodeURIComponent(organization.slug)}/register?error=signup_failed`);

  const { error: joinError } = await supabase.rpc("join_organization_as_customer", { target_slug: organization.slug });
  if (joinError) redirect(`/${encodeURIComponent(organization.slug)}/register?error=join_failed`);
  redirect(organizationPath(organization.slug, "/dashboard"));
}

function isRegistrationConfigured(): boolean {
  return isSupabaseServerConfigured();
}

function signUpErrorCode(error: z.ZodError): "invalid_input" | "password_mismatch" {
  return error.issues.some((issue) => issue.path[0] === "confirmPassword") ? "password_mismatch" : "invalid_input";
}

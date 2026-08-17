"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getDefaultRouteForRole } from "@/lib/domain/roles";
import { getPublicOrganization } from "@/lib/organizations/public-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const slugSchema = z.string().trim().min(2).max(60);

const signInSchema = z.object({
  slug: slugSchema,
  email: z.string().trim().email(),
  password: z.string().min(1)
});

const signUpSchema = z.object({
  slug: slugSchema,
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128)
});

const joinSchema = z.object({ slug: slugSchema });

/**
 * Entrar por la puerta de la organizacion. No suma al usuario a la
 * organizacion: solo lo autentica y lo manda a su area segun el rol.
 */
export async function signInForOrganizationAction(formData: FormData) {
  const parsed = signInSchema.safeParse({
    slug: field(formData, "slug"),
    email: field(formData, "email"),
    password: field(formData, "password")
  });

  if (!parsed.success) {
    redirect(orgPath(field(formData, "slug"), "invalid_input"));
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password
  });

  if (error) {
    redirect(orgPath(parsed.data.slug, "invalid_credentials"));
  }

  redirect(`/o/${parsed.data.slug}`);
}

/** Alta de cliente: unico rol que se puede auto-registrar. */
export async function signUpCustomerAction(formData: FormData) {
  const parsed = signUpSchema.safeParse({
    slug: field(formData, "slug"),
    fullName: field(formData, "fullName"),
    email: field(formData, "email"),
    password: field(formData, "password")
  });

  if (!parsed.success) {
    redirect(orgPath(field(formData, "slug"), "invalid_input"));
  }

  const organization = await getPublicOrganization(parsed.data.slug);
  if (!organization || !organization.allowCustomerSignup) {
    redirect(orgPath(parsed.data.slug, "signup_disabled"));
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.fullName } }
  });

  if (error) {
    redirect(orgPath(parsed.data.slug, error.status === 422 ? "email_taken" : "signup_failed"));
  }

  // Sin sesion, el proyecto pide confirmar el correo: la membresia se crea
  // sola en el primer ingreso a la ruta de la organizacion.
  if (!data.session) {
    redirect(orgPath(parsed.data.slug, "confirm_email"));
  }

  const { error: joinError } = await supabase.rpc("join_organization_as_customer", {
    target_slug: parsed.data.slug
  });

  if (joinError) {
    redirect(orgPath(parsed.data.slug, "join_failed"));
  }

  redirect(getDefaultRouteForRole("customer"));
}

/** Un usuario ya autenticado se suma como cliente a esta organizacion. */
export async function joinOrganizationAction(formData: FormData) {
  const parsed = joinSchema.safeParse({ slug: field(formData, "slug") });

  if (!parsed.success) {
    redirect(orgPath(field(formData, "slug"), "invalid_input"));
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.rpc("join_organization_as_customer", {
    target_slug: parsed.data.slug
  });

  if (error) {
    redirect(orgPath(parsed.data.slug, "join_failed"));
  }

  redirect(getDefaultRouteForRole("customer"));
}

function orgPath(slug: string, notice?: string) {
  const safeSlug = encodeURIComponent(slug.trim().toLowerCase());
  return notice ? `/o/${safeSlug}?notice=${notice}` : `/o/${safeSlug}`;
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

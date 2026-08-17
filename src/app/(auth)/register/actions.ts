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

function isRegistrationConfigured(): boolean {
  return isSupabaseServerConfigured();
}

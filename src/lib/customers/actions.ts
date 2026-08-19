"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserContext } from "@/lib/auth/context";
import { canAdminister } from "@/lib/domain/admin";

const customerSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  phone: z.string().trim().min(3).max(40),
  address: z.string().trim().max(240).optional().default("")
});

export async function createCustomerAction(formData: FormData) {
  const context = await getCurrentUserContext();
  if (!context.user || !context.activeOrganization || !(context.role === "seller" || canAdminister(context.role))) {
    redirect("/sales/customers?notice=customer_forbidden");
  }

  const parsed = customerSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    address: String(formData.get("address") ?? "")
  });
  if (!parsed.success) redirect("/sales/customers?notice=customer_invalid");

  const admin = createSupabaseAdminClient();
  const { data: existingProfiles, error: lookupError } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", parsed.data.email)
    .limit(1);
  if (lookupError) redirect("/sales/customers?notice=customer_save_failed");

  let userId = existingProfiles?.[0]?.id;
  if (!userId) {
    const temporaryPassword = randomBytes(30).toString("base64url");
    const { data, error } = await admin.auth.admin.createUser({
      email: parsed.data.email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { full_name: parsed.data.fullName }
    });
    if (error || !data.user) redirect("/sales/customers?notice=customer_save_failed");
    userId = data.user.id;
  }

  const { data: existingMembership, error: membershipLookupError } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", context.activeOrganization.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (membershipLookupError || (existingMembership && existingMembership.role !== "customer")) {
    redirect("/sales/customers?notice=customer_already_staff");
  }

  const { error: profileError } = await admin.from("profiles").upsert({
    id: userId,
    full_name: parsed.data.fullName,
    email: parsed.data.email,
    phone: parsed.data.phone,
    address: parsed.data.address || null
  }, { onConflict: "id" });
  if (profileError) redirect("/sales/customers?notice=customer_save_failed");

  const { error: memberError } = await admin.from("organization_members").upsert({
    organization_id: context.activeOrganization.id,
    user_id: userId,
    role: "customer",
    active: true
  }, { onConflict: "organization_id,user_id" });
  if (memberError) redirect("/sales/customers?notice=customer_save_failed");

  revalidatePath("/sales/customers");
  revalidatePath("/projects/new");
  redirect("/sales/customers?notice=customer_created");
}

"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { organizationAuthEmail } from "@/lib/auth/organization-auth";
import { findOrganizationProfileByEmail } from "@/lib/admin/platform";
import { scopedPath } from "@/lib/routing/server";
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
    redirect(customerNoticePath("customer_forbidden"));
  }

  const parsed = customerSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    address: String(formData.get("address") ?? "")
  });
  if (!parsed.success) redirect(customerNoticePath("customer_invalid"));

  const admin = createSupabaseAdminClient();
  let existingProfile: Awaited<ReturnType<typeof findOrganizationProfileByEmail>>;
  try {
    existingProfile = await findOrganizationProfileByEmail(context.activeOrganization.id, parsed.data.email);
  } catch {
    redirect(customerNoticePath("customer_save_failed"));
  }

  let userId = existingProfile?.id;
  if (!userId) {
    const temporaryPassword = randomBytes(30).toString("base64url");
    const { data, error } = await admin.auth.admin.createUser({
      email: organizationAuthEmail(parsed.data.email, context.activeOrganization.id),
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        full_name: parsed.data.fullName,
        organization_id: context.activeOrganization.id,
        tenant_email: parsed.data.email
      }
    });
    if (error || !data.user) redirect(customerNoticePath("customer_save_failed"));
    userId = data.user.id;
  }

  const { data: existingMembership, error: membershipLookupError } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", context.activeOrganization.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (membershipLookupError || (existingMembership && existingMembership.role !== "customer")) {
    redirect(customerNoticePath("customer_already_staff"));
  }

  const { error: profileError } = await admin.from("profiles").upsert({
    id: userId,
    full_name: parsed.data.fullName,
    email: parsed.data.email,
    phone: parsed.data.phone,
    address: parsed.data.address || null
  }, { onConflict: "id" });
  if (profileError) redirect(customerNoticePath("customer_save_failed"));

  const { error: memberError } = await admin.from("organization_members").upsert({
    organization_id: context.activeOrganization.id,
    user_id: userId,
    role: "customer",
    active: true
  }, { onConflict: "organization_id,user_id" });
  if (memberError) redirect(customerNoticePath("customer_save_failed"));

  revalidatePath("/sales/customers");
  revalidatePath("/projects/new");
  redirect(customerNoticePath("customer_created"));
}

function customerNoticePath(notice: string): string {
  return `${scopedPath("/sales/customers")}?notice=${encodeURIComponent(notice)}`;
}

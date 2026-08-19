"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUserContext } from "@/lib/auth/context";
import { canAdminister } from "@/lib/domain/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const brandingSchema = z.object({
  organizationId: z.string().uuid(),
  primaryColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  secondaryColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  removeLogo: z.string().optional()
});

const platformBrandingSchema = z.object({
  legalName: z.string().trim().min(2).max(160),
  primaryColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  secondaryColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  removeLogo: z.string().optional()
});

const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

export async function updateOrganizationBrandingAction(formData: FormData) {
  const parsed = brandingSchema.safeParse({
    organizationId: formData.get("organizationId"),
    primaryColor: formData.get("primaryColor"),
    secondaryColor: formData.get("secondaryColor"),
    removeLogo: formData.get("removeLogo") ?? undefined
  });
  if (!parsed.success) redirect("/admin/settings?notice=branding_invalid");

  const context = await getCurrentUserContext();
  const canEdit = context.isPlatformAdmin || (
    context.activeOrganization?.id === parsed.data.organizationId && canAdminister(context.role)
  );
  if (!context.user || !canEdit) redirect("/admin/settings?notice=branding_forbidden");

  const admin = createSupabaseAdminClient();
  const file = formData.get("logo");
  let logoUrl: string | null | undefined;
  if (file instanceof File && file.size > 0) {
    if (!allowedTypes.has(file.type) || file.size > 2 * 1024 * 1024) redirect("/admin/settings?notice=branding_file_invalid");
    const extension = file.type === "image/svg+xml" ? "svg" : file.type.split("/")[1];
    const path = `${parsed.data.organizationId}/logo.${extension}`;
    const { error: uploadError } = await admin.storage.from("organization-branding").upload(path, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: "3600"
    });
    if (uploadError) redirect("/admin/settings?notice=branding_save_failed");
    logoUrl = admin.storage.from("organization-branding").getPublicUrl(path).data.publicUrl;
  } else if (parsed.data.removeLogo) {
    logoUrl = null;
  }

  const update: {
    primary_color: string;
    secondary_color: string;
    logo_url?: string | null;
  } = {
    primary_color: parsed.data.primaryColor,
    secondary_color: parsed.data.secondaryColor
  };
  if (logoUrl !== undefined) update.logo_url = logoUrl;

  const { error } = await admin.from("organizations").update(update).eq("id", parsed.data.organizationId);
  if (error) redirect("/admin/settings?notice=branding_save_failed");

  revalidatePath("/admin/settings");
  revalidatePath("/admin/organizations");
  revalidatePath("/dashboard");
  redirect("/admin/settings?notice=branding_saved");
}

export async function updatePlatformBrandingAction(formData: FormData) {
  const parsed = platformBrandingSchema.safeParse({
    legalName: String(formData.get("legalName") ?? "").trim(),
    primaryColor: String(formData.get("primaryColor") ?? "#12666b").trim(),
    secondaryColor: String(formData.get("secondaryColor") ?? "#f5b301").trim(),
    removeLogo: formData.get("removeLogo") ?? undefined
  });
  if (!parsed.success) {
    const hasInvalidName = parsed.error.issues.some((issue) => issue.path[0] === "legalName");
    redirect(`/admin/settings?notice=${hasInvalidName ? "platform_branding_name_invalid" : "platform_branding_invalid"}`);
  }

  const context = await getCurrentUserContext();
  if (!context.user || !context.isPlatformAdmin) redirect("/admin/settings?notice=branding_forbidden");

  const admin = createSupabaseAdminClient();
  const file = formData.get("logo");
  let logoUrl: string | null | undefined;
  if (file instanceof File && file.size > 0) {
    if (!allowedTypes.has(file.type) || file.size > 2 * 1024 * 1024) redirect("/admin/settings?notice=branding_file_invalid");
    const extension = file.type === "image/svg+xml" ? "svg" : file.type.split("/")[1];
    const path = `platform/logo.${extension}`;
    const { error } = await admin.storage.from("organization-branding").upload(path, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
    if (error) redirect("/admin/settings?notice=platform_branding_save_failed");
    logoUrl = admin.storage.from("organization-branding").getPublicUrl(path).data.publicUrl;
  } else if (parsed.data.removeLogo) {
    logoUrl = null;
  }

  const update: { legal_name: string; primary_color: string; secondary_color: string; logo_url?: string | null; updated_at: string } = {
    legal_name: parsed.data.legalName,
    primary_color: parsed.data.primaryColor,
    secondary_color: parsed.data.secondaryColor,
    updated_at: new Date().toISOString()
  };
  if (logoUrl !== undefined) update.logo_url = logoUrl;
  const { data: saved, error } = await admin
    .from("platform_settings")
    .upsert({ id: true, ...update }, { onConflict: "id" })
    .select("id")
    .maybeSingle();
  if (error || !saved) redirect("/admin/settings?notice=platform_branding_migration_required");
  revalidatePath("/admin/settings");
  revalidatePath("/dashboard");
  revalidatePath("/", "layout");
  redirect("/admin/settings?notice=platform_branding_saved");
}

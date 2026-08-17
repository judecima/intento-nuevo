"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/auth/context";
import {
  adminDomainErrors,
  canAdminister,
  createStaffMemberSchema,
  createMachineProfileSchema,
  updateMachineProfileSchema,
  updateMemberSchema,
  type CreateStaffMemberCommand
} from "@/lib/domain/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

export async function createOrganizationMemberAction(formData: FormData) {
  const returnTo = safeAdminReturnPath(stringField(formData, "returnTo"), "/admin/users");
  const parsed = createStaffMemberSchema.safeParse({
    organizationId: stringField(formData, "organizationId"),
    fullName: stringField(formData, "fullName"),
    email: stringField(formData, "email"),
    password: stringField(formData, "password"),
    role: stringField(formData, "role"),
    comment: stringField(formData, "comment")
  });

  if (!parsed.success) {
    redirect(withNotice(returnTo, adminDomainErrors.invalidInput));
  }

  const context = await getCurrentUserContext();
  if (
    !context.user ||
    !context.activeOrganization ||
    context.activeOrganization.id !== parsed.data.organizationId ||
    !canAdminister(context.role)
  ) {
    redirect(withNotice(returnTo, adminDomainErrors.forbidden));
  }

  let userId: string;
  try {
    userId = await resolveOrCreateStaffUser(parsed.data);
  } catch {
    redirect(withNotice(returnTo, adminDomainErrors.authUserCreateFailed));
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_upsert_organization_member", {
    target_organization_id: parsed.data.organizationId,
    target_user_id: userId,
    new_role: parsed.data.role,
    new_active: true,
    change_comment: parsed.data.comment || null
  });

  revalidateAdminPaths();

  if (error) {
    redirect(withNotice(returnTo, adminNoticeFromError(error.message, adminDomainErrors.memberCreateFailed)));
  }

  redirect(withNotice(returnTo, "member_created"));
}

export async function updateOrganizationMemberAction(formData: FormData) {
  const returnTo = safeAdminReturnPath(stringField(formData, "returnTo"), "/admin/users");
  const parsed = updateMemberSchema.safeParse({
    organizationId: stringField(formData, "organizationId"),
    userId: stringField(formData, "userId"),
    role: stringField(formData, "role"),
    active: stringField(formData, "active"),
    comment: stringField(formData, "comment")
  });

  if (!parsed.success) {
    redirect(withNotice(returnTo, adminDomainErrors.invalidInput));
  }

  const context = await getCurrentUserContext();
  if (
    !context.user ||
    !context.activeOrganization ||
    context.activeOrganization.id !== parsed.data.organizationId ||
    !canAdminister(context.role)
  ) {
    redirect(withNotice(returnTo, adminDomainErrors.forbidden));
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_update_organization_member", {
    target_organization_id: parsed.data.organizationId,
    target_user_id: parsed.data.userId,
    new_role: parsed.data.role,
    new_active: parsed.data.active,
    change_comment: parsed.data.comment || null
  });

  revalidateAdminPaths();

  if (error) {
    redirect(withNotice(returnTo, adminNoticeFromError(error.message, adminDomainErrors.memberSaveFailed)));
  }

  redirect(withNotice(returnTo, "member_updated"));
}

export async function createMachineProfileAction(formData: FormData) {
  const returnTo = safeAdminReturnPath(stringField(formData, "returnTo"), "/admin/machines");
  const parsed = createMachineProfileSchema.safeParse({
    organizationId: stringField(formData, "organizationId"),
    name: stringField(formData, "name"),
    manufacturer: stringField(formData, "manufacturer"),
    model: stringField(formData, "model"),
    xmlFormat: stringField(formData, "xmlFormat") || "legacy_project_xml",
    kerf: stringField(formData, "kerf"),
    minPieceWidth: stringField(formData, "minPieceWidth"),
    minPieceHeight: stringField(formData, "minPieceHeight"),
    configuration: stringField(formData, "configuration") || "{}",
    active: stringField(formData, "active")
  });

  if (!parsed.success) {
    redirect(withNotice(returnTo, adminDomainErrors.invalidInput));
  }

  const context = await getCurrentUserContext();
  if (
    !context.user ||
    !context.activeOrganization ||
    context.activeOrganization.id !== parsed.data.organizationId ||
    !canAdminister(context.role)
  ) {
    redirect(withNotice(returnTo, adminDomainErrors.forbidden));
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_create_machine_profile", {
    target_organization_id: parsed.data.organizationId,
    profile_name: parsed.data.name,
    profile_manufacturer: parsed.data.manufacturer,
    profile_model: parsed.data.model,
    profile_xml_format: parsed.data.xmlFormat,
    profile_kerf: parsed.data.kerf,
    profile_min_piece_width: parsed.data.minPieceWidth,
    profile_min_piece_height: parsed.data.minPieceHeight,
    profile_configuration: toJson(parsed.data.configuration),
    profile_active: parsed.data.active
  });

  revalidateAdminPaths();
  revalidatePath("/production");
  revalidatePath("/production/approved");
  revalidatePath("/production/active");

  if (error) {
    redirect(withNotice(returnTo, adminNoticeFromError(error.message, adminDomainErrors.machineProfileSaveFailed)));
  }

  redirect(withNotice(returnTo, "machine_profile_created"));
}

export async function updateMachineProfileAction(formData: FormData) {
  const returnTo = safeAdminReturnPath(stringField(formData, "returnTo"), "/admin/machines");
  const parsed = updateMachineProfileSchema.safeParse({
    id: stringField(formData, "id"),
    name: stringField(formData, "name"),
    manufacturer: stringField(formData, "manufacturer"),
    model: stringField(formData, "model"),
    xmlFormat: stringField(formData, "xmlFormat") || "legacy_project_xml",
    kerf: stringField(formData, "kerf"),
    minPieceWidth: stringField(formData, "minPieceWidth"),
    minPieceHeight: stringField(formData, "minPieceHeight"),
    configuration: stringField(formData, "configuration") || "{}",
    active: stringField(formData, "active")
  });

  if (!parsed.success) {
    redirect(withNotice(returnTo, adminDomainErrors.invalidInput));
  }

  const context = await getCurrentUserContext();
  if (!context.user || !context.activeOrganization || !canAdminister(context.role)) {
    redirect(withNotice(returnTo, adminDomainErrors.forbidden));
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_update_machine_profile", {
    target_profile_id: parsed.data.id,
    profile_name: parsed.data.name,
    profile_manufacturer: parsed.data.manufacturer,
    profile_model: parsed.data.model,
    profile_xml_format: parsed.data.xmlFormat,
    profile_kerf: parsed.data.kerf,
    profile_min_piece_width: parsed.data.minPieceWidth,
    profile_min_piece_height: parsed.data.minPieceHeight,
    profile_configuration: toJson(parsed.data.configuration),
    profile_active: parsed.data.active
  });

  revalidateAdminPaths();
  revalidatePath("/production");
  revalidatePath("/production/approved");
  revalidatePath("/production/active");

  if (error) {
    redirect(withNotice(returnTo, adminNoticeFromError(error.message, adminDomainErrors.machineProfileSaveFailed)));
  }

  redirect(withNotice(returnTo, "machine_profile_updated"));
}

function revalidateAdminPaths() {
  revalidatePath("/admin/users");
  revalidatePath("/admin/machines");
  revalidatePath("/admin/audit");
}

async function resolveOrCreateStaffUser(command: CreateStaffMemberCommand): Promise<string> {
  const supabaseAdmin = createSupabaseAdminClient();
  const { data: existingProfiles, error: lookupError } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .ilike("email", command.email)
    .limit(1);

  if (lookupError) {
    throw new Error(`${adminDomainErrors.authUserCreateFailed}: ${lookupError.message}`);
  }

  const existingProfile = existingProfiles?.[0];
  if (existingProfile) {
    const { error: profileUpdateError } = await supabaseAdmin
      .from("profiles")
      .update({
        email: command.email,
        full_name: command.fullName
      })
      .eq("id", existingProfile.id);

    if (profileUpdateError) {
      throw new Error(`${adminDomainErrors.authUserCreateFailed}: ${profileUpdateError.message}`);
    }

    return existingProfile.id;
  }

  const { data: createdUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
    email: command.email,
    password: command.password,
    email_confirm: true,
    user_metadata: {
      full_name: command.fullName
    }
  });

  if (createUserError || !createdUser.user) {
    throw new Error(`${adminDomainErrors.authUserCreateFailed}: ${createUserError?.message ?? "missing user"}`);
  }

  const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
    {
      id: createdUser.user.id,
      email: command.email,
      full_name: command.fullName
    },
    { onConflict: "id" }
  );

  if (profileError) {
    throw new Error(`${adminDomainErrors.authUserCreateFailed}: ${profileError.message}`);
  }

  return createdUser.user.id;
}

function adminNoticeFromError(message: string, fallback: string): string {
  for (const code of Object.values(adminDomainErrors)) {
    if (message.includes(code)) return code;
  }
  return fallback;
}

function withNotice(path: string, notice: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}notice=${encodeURIComponent(notice)}`;
}

function safeAdminReturnPath(value: string, fallback: string): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  if (!value.startsWith("/admin")) return fallback;
  return value;
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function stringField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/auth/context";
import {
  canManagePlatform,
  createOrganizationSchema,
  deleteOrganizationSchema,
  linkOrganizationMemberSchema,
  platformDomainErrors,
  removeOrganizationMemberSchema,
  updateOrganizationMemberSchema,
  updateOrganizationSchema
} from "@/lib/domain/platform";
import { countOrganizationData, findProfileByEmail } from "@/lib/admin/platform";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PLATFORM_PATH = "/admin/organizations";

export async function createOrganizationAction(formData: FormData) {
  await assertPlatformAdmin();

  const parsed = createOrganizationSchema.safeParse({
    name: field(formData, "name"),
    slug: field(formData, "slug")
  });

  if (!parsed.success) {
    finish(platformDomainErrors.invalidInput);
  }

  // Escritura con la sesion del usuario: RLS vuelve a exigir is_platform_admin().
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("organizations").insert({
    name: parsed.data.name,
    slug: parsed.data.slug,
    active: true
  });

  if (error) {
    finish(error.code === "23505" ? platformDomainErrors.slugTaken : platformDomainErrors.saveFailed);
  }

  finish("organization_created");
}

export async function copyOrganizationCatalogAction(formData: FormData) {
  await assertPlatformAdmin();

  const targetOrganizationId = field(formData, "targetOrganizationId");
  const sourceOrganizationId = field(formData, "sourceOrganizationId");
  if (!targetOrganizationId || !sourceOrganizationId || targetOrganizationId === sourceOrganizationId) {
    finish(platformDomainErrors.invalidInput);
  }

  const supabase = createSupabaseAdminClient();
  const { count, error: countError } = await supabase
    .from("materials")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", targetOrganizationId);

  if (countError) finish(platformDomainErrors.catalogCopyFailed);
  if ((count ?? 0) > 0) finish(platformDomainErrors.catalogAlreadyExists);

  const { data: sourceMaterials, error: sourceError } = await supabase
    .from("materials")
    .select(
      "external_id, code, code_ext, description, texture_id, type, width, height, thickness, has_grain, price_m2, ref_x, ref_y, min_cut, enabled, image_url, metadata"
    )
    .eq("organization_id", sourceOrganizationId);

  if (sourceError || !sourceMaterials || sourceMaterials.length === 0) {
    finish(platformDomainErrors.catalogCopyFailed);
  }

  const rows = sourceMaterials.map((material) => ({ ...material, organization_id: targetOrganizationId }));
  const { error: insertError } = await supabase.from("materials").insert(rows);

  if (insertError) finish(platformDomainErrors.catalogCopyFailed);
  finish("catalog_copied");
}

export async function updateOrganizationAction(formData: FormData) {
  await assertPlatformAdmin();

  const parsed = updateOrganizationSchema.safeParse({
    organizationId: field(formData, "organizationId"),
    name: field(formData, "name"),
    slug: field(formData, "slug"),
    active: field(formData, "active"),
    allowCustomerSignup: field(formData, "allowCustomerSignup")
  });

  if (!parsed.success) {
    finish(platformDomainErrors.invalidInput);
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("organizations")
    .update({
      name: parsed.data.name,
      slug: parsed.data.slug,
      active: parsed.data.active,
      allow_customer_signup: parsed.data.allowCustomerSignup
    })
    .eq("id", parsed.data.organizationId)
    .select("id")
    .maybeSingle();

  if (error) {
    finish(error.code === "23505" ? platformDomainErrors.slugTaken : platformDomainErrors.saveFailed);
  }

  finish(data ? "organization_saved" : platformDomainErrors.organizationNotFound);
}

export async function deleteOrganizationAction(formData: FormData) {
  await assertPlatformAdmin();

  const parsed = deleteOrganizationSchema.safeParse({
    organizationId: field(formData, "organizationId")
  });

  if (!parsed.success) {
    finish(platformDomainErrors.invalidInput);
  }

  // Borrar arrastraria proyectos y pedidos por cascada: solo se permite si la
  // organizacion todavia no tiene nada cargado.
  const usage = await countOrganizationData(parsed.data.organizationId);
  if (usage > 0) {
    finish(platformDomainErrors.organizationHasData);
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("organizations").delete().eq("id", parsed.data.organizationId);

  if (error) {
    finish(platformDomainErrors.saveFailed);
  }

  finish("organization_deleted");
}

export async function linkOrganizationMemberAction(formData: FormData) {
  await assertPlatformAdmin();

  const parsed = linkOrganizationMemberSchema.safeParse({
    organizationId: field(formData, "organizationId"),
    email: field(formData, "email"),
    fullName: field(formData, "fullName"),
    password: field(formData, "password"),
    role: field(formData, "role")
  });

  if (!parsed.success) {
    finish(platformDomainErrors.invalidInput);
  }

  let userId: string;
  try {
    userId = await resolveOrCreateUser(parsed.data);
  } catch {
    finish(platformDomainErrors.userCreateFailed);
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("organization_members").upsert(
    {
      organization_id: parsed.data.organizationId,
      user_id: userId!,
      role: parsed.data.role,
      active: true
    },
    { onConflict: "organization_id,user_id" }
  );

  if (error) {
    finish(platformDomainErrors.saveFailed);
  }

  finish("member_linked");
}

export async function updateOrganizationMembershipAction(formData: FormData) {
  await assertPlatformAdmin();

  const parsed = updateOrganizationMemberSchema.safeParse({
    organizationId: field(formData, "organizationId"),
    userId: field(formData, "userId"),
    role: field(formData, "role"),
    active: field(formData, "active")
  });

  if (!parsed.success) {
    finish(platformDomainErrors.invalidInput);
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("organization_members")
    .update({ role: parsed.data.role, active: parsed.data.active })
    .eq("organization_id", parsed.data.organizationId)
    .eq("user_id", parsed.data.userId)
    .select("user_id")
    .maybeSingle();

  if (error) {
    finish(platformDomainErrors.saveFailed);
  }

  finish(data ? "member_saved" : platformDomainErrors.memberNotFound);
}

export async function removeOrganizationMembershipAction(formData: FormData) {
  await assertPlatformAdmin();

  const parsed = removeOrganizationMemberSchema.safeParse({
    organizationId: field(formData, "organizationId"),
    userId: field(formData, "userId")
  });

  if (!parsed.success) {
    finish(platformDomainErrors.invalidInput);
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("organization_members")
    .delete()
    .eq("organization_id", parsed.data.organizationId)
    .eq("user_id", parsed.data.userId);

  if (error) {
    finish(platformDomainErrors.saveFailed);
  }

  finish("member_removed");
}

async function assertPlatformAdmin() {
  const context = await getCurrentUserContext();
  if (!context.user || !canManagePlatform(context)) {
    finish(platformDomainErrors.forbidden);
  }
}

/** Busca la persona por email y, si no existe, crea el usuario de autenticacion. */
async function resolveOrCreateUser(command: {
  email: string;
  fullName: string;
  password: string;
}): Promise<string> {
  const existing = await findProfileByEmail(command.email);

  if (existing) {
    if (command.fullName && !existing.full_name) {
      const supabaseAdmin = createSupabaseAdminClient();
      await supabaseAdmin.from("profiles").update({ full_name: command.fullName }).eq("id", existing.id);
    }
    return existing.id;
  }

  if (!command.password || command.password.length < 8 || !command.fullName) {
    throw new Error(platformDomainErrors.userCreateFailed);
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: command.email,
    password: command.password,
    email_confirm: true,
    user_metadata: { full_name: command.fullName }
  });

  if (error || !data.user) {
    throw new Error(platformDomainErrors.userCreateFailed);
  }

  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .upsert({ id: data.user.id, email: command.email, full_name: command.fullName }, { onConflict: "id" });

  if (profileError) {
    throw new Error(platformDomainErrors.userCreateFailed);
  }

  return data.user.id;
}

function finish(notice: string): never {
  revalidatePath(PLATFORM_PATH);
  revalidatePath("/admin/users");
  redirect(`${PLATFORM_PATH}?notice=${encodeURIComponent(notice)}`);
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

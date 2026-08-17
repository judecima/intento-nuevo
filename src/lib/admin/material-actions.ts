"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUserContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { materialKinds } from "@/lib/domain/materials";

const materialSchema = z.object({
  organizationId: z.string().uuid(),
  externalId: z.string().trim().max(120).optional().default(""),
  code: z.string().trim().min(1).max(80),
  codeExt: z.string().trim().max(80).optional().default(""),
  description: z.string().trim().min(2).max(240),
  textureId: z.coerce.number().int().positive().optional(),
  type: z.enum(materialKinds),
  width: z.coerce.number().positive().max(10000),
  height: z.coerce.number().positive().max(10000),
  thickness: z.coerce.number().min(0).max(1000),
  hasGrain: z.coerce.boolean().default(false),
  priceM2: z.coerce.number().min(0).max(1_000_000).default(0),
  refX: z.coerce.number().min(0).max(1000).default(0),
  refY: z.coerce.number().min(0).max(1000).default(0),
  minCut: z.coerce.number().min(0).max(1000).default(0),
  imageUrl: z.string().trim().url().optional().or(z.literal(""))
});

export async function createMaterialAction(formData: FormData) {
  const context = await requireAdmin();
  const parsed = materialSchema.safeParse(readMaterial(formData));
  if (!parsed.success || !isTargetOrganization(context, parsed.data.organizationId)) return redirectNotice("material_invalid");

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("materials").insert(toRow(parsed.data));
  if (error) return redirectNotice(error.code === "23505" ? "material_duplicate" : "material_save_failed");
  return redirectNotice("material_created");
}

export async function updateMaterialAction(formData: FormData) {
  const context = await requireAdmin();
  const materialId = stringField(formData, "materialId");
  const parsed = materialSchema.safeParse(readMaterial(formData));
  if (!parsed.success || !materialId || !isTargetOrganization(context, parsed.data.organizationId)) return redirectNotice("material_invalid");

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("materials").update(toRow(parsed.data)).eq("id", materialId).eq("organization_id", parsed.data.organizationId);
  if (error) return redirectNotice(error.code === "23505" ? "material_duplicate" : "material_save_failed");
  return redirectNotice("material_updated");
}

export async function disableMaterialAction(formData: FormData) {
  const context = await requireAdmin();
  const organizationId = stringField(formData, "organizationId");
  const materialId = stringField(formData, "materialId");
  if (!materialId || !isTargetOrganization(context, organizationId)) return redirectNotice("material_invalid");

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("materials").update({ enabled: false }).eq("id", materialId).eq("organization_id", organizationId);
  if (error) return redirectNotice("material_save_failed");
  return redirectNotice("material_disabled");
}

async function requireAdmin() {
  const context = await getCurrentUserContext();
  if (!context.user || context.role !== "admin" || !context.activeOrganization) throw new Error("FORBIDDEN");
  return context;
}

function isTargetOrganization(context: Awaited<ReturnType<typeof requireAdmin>>, organizationId: string) {
  return context.activeOrganization?.id === organizationId;
}

function readMaterial(formData: FormData) {
  return {
    organizationId: stringField(formData, "organizationId"),
    externalId: stringField(formData, "externalId"),
    code: stringField(formData, "code"),
    codeExt: stringField(formData, "codeExt"),
    description: stringField(formData, "description"),
    textureId: stringField(formData, "textureId") || undefined,
    type: stringField(formData, "type"),
    width: stringField(formData, "width"),
    height: stringField(formData, "height"),
    thickness: stringField(formData, "thickness"),
    hasGrain: formData.get("hasGrain") === "true",
    priceM2: stringField(formData, "priceM2") || "0",
    refX: stringField(formData, "refX") || "0",
    refY: stringField(formData, "refY") || "0",
    minCut: stringField(formData, "minCut") || "0",
    imageUrl: stringField(formData, "imageUrl")
  };
}

function toRow(value: z.infer<typeof materialSchema>) {
  return {
    organization_id: value.organizationId,
    external_id: value.externalId || null,
    code: value.code,
    code_ext: value.codeExt || null,
    description: value.description,
    texture_id: value.textureId ?? null,
    type: value.type,
    width: value.width,
    height: value.height,
    thickness: value.thickness,
    has_grain: value.hasGrain,
    price_m2: value.priceM2,
    ref_x: value.refX,
    ref_y: value.refY,
    min_cut: value.minCut,
    enabled: true,
    image_url: value.imageUrl || null,
    metadata: {}
  };
}

function stringField(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function redirectNotice(notice: string): never {
  redirect(`/admin/materials?notice=${encodeURIComponent(notice)}`);
}

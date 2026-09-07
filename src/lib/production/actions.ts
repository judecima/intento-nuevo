"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUserContext } from "@/lib/auth/context";
import {
  canGenerateMachineXml,
  completeProductionSchema,
  downloadGeneratedFileSchema,
  generateMachineXmlSchema,
  productionDomainErrors,
  safeReturnPath,
  startEdgebandingSchema,
  startProductionSchema
} from "@/lib/domain/production";
import { generateMachineXml } from "@/lib/optimizer";
import { scopedPath } from "@/lib/routing/server";
import {
  PRODUCTION_FILES_BUCKET,
  buildProductionFilePath,
  extractMachineXmlDataFromSnapshot,
  machineProfileToXmlInput,
  sha256Hex
} from "@/lib/production/xml";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/database.types";

type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
type MachineProfileRow = Database["public"]["Tables"]["machine_profiles"]["Row"];
type GeneratedFileInsert = Database["public"]["Tables"]["generated_files"]["Insert"];

export async function startProductionAction(formData: FormData) {
  const parsed = startProductionSchema.parse({
    orderId: stringField(formData, "orderId"),
    expectedOrderVersion: stringField(formData, "expectedOrderVersion"),
    machineProfileId: stringField(formData, "machineProfileId"),
    notes: stringField(formData, "notes"),
    returnTo: stringField(formData, "returnTo") || "/production/approved"
  });
  const returnTo = safeReturnPath(parsed.returnTo);
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.rpc("start_production_job", {
    target_order_id: parsed.orderId,
    expected_order_version: parsed.expectedOrderVersion,
    target_machine_profile_id: parsed.machineProfileId,
    production_notes: parsed.notes || null
  });

  revalidateProductionPaths();

  if (error) {
    redirect(withNotice(returnTo, productionNoticeFromError(error.message)));
  }

  redirect(withNotice("/production/active", "production_started"));
}

export async function completeProductionAction(formData: FormData) {
  const parsed = completeProductionSchema.parse({
    orderId: stringField(formData, "orderId"),
    expectedOrderVersion: stringField(formData, "expectedOrderVersion"),
    notes: stringField(formData, "notes"),
    returnTo: stringField(formData, "returnTo") || "/production/active"
  });
  const returnTo = safeReturnPath(parsed.returnTo);
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.rpc("complete_production_job", {
    target_order_id: parsed.orderId,
    expected_order_version: parsed.expectedOrderVersion,
    production_notes: parsed.notes || null
  });

  revalidateProductionPaths();

  if (error) {
    redirect(withNotice(returnTo, productionNoticeFromError(error.message)));
  }

  redirect(withNotice("/production/completed", "production_completed"));
}

export async function startEdgebandingAction(formData: FormData) {
  const parsed = startEdgebandingSchema.parse({
    orderId: stringField(formData, "orderId"),
    expectedOrderVersion: stringField(formData, "expectedOrderVersion"),
    notes: stringField(formData, "notes"),
    returnTo: stringField(formData, "returnTo") || "/production/active"
  });
  const returnTo = safeReturnPath(parsed.returnTo);
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.rpc("start_edgebanding_job", {
    target_order_id: parsed.orderId,
    expected_order_version: parsed.expectedOrderVersion,
    production_notes: parsed.notes || null
  });

  revalidateProductionPaths();

  if (error) {
    redirect(withNotice(returnTo, productionNoticeFromError(error.message)));
  }

  redirect(withNotice("/production/edgebanding", "production_edgebanding"));
}

export async function generateProductionXmlAction(formData: FormData) {
  const parsed = generateMachineXmlSchema.parse({
    orderId: stringField(formData, "orderId"),
    machineProfileId: stringField(formData, "machineProfileId"),
    returnTo: stringField(formData, "returnTo") || "/production"
  });
  const returnTo = safeReturnPath(parsed.returnTo);
  let notice = "xml_generated";

  try {
    const context = await getCurrentUserContext();
    const supabase = createSupabaseServerClient();
    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", parsed.orderId)
      .maybeSingle();

    if (orderError) throw new Error(orderError.message);
    if (!context.user || !context.activeOrganization || !orderData) {
      throw new Error(productionDomainErrors.orderNotFound);
    }

    const order = orderData as OrderRow;
    if (
      order.organization_id !== context.activeOrganization.id ||
      !canGenerateMachineXml(context.role, order.status)
    ) {
      throw new Error(productionDomainErrors.forbidden);
    }

    const machineProfile = parsed.machineProfileId
      ? await loadMachineProfile(parsed.machineProfileId, order.organization_id)
      : null;
    const xmlData = extractMachineXmlDataFromSnapshot(order.snapshot);
    if (!xmlData) throw new Error(productionDomainErrors.xmlGenerationFailed);

    const xml = generateMachineXml(xmlData.optimizationResult, {
      material: xmlData.material,
      thickness: xmlData.thickness,
      machineProfile: machineProfile ? machineProfileToXmlInput(machineProfile) : undefined
    });
    const checksum = sha256Hex(xml);
    const storagePath = buildProductionFilePath({
      organizationId: order.organization_id,
      orderId: order.id
    });

    const admin = createSupabaseAdminClient();
    const upload = await admin.storage.from(PRODUCTION_FILES_BUCKET).upload(storagePath, xml, {
      contentType: "application/xml",
      upsert: false
    });

    if (upload.error) {
      throw new Error(`${productionDomainErrors.storageUploadFailed}: ${upload.error.message}`);
    }

    const insert: GeneratedFileInsert = {
      organization_id: order.organization_id,
      order_id: order.id,
      optimization_result_id: order.selected_optimization_result_id,
      type: "machine_xml",
      storage_bucket: PRODUCTION_FILES_BUCKET,
      storage_path: storagePath,
      checksum,
      generated_by: context.user.id,
      metadata: toJson({
        machineProfileId: machineProfile?.id ?? null,
        machineProfileName: machineProfile?.name ?? null,
        xmlFormat: machineProfile?.xml_format ?? "legacy_project_xml",
        checksumAlgorithm: "sha256"
      })
    };

    const fileInsert = await admin.from("generated_files").insert(insert).select("id").single();
    if (fileInsert.error) throw new Error(fileInsert.error.message);

    revalidateProductionPaths();
  } catch (error) {
    notice = productionNoticeFromError(error instanceof Error ? error.message : String(error));
  }

  redirect(withNotice(returnTo, notice));
}

export async function downloadGeneratedFileAction(formData: FormData) {
  const parsed = downloadGeneratedFileSchema.parse({
    fileId: stringField(formData, "fileId"),
    returnTo: stringField(formData, "returnTo") || "/production"
  });
  const returnTo = safeReturnPath(parsed.returnTo);
  const context = await getCurrentUserContext();
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("generated_files")
    .select("id, organization_id, order_id, type, storage_bucket, storage_path")
    .eq("id", parsed.fileId)
    .maybeSingle();

  if (error || !data) {
    redirect(withNotice(returnTo, productionDomainErrors.fileNotFound));
  }

  const admin = createSupabaseAdminClient();
  const audit = await admin.from("audit_log").insert({
    organization_id: data.organization_id,
    actor_id: context.user?.id ?? null,
    entity_type: "generated_file",
    entity_id: data.id,
    action: data.type === "machine_xml" ? "xml_downloaded" : "file_downloaded",
    metadata: toJson({
      orderId: data.order_id,
      fileType: data.type
    })
  });

  if (audit.error) {
    redirect(withNotice(returnTo, productionDomainErrors.auditFailed));
  }

  const signed = await admin.storage.from(data.storage_bucket).createSignedUrl(data.storage_path, 60);
  if (signed.error || !signed.data?.signedUrl) {
    redirect(withNotice(returnTo, productionDomainErrors.fileNotFound));
  }

  redirect(signed.data.signedUrl);
}

async function loadMachineProfile(machineProfileId: string, organizationId: string): Promise<MachineProfileRow> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("machine_profiles")
    .select("*")
    .eq("id", machineProfileId)
    .eq("organization_id", organizationId)
    .eq("active", true)
    .maybeSingle();

  if (error || !data) {
    throw new Error(productionDomainErrors.machineProfileNotFound);
  }

  return {
    ...(data as MachineProfileRow),
    kerf: Number(data.kerf),
    min_piece_width: Number(data.min_piece_width),
    min_piece_height: Number(data.min_piece_height)
  };
}

function revalidateProductionPaths() {
  revalidatePath("/production");
  revalidatePath("/production/approved");
  revalidatePath("/production/active");
  revalidatePath("/production/edgebanding");
  revalidatePath("/production/completed");
  revalidatePath("/sales/approved");
  revalidatePath("/orders");
}

function productionNoticeFromError(message: string): string {
  for (const code of Object.values(productionDomainErrors)) {
    if (message.includes(code)) return code;
  }
  return productionDomainErrors.transitionFailed;
}

function withNotice(path: string, notice: string): string {
  const target = scopedPath(path);
  const separator = target.includes("?") ? "&" : "?";
  return `${target}${separator}notice=${encodeURIComponent(notice)}`;
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function stringField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

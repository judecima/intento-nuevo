import { createHash } from "node:crypto";
import type { Json } from "@/lib/supabase/database.types";
import type { MachineProfileInput, OptimizationResult } from "@/lib/optimizer";

export const PRODUCTION_FILES_BUCKET = "production-files";

export type SnapshotMachineXmlData = {
  optimizationResult: OptimizationResult;
  material: string;
  thickness?: number;
};

export function extractMachineXmlDataFromSnapshot(snapshot: Json): SnapshotMachineXmlData | null {
  if (!isRecord(snapshot)) return null;

  const optimizationResultRow = isRecord(snapshot.optimization_result) ? snapshot.optimization_result : null;
  const materialRow = isRecord(snapshot.material) ? snapshot.material : null;
  const resultJson = optimizationResultRow?.result_json;

  if (!isOptimizationResult(resultJson)) return null;

  return {
    optimizationResult: resultJson,
    material: stringValue(materialRow?.description, "MATERIAL"),
    thickness: numberOrUndefined(materialRow?.thickness)
  };
}

export function machineProfileToXmlInput(profile: {
  name: string;
  manufacturer: string | null;
  model: string | null;
  xml_format: string;
  kerf: number;
  configuration: Json;
}): MachineProfileInput {
  return {
    name: profile.name,
    manufacturer: profile.manufacturer ?? undefined,
    model: profile.model ?? undefined,
    xmlFormat: profile.xml_format,
    kerf: Number(profile.kerf),
    configuration: isRecord(profile.configuration) ? profile.configuration : {}
  };
}

export function sha256Hex(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function buildProductionFilePath({
  organizationId,
  orderId,
  createdAt = new Date()
}: {
  organizationId: string;
  orderId: string;
  createdAt?: Date;
}): string {
  const stamp = createdAt.toISOString().replace(/[-:]/g, "").replace(".", "");
  return `${organizationId}/orders/${orderId}/machine_xml/${stamp}.xml`;
}

function isOptimizationResult(value: unknown): value is OptimizationResult {
  return (
    isRecord(value) &&
    typeof value.algorithmVersion === "string" &&
    isRecord(value.raw) &&
    Array.isArray(value.raw.placas) &&
    isRecord(value.raw.opts)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function numberOrUndefined(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

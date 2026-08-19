import type { OrderStatus } from "@/lib/domain/orders";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { OrderRow } from "@/lib/orders/queries";

export type ProductionJobRow = Database["public"]["Tables"]["production_jobs"]["Row"];
export type MachineProfileRow = Database["public"]["Tables"]["machine_profiles"]["Row"];
export type GeneratedFileRow = Database["public"]["Tables"]["generated_files"]["Row"];

export type ProductionOrderItem = {
  order: OrderRow;
  job: ProductionJobRow | null;
  files: GeneratedFileRow[];
};

export type MachineCutSettings = {
  kerf: number;
  trimX: number;
  trimY: number;
  minRemnant: number;
  minCutSize: number;
};

export const fallbackMachineCutSettings: MachineCutSettings = {
  kerf: 4.5,
  trimX: 10,
  trimY: 10,
  minRemnant: 250,
  minCutSize: 50
};

export async function listProductionOrders(
  organizationId: string,
  statuses: OrderStatus[],
): Promise<ProductionOrderItem[]> {
  const supabase = createSupabaseServerClient();
  const { data: ordersData, error: ordersError } = await supabase
    .from("orders")
    .select("*")
    .eq("organization_id", organizationId)
    .in("status", statuses)
    .order("updated_at", { ascending: false });

  if (ordersError) {
    throw new Error(`PRODUCTION_ORDERS_QUERY_FAILED: ${ordersError.message}`);
  }

  const orders = ((ordersData ?? []) as OrderRow[]).map(coerceOrder);
  if (orders.length === 0) return [];

  const orderIds = orders.map((order) => order.id);
  const [jobsResult, filesResult] = await Promise.all([
    supabase.from("production_jobs").select("*").in("order_id", orderIds),
    supabase
      .from("generated_files")
      .select("*")
      .eq("type", "machine_xml")
      .in("order_id", orderIds)
      .order("created_at", { ascending: false })
  ]);

  if (jobsResult.error) throw new Error(`PRODUCTION_JOBS_QUERY_FAILED: ${jobsResult.error.message}`);
  if (filesResult.error) throw new Error(`GENERATED_FILES_QUERY_FAILED: ${filesResult.error.message}`);

  const jobsByOrder = new Map(
    ((jobsResult.data ?? []) as ProductionJobRow[]).map((job) => [job.order_id, coerceProductionJob(job)]),
  );
  const filesByOrder = new Map<string, GeneratedFileRow[]>();
  for (const file of (filesResult.data ?? []) as GeneratedFileRow[]) {
    const current = filesByOrder.get(file.order_id) ?? [];
    current.push(file);
    filesByOrder.set(file.order_id, current);
  }

  return orders.map((order) => ({
    order,
    job: jobsByOrder.get(order.id) ?? null,
    files: filesByOrder.get(order.id) ?? []
  }));
}

export async function listActiveMachineProfiles(organizationId: string): Promise<MachineProfileRow[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("machine_profiles")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`MACHINE_PROFILES_QUERY_FAILED: ${error.message}`);
  }

  return ((data ?? []) as MachineProfileRow[]).map(coerceMachineProfile);
}

export async function getDefaultMachineCutSettings(organizationId: string): Promise<MachineCutSettings> {
  const profiles = await listActiveMachineProfiles(organizationId);
  return profiles.length > 0 ? machineProfileCutSettings(profiles[0]) : fallbackMachineCutSettings;
}

export function machineProfileCutSettings(profile: MachineProfileRow): MachineCutSettings {
  const configuration = isRecord(profile.configuration) ? profile.configuration : {};
  const cutSettings = isRecord(configuration.cutSettings) ? configuration.cutSettings : {};
  return {
    kerf: Number(profile.kerf),
    trimX: numberOrFallback(cutSettings.trimX, fallbackMachineCutSettings.trimX),
    trimY: numberOrFallback(cutSettings.trimY, fallbackMachineCutSettings.trimY),
    minRemnant: numberOrFallback(cutSettings.minRemnant, fallbackMachineCutSettings.minRemnant),
    minCutSize: numberOrFallback(cutSettings.minCutSize, fallbackMachineCutSettings.minCutSize)
  };
}

function coerceOrder(row: OrderRow): OrderRow {
  return {
    ...row,
    version: Number(row.version)
  };
}

function coerceProductionJob(row: ProductionJobRow): ProductionJobRow {
  return {
    ...row
  };
}

function coerceMachineProfile(row: MachineProfileRow): MachineProfileRow {
  return {
    ...row,
    kerf: Number(row.kerf),
    min_piece_width: Number(row.min_piece_width),
    min_piece_height: Number(row.min_piece_height)
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function numberOrFallback(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

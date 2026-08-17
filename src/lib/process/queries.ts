import { getOrderSnapshotSummary, orderStatusLabels, type OrderStatus } from "@/lib/domain/orders";
import { processOrderStatusesForRole, processStageLabels } from "@/lib/domain/process";
import type { OrganizationRole } from "@/lib/domain/roles";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { GeneratedFileRow, ProductionJobRow } from "@/lib/production/queries";
import type { OrderRow } from "@/lib/orders/queries";

type OrderProcessEntryRow = Database["public"]["Tables"]["order_process_entries"]["Row"];
type ProfileRow = Pick<Database["public"]["Tables"]["profiles"]["Row"], "id" | "full_name" | "email">;

export type ProcessOrderRow = {
  orderId: string;
  shortId: string;
  version: number;
  status: OrderStatus;
  statusLabel: string;
  stageLabel: string;
  projectName: string;
  customerName: string;
  customerEmail: string;
  materialDescription: string;
  submittedAt: string;
  updatedAt: string;
  approvedAt: string | null;
  reviewedAt: string | null;
  approvedByName: string;
  operatorName: string;
  productionStartedAt: string | null;
  productionCompletedAt: string | null;
  boardCount: number;
  totalPieces: number;
  itemRows: number;
  cutCount: number;
  utilizationPercentage: number;
  wastePercentage: number;
  sawMeters: number;
  hasMachineXml: boolean;
  process: {
    id: string | null;
    invoiceNumber: string;
    remittanceNumber: string;
    remitted: boolean;
    promisedOn: string | null;
    deadlineOn: string | null;
    cutCompletedOn: string | null;
    edgebandingCompletedOn: string | null;
    deliveredAt: string | null;
    edgeBand045Count: number;
    edgeBand2mmCount: number;
    processNotes: string;
  };
};

export async function listProcessOrders(
  organizationId: string,
  role: OrganizationRole | null
): Promise<ProcessOrderRow[]> {
  const supabase = createSupabaseServerClient();
  const statuses = processOrderStatusesForRole(role);
  if (statuses.length === 0) return [];

  const { data: orderData, error: orderError } = await supabase
    .from("orders")
    .select("*")
    .eq("organization_id", organizationId)
    .in("status", statuses)
    .order("updated_at", { ascending: false });

  if (orderError) {
    throw new Error(`PROCESS_ORDERS_QUERY_FAILED: ${orderError.message}`);
  }

  const orders = ((orderData ?? []) as OrderRow[]).map((order) => ({
    ...order,
    version: Number(order.version)
  }));

  if (orders.length === 0) return [];

  const orderIds = orders.map((order) => order.id);
  const [entriesResult, jobsResult, filesResult] = await Promise.all([
    supabase.from("order_process_entries").select("*").in("order_id", orderIds),
    supabase.from("production_jobs").select("*").in("order_id", orderIds),
    supabase
      .from("generated_files")
      .select("*")
      .eq("type", "machine_xml")
      .in("order_id", orderIds)
      .order("created_at", { ascending: false })
  ]);

  if (entriesResult.error) throw new Error(`PROCESS_ENTRIES_QUERY_FAILED: ${entriesResult.error.message}`);
  if (jobsResult.error) throw new Error(`PROCESS_JOBS_QUERY_FAILED: ${jobsResult.error.message}`);
  if (filesResult.error) throw new Error(`PROCESS_FILES_QUERY_FAILED: ${filesResult.error.message}`);

  const entriesByOrder = new Map(
    ((entriesResult.data ?? []) as OrderProcessEntryRow[]).map((entry) => [entry.order_id, coerceEntry(entry)])
  );
  const jobsByOrder = new Map(
    ((jobsResult.data ?? []) as ProductionJobRow[]).map((job) => [job.order_id, job])
  );
  const xmlByOrder = new Set(((filesResult.data ?? []) as GeneratedFileRow[]).map((file) => file.order_id));
  const profilesById = await loadProfilesById(profileIdsFrom(orders, Array.from(jobsByOrder.values())));

  return orders.map((order) => {
    const summary = getOrderSnapshotSummary(order.snapshot);
    const entry = entriesByOrder.get(order.id) ?? null;
    const job = jobsByOrder.get(order.id) ?? null;
    const approvedBy = profileLabel(profilesById.get(order.approved_by ?? ""));
    const operator = profileLabel(profilesById.get(job?.assigned_operator_id ?? ""));

    return {
      orderId: order.id,
      shortId: order.id.slice(0, 8),
      version: order.version,
      status: order.status,
      statusLabel: orderStatusLabels[order.status],
      stageLabel: processStageLabels[order.status],
      projectName: summary.projectName,
      customerName: summary.customerName,
      customerEmail: summary.customerEmail,
      materialDescription: summary.materialDescription,
      submittedAt: order.submitted_at,
      updatedAt: order.updated_at,
      approvedAt: order.approved_at,
      reviewedAt: order.reviewed_at,
      approvedByName: approvedBy || "Sin aprobacion",
      operatorName: operator || "Sin asignar",
      productionStartedAt: job?.started_at ?? null,
      productionCompletedAt: job?.completed_at ?? null,
      boardCount: summary.boardCount,
      totalPieces: summary.totalPieces,
      itemRows: summary.itemRows,
      cutCount: summary.cutCount,
      utilizationPercentage: summary.utilizationPercentage,
      wastePercentage: summary.wastePercentage,
      sawMeters: summary.sawMeters,
      hasMachineXml: xmlByOrder.has(order.id),
      process: entry
        ? {
            id: entry.id,
            invoiceNumber: entry.invoice_number ?? "",
            remittanceNumber: entry.remittance_number ?? "",
            remitted: entry.remitted,
            promisedOn: entry.promised_on,
            deadlineOn: entry.deadline_on,
            cutCompletedOn: entry.cut_completed_on,
            edgebandingCompletedOn: entry.edgebanding_completed_on,
            deliveredAt: entry.delivered_at,
            edgeBand045Count: Number(entry.edge_band_045_count),
            edgeBand2mmCount: Number(entry.edge_band_2mm_count),
            processNotes: entry.process_notes ?? ""
          }
        : emptyProcess()
    };
  });
}

async function loadProfilesById(ids: string[]): Promise<Map<string, ProfileRow>> {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) return new Map();

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("profiles").select("id, full_name, email").in("id", uniqueIds);

  if (error) {
    throw new Error(`PROCESS_PROFILES_QUERY_FAILED: ${error.message}`);
  }

  return new Map(((data ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]));
}

function profileIdsFrom(orders: OrderRow[], jobs: ProductionJobRow[]): string[] {
  return [
    ...orders.flatMap((order) => [order.reviewed_by, order.approved_by]),
    ...jobs.map((job) => job.assigned_operator_id)
  ].filter((id): id is string => Boolean(id));
}

function profileLabel(profile: ProfileRow | undefined): string {
  if (!profile) return "";
  return profile.full_name || profile.email || profile.id.slice(0, 8);
}

function coerceEntry(entry: OrderProcessEntryRow): OrderProcessEntryRow {
  return {
    ...entry,
    edge_band_045_count: Number(entry.edge_band_045_count),
    edge_band_2mm_count: Number(entry.edge_band_2mm_count)
  };
}

function emptyProcess(): ProcessOrderRow["process"] {
  return {
    id: null,
    invoiceNumber: "",
    remittanceNumber: "",
    remitted: false,
    promisedOn: null,
    deadlineOn: null,
    cutCompletedOn: null,
    edgebandingCompletedOn: null,
    deliveredAt: null,
    edgeBand045Count: 0,
    edgeBand2mmCount: 0,
    processNotes: ""
  };
}

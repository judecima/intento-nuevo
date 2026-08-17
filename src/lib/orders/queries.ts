import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { OrderStatus } from "@/lib/domain/orders";

export type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
export type OrderStatusHistoryRow = Database["public"]["Tables"]["order_status_history"]["Row"];

export async function listCustomerOrders(organizationId: string, customerId: string): Promise<OrderRow[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`ORDERS_QUERY_FAILED: ${error.message}`);
  }

  return ((data ?? []) as OrderRow[]).map(coerceOrderRow);
}

export async function listSalesOrders(organizationId: string, statuses: OrderStatus[]): Promise<OrderRow[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("organization_id", organizationId)
    .in("status", statuses)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`SALES_ORDERS_QUERY_FAILED: ${error.message}`);
  }

  return ((data ?? []) as OrderRow[]).map(coerceOrderRow);
}

export async function getActiveOrderForProject(projectId: string): Promise<OrderRow | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("project_id", projectId)
    .in("status", ["submitted", "under_review", "approved", "production"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`ACTIVE_ORDER_QUERY_FAILED: ${error.message}`);
  }

  return data ? coerceOrderRow(data as OrderRow) : null;
}

export async function listOrderHistory(orderId: string): Promise<OrderStatusHistoryRow[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("order_status_history")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`ORDER_HISTORY_QUERY_FAILED: ${error.message}`);
  }

  return (data ?? []) as OrderStatusHistoryRow[];
}

function coerceOrderRow(row: OrderRow): OrderRow {
  return {
    ...row,
    version: Number(row.version)
  };
}

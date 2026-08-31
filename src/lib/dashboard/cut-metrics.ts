import type { SupabaseClient } from "@supabase/supabase-js";
import { canManagePlatform } from "@/lib/domain/platform";
import { getOrderSnapshotSummary } from "@/lib/domain/orders";
import { isSupabaseServerConfigured } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppUserContext } from "@/lib/auth/context";

const PAGE_SIZE = 1000;
const ARGENTINA_OFFSET_MINUTES = -180;

export type CutMetricsBucket = {
  key: string;
  label: string;
  cutCount: number;
  movementCount: number;
};

export type CutMetricsSummary = {
  todayCuts: number;
  todayMovements: number;
  last7DaysCuts: number;
  last7DaysMovements: number;
  currentWeekCuts: number;
  currentWeekMovements: number;
  last7WeeksCuts: number;
  last7WeeksMovements: number;
};

export type CutDashboardMetrics = {
  daily: CutMetricsBucket[];
  weekly: CutMetricsBucket[];
  summary: CutMetricsSummary;
};

type CutTransitionRow = {
  order_id: string;
  created_at: string;
};

type OrderCutRow = {
  id: string;
  organization_id: string;
  snapshot: unknown;
};

type Supabase = SupabaseClient<Database, "public">;

export async function getCutDashboardMetrics(context: AppUserContext): Promise<CutDashboardMetrics> {
  const todayKey = argentinaDateKey(new Date());
  const daily = buildDailyBuckets(todayKey);
  const weekly = buildWeeklyBuckets(todayKey);
  const empty = buildMetrics(daily, weekly, []);

  if (!context.supabaseConfigured || !context.user) return empty;

  const platformScope = canManagePlatform(context);
  if (!platformScope && !context.activeOrganization?.id) return empty;

  const supabase = platformScope && isSupabaseServerConfigured()
    ? createSupabaseAdminClient()
    : createSupabaseServerClient();
  const organizationId = platformScope ? null : context.activeOrganization?.id ?? null;

  const startIso = argentinaDateStartUtcIso(weekly[0]?.key ?? todayKey);
  const endIso = argentinaDateStartUtcIso(addDaysToDateKey(todayKey, 1));
  const transitions = await listCutTransitions(supabase, startIso, endIso);
  if (transitions.length === 0) return empty;

  const transitionByOrder = uniqueTransitionByOrder(transitions);
  const orders = await listCutOrders(supabase, Array.from(transitionByOrder.keys()), organizationId);
  const completedCuts = orders.map((order) => {
    const transition = transitionByOrder.get(order.id);
    return {
      dateKey: transition ? argentinaDateKey(new Date(transition.created_at)) : todayKey,
      cutCount: getOrderSnapshotSummary(order.snapshot).cutCount
    };
  });

  return buildMetrics(daily, weekly, completedCuts);
}

async function listCutTransitions(supabase: Supabase, startIso: string, endIso: string): Promise<CutTransitionRow[]> {
  const rows: CutTransitionRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("order_status_history")
      .select("order_id, created_at")
      .eq("from_status", "production")
      .in("to_status", ["edgebanding", "completed"])
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`CUT_TRANSITIONS_QUERY_FAILED: ${error.message}`);
    }

    const page = (data ?? []) as CutTransitionRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function listCutOrders(
  supabase: Supabase,
  orderIds: string[],
  organizationId: string | null
): Promise<OrderCutRow[]> {
  const rows: OrderCutRow[] = [];

  for (let index = 0; index < orderIds.length; index += PAGE_SIZE) {
    const chunk = orderIds.slice(index, index + PAGE_SIZE);
    let query = supabase
      .from("orders")
      .select("id, organization_id, snapshot")
      .in("id", chunk);

    if (organizationId) {
      query = query.eq("organization_id", organizationId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`CUT_ORDERS_QUERY_FAILED: ${error.message}`);
    }

    rows.push(...((data ?? []) as OrderCutRow[]));
  }

  return rows;
}

function uniqueTransitionByOrder(rows: CutTransitionRow[]): Map<string, CutTransitionRow> {
  const result = new Map<string, CutTransitionRow>();

  for (const row of rows) {
    if (!result.has(row.order_id)) {
      result.set(row.order_id, row);
    }
  }

  return result;
}

function buildMetrics(
  dailyTemplate: CutMetricsBucket[],
  weeklyTemplate: CutMetricsBucket[],
  completedCuts: Array<{ dateKey: string; cutCount: number }>
): CutDashboardMetrics {
  const daily = dailyTemplate.map((bucket) => ({ ...bucket }));
  const weekly = weeklyTemplate.map((bucket) => ({ ...bucket }));
  const dailyByKey = new Map(daily.map((bucket) => [bucket.key, bucket]));
  const weeklyByKey = new Map(weekly.map((bucket) => [bucket.key, bucket]));

  for (const item of completedCuts) {
    const cutCount = Math.max(0, Math.trunc(item.cutCount));
    const day = dailyByKey.get(item.dateKey);
    const week = weeklyByKey.get(startOfWeekKey(item.dateKey));

    if (day) {
      day.cutCount += cutCount;
      day.movementCount += 1;
    }

    if (week) {
      week.cutCount += cutCount;
      week.movementCount += 1;
    }
  }

  const today = daily[daily.length - 1];
  const currentWeek = weekly[weekly.length - 1];

  return {
    daily,
    weekly,
    summary: {
      todayCuts: today?.cutCount ?? 0,
      todayMovements: today?.movementCount ?? 0,
      last7DaysCuts: sum(daily, "cutCount"),
      last7DaysMovements: sum(daily, "movementCount"),
      currentWeekCuts: currentWeek?.cutCount ?? 0,
      currentWeekMovements: currentWeek?.movementCount ?? 0,
      last7WeeksCuts: sum(weekly, "cutCount"),
      last7WeeksMovements: sum(weekly, "movementCount")
    }
  };
}

function buildDailyBuckets(todayKey: string): CutMetricsBucket[] {
  return Array.from({ length: 7 }, (_, index) => {
    const key = addDaysToDateKey(todayKey, index - 6);
    return {
      key,
      label: shortDateLabel(key),
      cutCount: 0,
      movementCount: 0
    };
  });
}

function buildWeeklyBuckets(todayKey: string): CutMetricsBucket[] {
  const currentWeekStart = startOfWeekKey(todayKey);

  return Array.from({ length: 7 }, (_, index) => {
    const key = addDaysToDateKey(currentWeekStart, (index - 6) * 7);
    const endKey = addDaysToDateKey(key, 6);
    return {
      key,
      label: `${shortDateLabel(key)}-${shortDateLabel(endKey)}`,
      cutCount: 0,
      movementCount: 0
    };
  });
}

function sum<T extends "cutCount" | "movementCount">(buckets: CutMetricsBucket[], key: T): number {
  return buckets.reduce((total, bucket) => total + bucket[key], 0);
}

function argentinaDateKey(date: Date): string {
  const shifted = new Date(date.getTime() + ARGENTINA_OFFSET_MINUTES * 60_000);
  return dateKeyFromUtcParts(shifted);
}

function argentinaDateStartUtcIso(dateKey: string): string {
  const { year, month, day } = parseDateKey(dateKey);
  return new Date(Date.UTC(year, month - 1, day, 3, 0, 0, 0)).toISOString();
}

function startOfWeekKey(dateKey: string): string {
  const date = dateFromDateKey(dateKey);
  const day = date.getUTCDay();
  const daysFromMonday = (day + 6) % 7;
  return addDaysToDateKey(dateKey, -daysFromMonday);
}

function addDaysToDateKey(dateKey: string, amount: number): string {
  const date = dateFromDateKey(dateKey);
  date.setUTCDate(date.getUTCDate() + amount);
  return dateKeyFromUtcParts(date);
}

function shortDateLabel(dateKey: string): string {
  const { month, day } = parseDateKey(dateKey);
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`;
}

function dateFromDateKey(dateKey: string): Date {
  const { year, month, day } = parseDateKey(dateKey);
  return new Date(Date.UTC(year, month - 1, day));
}

function parseDateKey(dateKey: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateKey.split("-").map(Number);
  return { year, month, day };
}

function dateKeyFromUtcParts(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}

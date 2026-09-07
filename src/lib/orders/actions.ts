"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { orderDomainErrors, orderTransitionSchema, submitOrderSchema } from "@/lib/domain/orders";
import { scopedPath } from "@/lib/routing/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/context";

export async function submitProjectOrderAction(formData: FormData) {
  const parsed = submitOrderSchema.parse({
    projectId: stringField(formData, "projectId"),
    optimizationResultId: stringField(formData, "optimizationResultId"),
    expectedProjectVersion: stringField(formData, "expectedProjectVersion"),
    notesCustomer: stringField(formData, "notesCustomer")
  });

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.rpc("submit_project_order", {
    target_project_id: parsed.projectId,
    target_optimization_result_id: parsed.optimizationResultId,
    expected_project_version: parsed.expectedProjectVersion,
    notes_customer: parsed.notesCustomer || null
  });

  revalidateOrderPaths(parsed.projectId);

  if (error) {
    redirect(projectRedirect(parsed.projectId, orderNoticeFromError(error.message)));
  }

  const context = await getCurrentUserContext();
  redirect(scopedPath(context.role === "seller" ? "/sales/orders?notice=order_submitted" : "/orders?notice=order_submitted"));
}

export async function startOrderReviewAction(formData: FormData) {
  const parsed = orderTransitionSchema.parse({
    orderId: stringField(formData, "orderId"),
    expectedOrderVersion: stringField(formData, "expectedOrderVersion"),
    comment: stringField(formData, "comment")
  });

  const notice = await runOrderTransition("start_order_review", parsed);
  redirect(scopedPath(`/sales/review?notice=${encodeURIComponent(notice)}`));
}

export async function requestOrderChangesAction(formData: FormData) {
  const parsed = orderTransitionSchema.parse({
    orderId: stringField(formData, "orderId"),
    expectedOrderVersion: stringField(formData, "expectedOrderVersion"),
    comment: stringField(formData, "comment")
  });

  const notice = await runOrderTransition("request_order_changes", parsed);
  redirect(scopedPath(`/sales/orders?notice=${encodeURIComponent(notice)}`));
}

export async function approveOrderAction(formData: FormData) {
  const parsed = orderTransitionSchema.parse({
    orderId: stringField(formData, "orderId"),
    expectedOrderVersion: stringField(formData, "expectedOrderVersion"),
    comment: stringField(formData, "comment")
  });

  const notice = await runOrderTransition("approve_order", parsed);
  redirect(scopedPath(`/sales/approved?notice=${encodeURIComponent(notice)}`));
}

async function runOrderTransition(
  fn: "start_order_review" | "request_order_changes" | "approve_order",
  parsed: {
    orderId: string;
    expectedOrderVersion: number;
    comment: string;
  },
): Promise<string> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.rpc(fn, {
    target_order_id: parsed.orderId,
    expected_order_version: parsed.expectedOrderVersion,
    transition_comment: parsed.comment || null
  });

  revalidatePath("/orders");
  revalidatePath("/sales/orders");
  revalidatePath("/sales/review");
  revalidatePath("/sales/approved");
  revalidatePath("/production");
  revalidatePath("/production/approved");
  revalidatePath("/projects");

  if (error) {
    return orderNoticeFromError(error.message);
  }

  if (fn === "start_order_review") return "order_under_review";
  if (fn === "request_order_changes") return "order_changes_requested";
  return "order_approved";
}

function revalidateOrderPaths(projectId: string) {
  revalidatePath("/orders");
  revalidatePath("/sales/orders");
  revalidatePath("/sales/review");
  revalidatePath("/sales/approved");
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
}

function orderNoticeFromError(message: string): string {
  for (const code of Object.values(orderDomainErrors)) {
    if (message.includes(code)) return code;
  }
  return orderDomainErrors.transitionFailed;
}

function projectRedirect(projectId: string, notice: string) {
  return scopedPath(`/projects/${projectId}?notice=${encodeURIComponent(notice)}`);
}

function stringField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

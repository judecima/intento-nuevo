"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserContext } from "@/lib/auth/context";
import { orderDomainErrors } from "@/lib/domain/orders";
import {
  canAccessOrderProcess,
  processDomainErrors,
  processEntrySchema,
  processTransitionSchema,
  type ProcessActionId
} from "@/lib/domain/process";
import { productionDomainErrors } from "@/lib/domain/production";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ProcessActionResult = {
  ok: boolean;
  notice: string;
};

export async function saveOrderProcessEntryAction(input: unknown): Promise<ProcessActionResult> {
  const context = await getCurrentUserContext();
  if (!canAccessOrderProcess(context.role)) {
    return failed(processDomainErrors.forbidden);
  }

  const parsed = processEntrySchema.safeParse(input);
  if (!parsed.success) {
    return failed(processDomainErrors.processUpdateFailed);
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.rpc("upsert_order_process_entry", {
    target_order_id: parsed.data.orderId,
    process_invoice_number: parsed.data.invoiceNumber || null,
    process_remittance_number: parsed.data.remittanceNumber || null,
    process_remitted: parsed.data.remitted,
    process_promised_on: parsed.data.promisedOn,
    process_deadline_on: parsed.data.deadlineOn,
    process_cut_completed_on: parsed.data.cutCompletedOn,
    process_edgebanding_completed_on: parsed.data.edgebandingCompletedOn,
    process_edge_band_045_count: parsed.data.edgeBand045Count,
    process_edge_band_2mm_count: parsed.data.edgeBand2mmCount,
    process_notes: parsed.data.processNotes || null
  });

  revalidateProcessPaths();

  if (error) {
    return failed(noticeFromError(error.message, processDomainErrors.processUpdateFailed));
  }

  return { ok: true, notice: "process_saved" };
}

export async function runOrderProcessTransitionAction(input: unknown): Promise<ProcessActionResult> {
  const context = await getCurrentUserContext();
  if (!canAccessOrderProcess(context.role)) {
    return failed(processDomainErrors.forbidden);
  }

  const parsed = processTransitionSchema.safeParse(input);
  if (!parsed.success) {
    return failed(processDomainErrors.transitionFailed);
  }

  const supabase = createSupabaseServerClient();
  const data = parsed.data;
  const error = await runTransitionRpc(data.action, {
    orderId: data.orderId,
    expectedOrderVersion: data.expectedOrderVersion,
    comment: data.comment,
    machineProfileId: data.machineProfileId,
    remittanceNumber: data.remittanceNumber
  });

  revalidateProcessPaths();

  if (error) {
    return failed(noticeFromError(error.message, processDomainErrors.transitionFailed));
  }

  return { ok: true, notice: successNotice(data.action) };

  async function runTransitionRpc(
    action: ProcessActionId,
    values: {
      orderId: string;
      expectedOrderVersion: number;
      comment: string;
      machineProfileId: string | null;
      remittanceNumber: string;
    }
  ) {
    if (action === "approve") {
      return (
        await supabase.rpc("approve_order", {
          target_order_id: values.orderId,
          expected_order_version: values.expectedOrderVersion,
          transition_comment: values.comment || null
        })
      ).error;
    }

    if (action === "start_production") {
      return (
        await supabase.rpc("start_production_job", {
          target_order_id: values.orderId,
          expected_order_version: values.expectedOrderVersion,
          target_machine_profile_id: values.machineProfileId,
          production_notes: values.comment || null
        })
      ).error;
    }

    if (action === "start_edgebanding") {
      return (
        await supabase.rpc("start_edgebanding_job", {
          target_order_id: values.orderId,
          expected_order_version: values.expectedOrderVersion,
          production_notes: values.comment || null
        })
      ).error;
    }

    if (action === "complete_production") {
      return (
        await supabase.rpc("complete_production_job", {
          target_order_id: values.orderId,
          expected_order_version: values.expectedOrderVersion,
          production_notes: values.comment || null
        })
      ).error;
    }

    return (
      await supabase.rpc("deliver_order", {
        target_order_id: values.orderId,
        expected_order_version: values.expectedOrderVersion,
        delivery_notes: values.comment || null,
        delivery_remittance_number: values.remittanceNumber || null
      })
    ).error;
  }
}

function revalidateProcessPaths() {
  revalidatePath("/process");
  revalidatePath("/orders");
  revalidatePath("/sales/orders");
  revalidatePath("/sales/review");
  revalidatePath("/sales/approved");
  revalidatePath("/production");
  revalidatePath("/production/approved");
  revalidatePath("/production/active");
  revalidatePath("/production/edgebanding");
  revalidatePath("/production/completed");
  revalidatePath("/dashboard");
}

function noticeFromError(message: string, fallback: string): string {
  const known = {
    ...orderDomainErrors,
    ...productionDomainErrors,
    ...processDomainErrors
  };
  for (const code of Object.values(known)) {
    if (message.includes(code)) return code;
  }
  return fallback;
}

function successNotice(action: ProcessActionId): string {
  const notices: Record<ProcessActionId, string> = {
    approve: "order_approved",
    start_production: "production_started",
    start_edgebanding: "production_edgebanding",
    complete_production: "production_completed",
    deliver: "order_delivered"
  };
  return notices[action];
}

function failed(notice: string): ProcessActionResult {
  return { ok: false, notice };
}

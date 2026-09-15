import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processNextQueuedOptimizationJob } from "@/lib/optimizations/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const secret = process.env.OPTIMIZER_WORKER_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "OPTIMIZER_WORKER_NOT_CONFIGURED" }, { status: 503 });
  }

  const authorization = request.headers.get("authorization") ?? "";
  const provided = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!safeEqual(provided, secret)) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const outcome = await processNextQueuedOptimizationJob();
    return NextResponse.json({ ok: outcome.status !== "failed", outcome }, {
      headers: { "cache-control": "no-store" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

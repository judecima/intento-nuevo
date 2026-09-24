"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { cancelOptimizationJobAction } from "@/lib/optimizations/job-actions";

export function OptimizationJobWatcher({
  status,
  jobId,
  projectId,
}: {
  status: "queued" | "running";
  jobId: string;
  projectId: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = window.setInterval(refresh, 2500);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);

  return (
    <div className="no-print fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-[var(--r-md)] border border-[var(--line)] bg-white px-4 py-3 text-sm shadow-panel" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>
        {status === "queued" ? "Optimizacion en cola" : "Optimizacion en curso"}
        <span className="block text-[11px] text-[var(--muted)]">La pantalla se actualiza automaticamente.</span>
      </span>
      <form action={cancelOptimizationJobAction}>
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="jobId" value={jobId} />
        <CancelButton />
      </form>
    </div>
  );
}


function CancelButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="btn btn-secondary focus-ring text-xs"
    >
      {pending ? "Cancelando..." : "Cancelar"}
    </button>
  );
}

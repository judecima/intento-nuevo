import type { ReactNode } from "react";
import { OptimizationJobWatcher } from "@/components/optimizer/optimization-job-watcher";
import { getLatestOptimizationAttempt } from "@/lib/optimizations/queries";

export default async function ProjectLayout({
  children,
  params
}: {
  children: ReactNode;
  params: { projectId: string };
}) {
  const attempt = await getLatestOptimizationAttempt(params.projectId);
  const activeStatus = attempt?.status === "queued" || attempt?.status === "running" ? attempt.status : null;

  return (
    <>
      {children}
      {activeStatus && attempt ? (
        <OptimizationJobWatcher
          status={activeStatus}
          jobId={attempt.id}
          projectId={params.projectId}
        />
      ) : null}
    </>
  );
}

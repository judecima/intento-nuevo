import { performance } from "node:perf_hooks";
import { parentPort } from "node:worker_threads";

import { optimizeProject, type OptimizationInput } from "@/lib/optimizer";

interface WorkerRequestMessage {
  id: string;
  input: OptimizationInput;
}

if (!parentPort) {
  throw new Error("OPTIMIZER_WORKER_PARENT_PORT_MISSING");
}

parentPort.on("message", (message: WorkerRequestMessage) => {
  const startedAt = performance.now();

  try {
    const result = optimizeProject(message.input);
    parentPort.postMessage({
      id: message.id,
      ok: true,
      result,
      engineMs: performance.now() - startedAt
    });
  } catch (error) {
    const normalized = error instanceof Error ? error : new Error(String(error));
    parentPort.postMessage({
      id: message.id,
      ok: false,
      error: {
        name: normalized.name,
        message: normalized.message,
        stack: normalized.stack
      },
      engineMs: performance.now() - startedAt
    });
  }
});

import { fork } from "node:child_process";
import path from "node:path";

import type {
  LegacyLineInput,
  LegacyOptimizerOptions,
  LegacyOptimizerReturn,
  OptimizerStrategy,
} from "../types";

export type IsolatedKernelPayload = {
  strategy: OptimizerStrategy;
  lineas: LegacyLineInput[];
  options: LegacyOptimizerOptions;
  stagedConfig?: {
    enableStrongLowerBound: boolean;
    enablePreMultisliceCertification: boolean;
    enableRasterLowerBound: boolean;
    enableRepair: boolean;
    repairMaxTypes: number;
    enableIncrementalMaster: boolean;
    rasterMaxPieces: number;
    rasterMaxTypes: number;
  } | null;
};

export type IsolatedKernelResult = {
  result: LegacyOptimizerReturn;
  rustFallback: boolean;
};

export type IsolatedKernelOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
};

export function runIsolatedLegacyKernel(
  payload: IsolatedKernelPayload,
  {
    timeoutMs = defaultTimeoutMs(),
    signal,
  }: IsolatedKernelOptions = {},
): Promise<IsolatedKernelResult> {
  return new Promise((resolve, reject) => {
    const childPath = path.join(process.cwd(), "scripts", "optimizer-kernel-child.cjs");
    const child = fork(childPath, [], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "ignore", "pipe", "ipc"],
      serialization: "advanced",
    });

    let settled = false;
    let stderr = "";

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-8000);
    });

    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      child.removeAllListeners("message");
      child.removeAllListeners("error");
      child.removeAllListeners("exit");
    };

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const terminate = () => {
      if (!child.killed) child.kill("SIGKILL");
    };

    const onAbort = () => {
      terminate();
      finish(() => reject(new Error("OPTIMIZER_KERNEL_ABORTED")));
    };

    const timer = setTimeout(() => {
      terminate();
      finish(() => reject(new Error(`OPTIMIZER_KERNEL_TIMEOUT:${timeoutMs}`)));
    }, timeoutMs);
    timer.unref?.();

    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener("abort", onAbort, { once: true });
    }

    child.on("message", (message: any) => {
      if (!message || message.type !== "result") return;

      if (message.ok) {
        finish(() => resolve({
          result: message.result as LegacyOptimizerReturn,
          rustFallback: message.rustFallback === true,
        }));
        child.disconnect();
        return;
      }

      const detail = typeof message.error === "string" ? message.error : "unknown child error";
      finish(() => reject(new Error(`OPTIMIZER_KERNEL_CHILD_FAILED: ${detail}`)));
      child.disconnect();
    });

    child.on("error", (error) => {
      terminate();
      finish(() => reject(new Error(`OPTIMIZER_KERNEL_CHILD_ERROR: ${error.message}`)));
    });

    child.on("exit", (code, childSignal) => {
      if (settled) return;
      const detail = stderr ? ` stderr=${stderr}` : "";
      finish(() => reject(new Error(
        `OPTIMIZER_KERNEL_CHILD_EXIT: code=${String(code)} signal=${String(childSignal)}${detail}`,
      )));
    });

    child.send({ type: "run", payload });
  });
}

function defaultTimeoutMs(): number {
  const raw = Number.parseInt(process.env.OPTIMIZER_KERNEL_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 120_000;
}

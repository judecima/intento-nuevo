import { availableParallelism } from "node:os";
import { performance } from "node:perf_hooks";
import { Worker } from "node:worker_threads";

import {
  getOptimizationInputHash,
  optimizeProject,
  type OptimizationInput,
  type OptimizationResult
} from "@/lib/optimizer";

export type OptimizationExecutionMode = "direct" | "worker";

export interface OptimizationExecutionTelemetry {
  mode: OptimizationExecutionMode;
  queueMs: number;
  hostMs: number;
  engineMs: number;
  overheadMs: number;
  deduplicated: boolean;
}

export interface OptimizationExecutionOutcome {
  result: OptimizationResult;
  telemetry: OptimizationExecutionTelemetry;
}

export interface OptimizationExecutionContext {
  projectId: string;
  projectVersion: number;
  onStarted?: () => void | Promise<void>;
}

interface WorkerSuccessMessage {
  id: string;
  ok: true;
  result: OptimizationResult;
  engineMs: number;
}

interface WorkerFailureMessage {
  id: string;
  ok: false;
  error: {
    name: string;
    message: string;
    stack?: string;
  };
  engineMs: number;
}

type WorkerResponseMessage = WorkerSuccessMessage | WorkerFailureMessage;

interface QueuedTask {
  id: string;
  dedupeKey: string;
  projectId: string;
  projectVersion: number;
  input: OptimizationInput;
  enqueuedAt: number;
  onStarted?: () => void | Promise<void>;
  worker: Worker | null;
  settled: boolean;
  promise: Promise<OptimizationExecutionOutcome>;
  resolve: (value: OptimizationExecutionOutcome) => void;
  reject: (reason: unknown) => void;
}

const DEFAULT_MAX_PENDING = 32;
const DEFAULT_CONCURRENCY = 1;
let sharedWorkerQueue: OptimizationWorkerQueue | null = null;

export class OptimizationSupersededError extends Error {
  readonly projectId: string;
  readonly projectVersion: number;

  constructor(projectId: string, projectVersion: number) {
    super(`OPTIMIZATION_SUPERSEDED:${projectId}:${projectVersion}`);
    this.name = "OptimizationSupersededError";
    this.projectId = projectId;
    this.projectVersion = projectVersion;
  }
}

export function getOptimizationExecutionMode(): OptimizationExecutionMode {
  return process.env.OPTIMIZER_EXECUTION_MODE?.trim().toLowerCase() === "worker" ? "worker" : "direct";
}

/**
 * Ejecuta exactamente el mismo optimizeProject actual.
 *
 * El modo direct preserva el comportamiento vigente y es el default. El modo
 * worker mueve el mismo input a un Worker Thread detrás de una cola acotada.
 * No contiene heurísticas ni cambia opciones del kernel.
 */
export async function executeOptimization(
  input: OptimizationInput,
  context: OptimizationExecutionContext
): Promise<OptimizationExecutionOutcome> {
  if (getOptimizationExecutionMode() === "direct") {
    await context.onStarted?.();
    const hostStartedAt = performance.now();
    const engineStartedAt = performance.now();
    const result = optimizeProject(input);
    const endedAt = performance.now();
    const engineMs = endedAt - engineStartedAt;

    return {
      result,
      telemetry: {
        mode: "direct",
        queueMs: 0,
        hostMs: endedAt - hostStartedAt,
        engineMs,
        overheadMs: Math.max(0, endedAt - hostStartedAt - engineMs),
        deduplicated: false
      }
    };
  }

  return workerQueue().execute(input, context);
}

class OptimizationWorkerQueue {
  private readonly concurrency: number;
  private readonly maxPending: number;
  private readonly maxOldGenerationSizeMb: number | null;
  private readonly pending: QueuedTask[] = [];
  private readonly active = new Map<string, QueuedTask>();
  private readonly byDedupeKey = new Map<string, QueuedTask>();
  private readonly latestVersionByProject = new Map<string, number>();
  private sequence = 0;

  constructor() {
    const cpuLimit = Math.max(1, availableParallelism());
    this.concurrency = Math.min(cpuLimit, positiveIntEnv("OPTIMIZER_WORKER_CONCURRENCY", DEFAULT_CONCURRENCY));
    this.maxPending = positiveIntEnv("OPTIMIZER_QUEUE_MAX_PENDING", DEFAULT_MAX_PENDING);
    this.maxOldGenerationSizeMb = optionalPositiveIntEnv("OPTIMIZER_WORKER_MAX_OLD_SPACE_MB");
  }

  execute(input: OptimizationInput, context: OptimizationExecutionContext): Promise<OptimizationExecutionOutcome> {
    const dedupeKey = getOptimizationInputHash(input);
    const existing = this.byDedupeKey.get(dedupeKey);

    if (existing) {
      return existing.promise.then((outcome) => ({
        result: outcome.result,
        telemetry: { ...outcome.telemetry, deduplicated: true }
      }));
    }

    this.supersedeOlderVersions(context.projectId, context.projectVersion);

    if (this.pending.length >= this.maxPending) {
      return Promise.reject(new Error(`OPTIMIZER_QUEUE_FULL:${this.maxPending}`));
    }

    const id = `optimizer-${process.pid}-${++this.sequence}`;
    let resolve!: (value: OptimizationExecutionOutcome) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<OptimizationExecutionOutcome>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });

    const task: QueuedTask = {
      id,
      dedupeKey,
      projectId: context.projectId,
      projectVersion: context.projectVersion,
      input,
      enqueuedAt: performance.now(),
      onStarted: context.onStarted,
      worker: null,
      settled: false,
      promise,
      resolve,
      reject
    };

    this.pending.push(task);
    this.byDedupeKey.set(dedupeKey, task);
    this.latestVersionByProject.set(
      context.projectId,
      Math.max(context.projectVersion, this.latestVersionByProject.get(context.projectId) ?? context.projectVersion)
    );
    this.drain();
    return promise;
  }

  private supersedeOlderVersions(projectId: string, projectVersion: number) {
    const latest = this.latestVersionByProject.get(projectId);
    if (latest != null && projectVersion < latest) {
      throw new OptimizationSupersededError(projectId, projectVersion);
    }

    if (latest != null && projectVersion <= latest) return;

    for (let index = this.pending.length - 1; index >= 0; index -= 1) {
      const task = this.pending[index];
      if (task.projectId !== projectId || task.projectVersion >= projectVersion) continue;
      this.pending.splice(index, 1);
      this.rejectTask(task, new OptimizationSupersededError(task.projectId, task.projectVersion));
    }

    for (const task of this.active.values()) {
      if (task.projectId !== projectId || task.projectVersion >= projectVersion) continue;
      const worker = task.worker;
      this.rejectTask(task, new OptimizationSupersededError(task.projectId, task.projectVersion));
      if (worker) void worker.terminate();
    }

    this.latestVersionByProject.set(projectId, projectVersion);
  }

  private drain() {
    while (this.active.size < this.concurrency && this.pending.length > 0) {
      const task = this.pending.shift();
      if (!task || task.settled) continue;
      this.active.set(task.id, task);
      void this.start(task);
    }
  }

  private async start(task: QueuedTask) {
    const dispatchedAt = performance.now();

    try {
      await task.onStarted?.();
      if (task.settled) return;

      const workerOptions = this.maxOldGenerationSizeMb
        ? { resourceLimits: { maxOldGenerationSizeMb: this.maxOldGenerationSizeMb } }
        : undefined;
      const hostStartedAt = performance.now();
      const worker = new Worker(new URL("./optimization-worker.ts", import.meta.url), workerOptions);
      task.worker = worker;

      const fail = (error: unknown) => {
        if (task.settled) return;
        this.rejectTask(task, error);
        if (task.worker) void task.worker.terminate();
      };

      worker.once("error", fail);
      worker.once("exit", (code) => {
        if (!task.settled) fail(new Error(`OPTIMIZER_WORKER_EXIT_WITHOUT_RESULT:${code}`));
      });
      worker.once("message", (message: WorkerResponseMessage) => {
        if (task.settled || message.id !== task.id) return;
        const endedAt = performance.now();

        if (!message.ok) {
          const error = new Error(message.error.message);
          error.name = message.error.name;
          if (message.error.stack) error.stack = message.error.stack;
          this.rejectTask(task, error);
          void worker.terminate();
          return;
        }

        this.resolveTask(task, {
          result: message.result,
          telemetry: {
            mode: "worker",
            queueMs: dispatchedAt - task.enqueuedAt,
            hostMs: endedAt - hostStartedAt,
            engineMs: message.engineMs,
            overheadMs: Math.max(0, endedAt - hostStartedAt - message.engineMs),
            deduplicated: false
          }
        });
        void worker.terminate();
      });

      worker.postMessage({ id: task.id, input: task.input });
    } catch (error) {
      if (!task.settled) this.rejectTask(task, error);
    }
  }

  private resolveTask(task: QueuedTask, value: OptimizationExecutionOutcome) {
    if (task.settled) return;
    task.settled = true;
    this.cleanupTask(task);
    task.resolve(value);
  }

  private rejectTask(task: QueuedTask, reason: unknown) {
    if (task.settled) return;
    task.settled = true;
    this.cleanupTask(task);
    task.reject(reason);
  }

  private cleanupTask(task: QueuedTask) {
    this.active.delete(task.id);
    if (this.byDedupeKey.get(task.dedupeKey) === task) this.byDedupeKey.delete(task.dedupeKey);
    queueMicrotask(() => this.drain());
  }
}

function workerQueue(): OptimizationWorkerQueue {
  sharedWorkerQueue ??= new OptimizationWorkerQueue();
  return sharedWorkerQueue;
}

function positiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function optionalPositiveIntEnv(name: string): number | null {
  const raw = process.env[name];
  if (!raw) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

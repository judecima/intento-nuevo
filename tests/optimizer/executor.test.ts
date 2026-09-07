import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OptimizationInput, OptimizationResult } from "@/lib/optimizer";

const workerHarness = vi.hoisted(() => ({
  instances: [] as any[]
}));

vi.mock("node:worker_threads", () => {
  class FakeWorker {
    readonly listeners = new Map<string, (value: any) => void>();
    message: any = null;
    terminated = false;

    constructor() {
      workerHarness.instances.push(this);
    }

    once(event: string, listener: (value: any) => void) {
      this.listeners.set(event, listener);
      return this;
    }

    postMessage(message: any) {
      this.message = message;
    }

    terminate() {
      this.terminated = true;
      return Promise.resolve(0);
    }

    succeed(result: OptimizationResult, engineMs = 5) {
      this.listeners.get("message")?.({
        id: this.message.id,
        ok: true,
        result,
        engineMs
      });
    }
  }

  return { Worker: FakeWorker };
});

const baseInput: OptimizationInput = {
  projectId: "executor-test",
  board: {
    width: 1200,
    height: 800,
    thickness: 18
  },
  material: {
    description: "MDF EXECUTOR TEST 18MM",
    hasGrain: false,
    thickness: 18
  },
  kerf: 5,
  trim: {
    x: 0,
    y: 0
  },
  constraints: {
    profile: "fast",
    minRemnant: 100,
    minCommercialRemnantLongSide: 250,
    allowOneBoard: false,
    allowPatternMaster: false,
    allowMultiSlice: false,
    allowDeadStripCompaction: false
  },
  pieces: [
    {
      reference: "A",
      description: "A",
      quantity: 1,
      width: 500,
      height: 300
    }
  ]
};

beforeEach(() => {
  workerHarness.instances.length = 0;
  vi.resetModules();
  delete process.env.OPTIMIZER_EXECUTION_MODE;
  delete process.env.OPTIMIZER_WORKER_CONCURRENCY;
  delete process.env.OPTIMIZER_QUEUE_MAX_PENDING;
  delete process.env.OPTIMIZER_WORKER_MAX_OLD_SPACE_MB;
});

afterEach(() => {
  delete process.env.OPTIMIZER_EXECUTION_MODE;
  delete process.env.OPTIMIZER_WORKER_CONCURRENCY;
  delete process.env.OPTIMIZER_QUEUE_MAX_PENDING;
  delete process.env.OPTIMIZER_WORKER_MAX_OLD_SPACE_MB;
});

describe("optimization executor", () => {
  it("keeps direct mode as the default", async () => {
    const { getOptimizationExecutionMode } = await import("@/lib/optimizations/executor");
    expect(getOptimizationExecutionMode()).toBe("direct");
  });

  it("deduplicates identical in-flight worker inputs", async () => {
    process.env.OPTIMIZER_EXECUTION_MODE = "worker";
    const { executeOptimization } = await import("@/lib/optimizations/executor");

    const first = executeOptimization(baseInput, { projectId: "p-dedupe", projectVersion: 1 });
    const second = executeOptimization(baseInput, { projectId: "p-dedupe", projectVersion: 1 });

    await flush();
    expect(workerHarness.instances).toHaveLength(1);

    workerHarness.instances[0].succeed(fakeResult("same"));
    const [a, b] = await Promise.all([first, second]);

    expect((a.result as any).marker).toBe("same");
    expect((b.result as any).marker).toBe("same");
    expect(a.telemetry.deduplicated).toBe(false);
    expect(b.telemetry.deduplicated).toBe(true);
  });

  it("enforces concurrency and the pending queue limit", async () => {
    process.env.OPTIMIZER_EXECUTION_MODE = "worker";
    process.env.OPTIMIZER_WORKER_CONCURRENCY = "1";
    process.env.OPTIMIZER_QUEUE_MAX_PENDING = "1";
    const { executeOptimization } = await import("@/lib/optimizations/executor");

    const first = executeOptimization(inputWithWidth(501), { projectId: "p-1", projectVersion: 1 });
    await flush();
    expect(workerHarness.instances).toHaveLength(1);

    const second = executeOptimization(inputWithWidth(502), { projectId: "p-2", projectVersion: 1 });
    const third = executeOptimization(inputWithWidth(503), { projectId: "p-3", projectVersion: 1 });

    await expect(third).rejects.toThrow("OPTIMIZER_QUEUE_FULL:1");
    expect(workerHarness.instances).toHaveLength(1);

    workerHarness.instances[0].succeed(fakeResult("first"));
    await expect(first).resolves.toMatchObject({ result: { marker: "first" } });

    await flush();
    expect(workerHarness.instances).toHaveLength(2);
    workerHarness.instances[1].succeed(fakeResult("second"));
    await expect(second).resolves.toMatchObject({ result: { marker: "second" } });
  });

  it("cancels an older active version when a newer version arrives", async () => {
    process.env.OPTIMIZER_EXECUTION_MODE = "worker";
    process.env.OPTIMIZER_WORKER_CONCURRENCY = "1";
    const { executeOptimization, OptimizationSupersededError } = await import("@/lib/optimizations/executor");

    const oldPromise = executeOptimization(inputWithWidth(510), {
      projectId: "p-versioned",
      projectVersion: 1
    });
    const oldOutcome = oldPromise.then(
      () => null,
      (error) => error
    );

    await flush();
    expect(workerHarness.instances).toHaveLength(1);
    const oldWorker = workerHarness.instances[0];

    const newPromise = executeOptimization(inputWithWidth(511), {
      projectId: "p-versioned",
      projectVersion: 2
    });

    const oldError = await oldOutcome;
    expect(oldError).toBeInstanceOf(OptimizationSupersededError);
    expect(oldWorker.terminated).toBe(true);

    await flush();
    expect(workerHarness.instances).toHaveLength(2);
    workerHarness.instances[1].succeed(fakeResult("new"));
    await expect(newPromise).resolves.toMatchObject({ result: { marker: "new" } });
  });
});

function inputWithWidth(width: number): OptimizationInput {
  return {
    ...baseInput,
    pieces: [
      {
        ...baseInput.pieces[0],
        width
      }
    ]
  };
}

function fakeResult(marker: string): OptimizationResult {
  return { marker } as unknown as OptimizationResult;
}

function flush(): Promise<void> {
  return new Promise((resolvePromise) => setImmediate(resolvePromise));
}

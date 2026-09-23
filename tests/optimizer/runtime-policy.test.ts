import { afterEach, describe, expect, it } from "vitest";

import {
  LEGACY_OPTIMIZER_VERSION,
  OPTIMIZER_AUTO_EFFORT_VERSION,
  RUST_LEGACY_PATTERN_GENERATOR_VERSION,
} from "@/lib/optimizer";
import {
  optimizerRuntimeFromAlgorithmVersion,
  resolveOptimizerRuntimeForExecution,
} from "@/lib/optimizations/runtime-policy";

const ORIGINAL = {
  motor: process.env.OPTIMIZER_MOTOR_VERSION,
  effort: process.env.OPTIMIZER_EFFORT_MODE,
  rust: process.env.OPTIMIZER_RUST_LEGACY_WORKER,
  rollout: process.env.OPTIMIZER_AUTO_ROLLOUT_PERCENT,
};

afterEach(() => {
  restore("OPTIMIZER_MOTOR_VERSION", ORIGINAL.motor);
  restore("OPTIMIZER_EFFORT_MODE", ORIGINAL.effort);
  restore("OPTIMIZER_RUST_LEGACY_WORKER", ORIGINAL.rust);
  restore("OPTIMIZER_AUTO_ROLLOUT_PERCENT", ORIGINAL.rollout);
});

describe("optimizer SaaS runtime identity", () => {
  it("binds Auto+Rust at enqueue time", () => {
    process.env.OPTIMIZER_MOTOR_VERSION = "v2";
    process.env.OPTIMIZER_EFFORT_MODE = "auto";
    process.env.OPTIMIZER_RUST_LEGACY_WORKER = "1";

    const runtime = resolveOptimizerRuntimeForExecution({
      strategy: "v10",
      queuedWorker: true,
    });

    expect(runtime).toEqual({
      motorVersion: "v2",
      effortMode: "auto",
      patternGenerator: "rust",
      algorithmVersion: `${OPTIMIZER_AUTO_EFFORT_VERSION}+rust-pattern-v1`,
    });
  });

  it("supports deterministic project-level Auto rollout without changing V2", () => {
    process.env.OPTIMIZER_MOTOR_VERSION = "v2";
    process.env.OPTIMIZER_EFFORT_MODE = "auto";

    process.env.OPTIMIZER_AUTO_ROLLOUT_PERCENT = "0";
    const control = resolveOptimizerRuntimeForExecution({
      strategy: "v10",
      queuedWorker: false,
      rolloutKey: "project-123",
    });

    process.env.OPTIMIZER_AUTO_ROLLOUT_PERCENT = "100";
    const treatment = resolveOptimizerRuntimeForExecution({
      strategy: "v10",
      queuedWorker: false,
      rolloutKey: "project-123",
    });

    expect(control.motorVersion).toBe("v2");
    expect(control.effortMode).toBe("fixed");
    expect(treatment.motorVersion).toBe("v2");
    expect(treatment.effortMode).toBe("auto");
  });

  it("replays the persisted runtime even after deploy flags change", () => {
    const persisted = `${OPTIMIZER_AUTO_EFFORT_VERSION}+rust-pattern-v1`;

    process.env.OPTIMIZER_MOTOR_VERSION = "v1";
    process.env.OPTIMIZER_EFFORT_MODE = "fixed";
    process.env.OPTIMIZER_RUST_LEGACY_WORKER = "0";

    expect(
      optimizerRuntimeFromAlgorithmVersion(persisted, { strategy: "v10" }),
    ).toEqual({
      motorVersion: "v2",
      effortMode: "auto",
      patternGenerator: "rust",
      algorithmVersion: persisted,
    });
  });

  it("keeps inline JS and queued Rust identities distinct", () => {
    process.env.OPTIMIZER_MOTOR_VERSION = "v1";
    process.env.OPTIMIZER_RUST_LEGACY_WORKER = "1";

    const inline = resolveOptimizerRuntimeForExecution({
      strategy: "v10",
      queuedWorker: false,
    });
    const queued = resolveOptimizerRuntimeForExecution({
      strategy: "v10",
      queuedWorker: true,
    });

    expect(inline.algorithmVersion).toBe(LEGACY_OPTIMIZER_VERSION);
    expect(queued.algorithmVersion).toBe(RUST_LEGACY_PATTERN_GENERATOR_VERSION);
  });

  it("preserves the pre-hardening Rust worker behavior for old queued V1 jobs", () => {
    const runtime = optimizerRuntimeFromAlgorithmVersion(LEGACY_OPTIMIZER_VERSION, {
      strategy: "v10",
      legacyPatternGenerator: "rust",
    });

    expect(runtime.patternGenerator).toBe("rust");
    expect(runtime.algorithmVersion).toBe(RUST_LEGACY_PATTERN_GENERATOR_VERSION);
  });
});

function restore(name: string, value: string | undefined) {
  if (value == null) delete process.env[name];
  else process.env[name] = value;
}

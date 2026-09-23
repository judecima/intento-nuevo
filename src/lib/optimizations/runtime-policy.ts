import { createHash } from "node:crypto";
import {
  LEGACY_OPTIMIZER_VERSION,
  MOTOR_BETA_V2_VERSION,
  OPTIMIZER_ADVANCED_REFERENCE_VERSION,
  OPTIMIZER_AUTO_EFFORT_VERSION,
  RUST_LEGACY_PATTERN_GENERATOR_VERSION,
  optimizerAlgorithmVersionForRuntime,
  type OptimizerEffortMode,
  type OptimizerMotorVersion,
  type OptimizerPatternGenerator,
  type OptimizerStrategy,
} from "@/lib/optimizer";

export type OptimizerRuntimeSelection = {
  motorVersion: OptimizerMotorVersion;
  effortMode: OptimizerEffortMode;
  patternGenerator: OptimizerPatternGenerator;
  algorithmVersion: string;
};

export function resolveOptimizerRuntimeForExecution({
  strategy,
  queuedWorker,
  isolatedExecution = false,
  rolloutKey,
}: {
  strategy: OptimizerStrategy;
  queuedWorker: boolean;
  /** Preview/worker executions that run outside the Next.js event loop may use Rust. */
  isolatedExecution?: boolean;
  /** Stable project/tenant key used only for deterministic Auto rollout. */
  rolloutKey?: string;
}): OptimizerRuntimeSelection {
  const motorVersion = envMotorVersion();
  const requestedEffortMode = motorVersion === "v2" ? envEffortMode() : "fixed";
  const effortMode = resolveEffortRollout(requestedEffortMode, rolloutKey);
  const rustCapableExecution = queuedWorker || isolatedExecution;
  const patternGenerator: OptimizerPatternGenerator =
    strategy === "v10" && rustCapableExecution && envFlag("OPTIMIZER_RUST_LEGACY_WORKER")
      ? "rust"
      : "js";

  return {
    motorVersion,
    effortMode,
    patternGenerator,
    algorithmVersion: optimizerAlgorithmVersionForRuntime({
      strategy,
      patternGenerator,
      motorVersion,
      effortMode,
    }),
  };
}

/**
 * A queued job is immutable with respect to optimizer runtime selection.
 * New jobs persist the complete algorithm version at enqueue time; workers
 * reconstruct the explicit runtime from that value instead of re-reading
 * deploy-time motor/effort flags.
 *
 * legacyPatternGenerator exists only to preserve pre-hardening queued jobs,
 * whose algorithm_version was always V1 even when the old worker env selected
 * Rust later.
 */
export function optimizerRuntimeFromAlgorithmVersion(
  algorithmVersion: string,
  {
    strategy = "v10",
    legacyPatternGenerator = "js",
  }: {
    strategy?: OptimizerStrategy;
    legacyPatternGenerator?: OptimizerPatternGenerator;
  } = {},
): OptimizerRuntimeSelection {
  const rust = algorithmVersion.endsWith("+rust-pattern-v1");
  const patternGenerator: OptimizerPatternGenerator =
    rust
      ? "rust"
      : algorithmVersion === LEGACY_OPTIMIZER_VERSION
        ? legacyPatternGenerator
        : "js";

  let motorVersion: OptimizerMotorVersion = "v1";
  let effortMode: OptimizerEffortMode = "fixed";

  if (algorithmVersion.startsWith(OPTIMIZER_AUTO_EFFORT_VERSION)) {
    motorVersion = "v2";
    effortMode = "auto";
  } else if (algorithmVersion.startsWith(OPTIMIZER_ADVANCED_REFERENCE_VERSION)) {
    motorVersion = "v2";
    effortMode = "advanced";
  } else if (algorithmVersion.startsWith(MOTOR_BETA_V2_VERSION)) {
    motorVersion = "v2";
    effortMode = "fixed";
  } else if (
    algorithmVersion === RUST_LEGACY_PATTERN_GENERATOR_VERSION ||
    algorithmVersion === LEGACY_OPTIMIZER_VERSION
  ) {
    motorVersion = "v1";
    effortMode = "fixed";
  }

  return {
    motorVersion,
    effortMode,
    patternGenerator,
    algorithmVersion: optimizerAlgorithmVersionForRuntime({
      strategy,
      patternGenerator,
      motorVersion,
      effortMode,
    }),
  };
}

function envMotorVersion(): OptimizerMotorVersion {
  return process.env.OPTIMIZER_MOTOR_VERSION?.trim().toLowerCase() === "v2" ? "v2" : "v1";
}

function envEffortMode(): OptimizerEffortMode {
  const raw = process.env.OPTIMIZER_EFFORT_MODE?.trim().toLowerCase();
  return raw === "auto" || raw === "advanced" ? raw : "fixed";
}

function envFlag(name: string): boolean {
  return /^(1|true|yes|on)$/i.test(String(process.env[name] ?? ""));
}


export function optimizerAutoRolloutBucket(key: string): number {
  const digest = createHash("sha256").update(key).digest();
  return digest.readUInt32BE(0) % 10000;
}

function resolveEffortRollout(
  requested: OptimizerEffortMode,
  rolloutKey?: string,
): OptimizerEffortMode {
  if (requested !== "auto" || !rolloutKey) return requested;

  const percent = envPercent("OPTIMIZER_AUTO_ROLLOUT_PERCENT", 100);
  if (percent <= 0) return "fixed";
  if (percent >= 100) return "auto";

  const threshold = Math.round(percent * 100);
  return optimizerAutoRolloutBucket(rolloutKey) < threshold ? "auto" : "fixed";
}

function envPercent(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, value));
}

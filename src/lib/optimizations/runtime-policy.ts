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
}: {
  strategy: OptimizerStrategy;
  queuedWorker: boolean;
}): OptimizerRuntimeSelection {
  const motorVersion = envMotorVersion();
  const effortMode = motorVersion === "v2" ? envEffortMode() : "fixed";
  const patternGenerator: OptimizerPatternGenerator =
    strategy === "v10" && queuedWorker && envFlag("OPTIMIZER_RUST_LEGACY_WORKER")
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

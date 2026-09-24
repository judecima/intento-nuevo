"use strict";

const motor = require("../src/lib/optimizer/legacy/motor.cjs");
const v10 = require("../src/lib/optimizer/legacy/v10.cjs");

process.on("message", (message) => {
  if (!message || message.type !== "run") return;

  if (process.env.NODE_ENV === "test" && process.env.OPTIMIZER_KERNEL_CHILD_FORCE_CRASH === "1") {
    process.exit(86);
    return;
  }

  const delayMs =
    process.env.NODE_ENV === "test"
      ? Math.max(0, Number.parseInt(process.env.OPTIMIZER_KERNEL_CHILD_DELAY_MS || "0", 10) || 0)
      : 0;

  if (delayMs > 0) {
    setTimeout(() => execute(message), delayMs);
  } else {
    execute(message);
  }
});

function execute(message) {
  try {
    const { strategy, lineas, options, stagedConfig } = message.payload;
    let result;

    if (strategy === "v10") {
      if (stagedConfig) {
        const staged = require("../src/lib/optimizer/experimental/v10-hybrid-pipeline.cjs");
        const value = staged.runV10HybridPipeline(lineas, options, {
          enableStrongLowerBound: stagedConfig.enableStrongLowerBound,
          enablePreMultisliceCertification: stagedConfig.enablePreMultisliceCertification,
          enableRasterLowerBound: stagedConfig.enableRasterLowerBound,
          enableRepair: stagedConfig.enableRepair,
          repairMaxTypes: stagedConfig.repairMaxTypes,
          enableIncrementalMaster: stagedConfig.enableIncrementalMaster,
          rasterMaxPieces: stagedConfig.rasterMaxPieces,
          rasterMaxTypes: stagedConfig.rasterMaxTypes,
        });
        result = { plan: value.plan, metricas: value.metrics, cota: value.cota };
      } else {
        result = v10.optimizarV10(lineas, options, v10.nuevasMetricas());
      }
    } else {
      result = {
        plan: motor.optimizar(lineas, { ...options, multiVariantes: false }),
        metricas: v10.nuevasMetricas(),
        cota: null,
      };
    }

    if (typeof process.send === "function") {
      process.send({
        type: "result",
        ok: true,
        result,
        rustFallback: options._rustPatternGeneratorFallback === true,
      });
    }
  } catch (error) {
    if (typeof process.send === "function") {
      process.send({
        type: "result",
        ok: false,
        error: error instanceof Error ? (error.stack || error.message) : String(error),
      });
    }
  }
}

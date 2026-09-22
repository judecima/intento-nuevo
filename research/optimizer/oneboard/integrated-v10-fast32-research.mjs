import { createRequire } from "node:module";
import path from "node:path";

import { runV3CapturingOneBoard } from "./oneboard-state-capture.mjs";
import {
  RESERVED_ROOT_BAND_FAST32_VERSION,
  tryReservedRootBandFast32,
} from "./reserved-root-band-fast32.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(new URL("../../../", import.meta.url).pathname);
const {
  nuevasMetricas,
  validarPlanIndustrial,
} = require(path.join(ROOT, "src/lib/optimizer/legacy/v10.cjs"));

export const ONEBOARD_FAST32_INTEGRATED_RESEARCH_VERSION =
  "oneboard-fast32-captured-state-research-20260922";

function expectedPieces(lines) {
  return lines.reduce((sum, line) => sum + Number(line?.cant || 0), 0);
}

/**
 * Research-only integration:
 * 1. run frozen V3 once;
 * 2. observe the OneBoard state V3 already paid for;
 * 3. only if V3 still uses >1 board and area-LB is 1, run Fast32 from that
 *    captured failed state;
 * 4. accept only a strict board-count win that remains physically valid.
 *
 * Flag-off production code is untouched.
 */
export function optimizarV10ConOneBoardFast32Research(
  lines,
  config,
  metricas = nuevasMetricas(),
) {
  const totalStarted = process.hrtime.bigint();
  const baseRun = runV3CapturingOneBoard(lines, config, metricas);
  const base = baseRun.value;
  const baseBoards = Number(base?.plan?.resumen?.placas ?? Infinity);

  const telemetry = {
    version: ONEBOARD_FAST32_INTEGRATED_RESEARCH_VERSION,
    candidateVersion: RESERVED_ROOT_BAND_FAST32_VERSION,
    attempted: false,
    certified: false,
    accepted: false,
    reason: null,
    capturedAttempts: baseRun.oneboardState?.attempts ?? 0,
    diagnosticLeft: baseRun.oneboardState?.left ?? null,
    baseWallMs: baseRun.wallMs,
    repairWallMs: 0,
    totalWallMs: 0,
  };

  if (
    !base?.plan ||
    baseBoards <= 1 ||
    Number(base?.cotaArea) !== 1 ||
    !baseRun.oneboardState ||
    baseRun.oneboardState.left <= 0
  ) {
    telemetry.reason =
      !base?.plan
        ? "NO_V3_PLAN"
        : baseBoards <= 1
          ? "V3_ALREADY_ONE_BOARD"
          : Number(base?.cotaArea) !== 1
            ? "AREA_LB_NOT_ONE"
            : !baseRun.oneboardState
              ? "ONEBOARD_NOT_CAPTURED"
              : "ONEBOARD_ALREADY_COMPLETE";
    telemetry.totalWallMs =
      Number(process.hrtime.bigint() - totalStarted) / 1e6;
    return { ...base, oneboardFast32Research: telemetry };
  }

  telemetry.attempted = true;
  const repairStarted = process.hrtime.bigint();
  const repair = tryReservedRootBandFast32(
    lines,
    config,
    baseRun.oneboardState,
  );
  telemetry.repairWallMs =
    Number(process.hrtime.bigint() - repairStarted) / 1e6;
  telemetry.certified = Boolean(repair?.certified);

  let chosen = base.plan;
  if (
    repair?.certified &&
    repair?.plan &&
    Number(repair.plan?.resumen?.placas) < baseBoards &&
    validarPlanIndustrial(repair.plan, expectedPieces(lines))?.ok
  ) {
    chosen = repair.plan;
    telemetry.accepted = true;
    telemetry.reason = "STRICT_BOARD_WIN";
  } else {
    telemetry.reason = repair?.reason || "NO_STRICT_BOARD_WIN";
  }

  telemetry.rootBandAttempts = repair?.rootBandAttempts ?? 0;
  telemetry.siblingChecks = repair?.siblingChecks ?? 0;
  telemetry.cheapSiblingRejects = repair?.cheapSiblingRejects ?? 0;
  telemetry.totalWallMs =
    Number(process.hrtime.bigint() - totalStarted) / 1e6;

  return {
    ...base,
    plan: chosen,
    oneboardFast32Research: telemetry,
  };
}

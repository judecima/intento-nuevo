import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(new URL("../../../", import.meta.url).pathname);
const M = require(path.join(ROOT, "src/lib/optimizer/legacy/motor.cjs"));
const {
  optimizarV10,
  nuevasMetricas,
} = require(path.join(ROOT, "src/lib/optimizer/legacy/v10.cjs"));

/**
 * Research-only instrumentation.
 *
 * motor.cjs calls its own lexical empacarPlaca internally. The production
 * OneBoard module is the only normal V10 path that calls the exported
 * M.empacarPlaca property. Temporarily wrapping that property therefore lets
 * us observe the already-paid OneBoard trajectories without changing V10 or
 * oneboard.cjs.
 */
export function runV3CapturingOneBoard(
  lines,
  config,
  metricas = nuevasMetricas(),
) {
  const expected = lines.reduce(
    (sum, line) => sum + Number(line?.cant || 0),
    0,
  );
  const original = M.empacarPlaca;
  const started = process.hrtime.bigint();

  let calls = 0;
  let best = null;
  let bestPlaced = -1;
  let pieces = null;
  let opts = null;
  let nSigs = null;

  M.empacarPlaca = function capturedEmpacarPlaca(pool, localOpts, rnd) {
    const result = original(pool, localOpts, rnd);
    calls++;

    const placed = Number(result?.colocadas?.length || 0);
    if (placed > bestPlaced) {
      bestPlaced = placed;
      best = result;
      pieces = Array.isArray(pool) ? pool.slice() : null;
      opts = localOpts;
      nSigs = Number(localOpts?._nSigs);
    }

    return result;
  };

  let value;
  let error = null;
  try {
    value = optimizarV10(lines, config, metricas);
  } catch (caught) {
    error = caught;
    throw caught;
  } finally {
    M.empacarPlaca = original;
  }

  return {
    value,
    error,
    wallMs: Number(process.hrtime.bigint() - started) / 1e6,
    oneboardState:
      calls > 0 && best
        ? {
            best,
            left: Math.max(0, expected - bestPlaced),
            pieces,
            opts,
            nSigs: Number.isFinite(nSigs) ? nSigs : null,
            attempts: calls,
          }
        : null,
  };
}

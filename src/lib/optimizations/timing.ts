export type OptimizerTimingTrace = {
  mark: (name: string) => void;
  log: (extra?: Record<string, unknown>) => void;
};

export function createOptimizerTimingTrace(
  label: string,
  meta: Record<string, unknown> = {},
): OptimizerTimingTrace {
  const enabled = /^(1|true|yes|on)$/i.test(String(process.env.OPTIMIZER_DEBUG_TIMING ?? ""));
  const startedAt = Date.now();
  let previousAt = startedAt;
  const segments: Record<string, number> = {};

  return {
    mark(name: string) {
      if (!enabled) return;
      const now = Date.now();
      segments[name] = now - previousAt;
      previousAt = now;
    },
    log(extra: Record<string, unknown> = {}) {
      if (!enabled) return;
      const totalMs = Date.now() - startedAt;
      console.info(
        "[optimizer-timing] " +
          JSON.stringify({
            label,
            ...meta,
            ...extra,
            segments,
            totalMs,
          }),
      );
    },
  };
}

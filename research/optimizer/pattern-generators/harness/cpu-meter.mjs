// Inclusive intervals are subtracted from their parent exactly once.
// The root partitions measured optimizer CPU into exclusive child scopes.
export function createCpuMeter(read = () => {
  const cpu = process.cpuUsage(); return cpu.user + cpu.system;
}) {
  const exclusive = {}, inclusive = {}, calls = {}, stack = [];
  return {
    measure(phase, fn) {
      const frame = { start: read(), children: 0 }; stack.push(frame);
      try { return fn(); } finally {
        const elapsed = read() - frame.start;
        stack.pop();
        if (stack.length) stack.at(-1).children += elapsed;
        exclusive[phase] = (exclusive[phase] ?? 0) + elapsed - frame.children;
        inclusive[phase] = (inclusive[phase] ?? 0) + elapsed;
        calls[phase] = (calls[phase] ?? 0) + 1;
      }
    },
    snapshot() { return { exclusive: { ...exclusive }, inclusive: { ...inclusive }, calls: { ...calls } }; },
  };
}

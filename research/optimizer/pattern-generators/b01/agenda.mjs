function queue() {
  let items = [], offset = 0;
  return {
    get size() { return items.length - offset; },
    push(task) { items.push(task); },
    shift() {
      const task = items[offset++];
      if (offset > 1024 && offset * 2 > items.length) { items = items.slice(offset); offset = 0; }
      return task;
    },
  };
}
export function createAgenda(axes) {
  const lanes = axes.map((axis) => ({ axis, queues: [new Map(), new Map()], next: 0, depthNext: [0, 0] }));
  let next = 0, peak = 0;
  const size = () => lanes.reduce((n, lane) => n + lane.queues.reduce((m, depths) => m + [...depths.values()].reduce((s, q) => s + q.size, 0), 0), 0);
  return {
    add(axis, propagation, task, level = 1) {
      const depths = lanes.find((lane) => lane.axis === axis).queues[Number(propagation)];
      if (!depths.has(level)) depths.set(level, queue());
      depths.get(level).push(task); peak = Math.max(peak, size());
    },
    take() {
      for (let i = 0; i < lanes.length; i++) {
        const lane = lanes[next]; next = (next + 1) % lanes.length;
        for (let j = 0; j < 2; j++) {
          const kind = lane.next; lane.next = 1 - lane.next;
          const levels = [...lane.queues[kind].keys()].sort((a, b) => a - b);
          for (let k = 0; k < levels.length; k++) {
            const at = lane.depthNext[kind] % levels.length, level = levels[at];
            lane.depthNext[kind] = (at + 1) % levels.length;
            if (lane.queues[kind].get(level).size) return { axis: lane.axis, propagation: Boolean(kind), level,
              task: lane.queues[kind].get(level).shift() };
          }
        }
      }
      return null;
    },
    snapshot() { return { pending: size(), peak }; },
  };
}

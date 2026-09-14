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

// Deterministic axis fairness. Productive deltas (non-zero usage) may consume at
// most four turns in a lane before ordinary state/propagation work gets a turn.
export function createAgenda(axes) {
  const lanes = axes.map((axis) => ({ axis, state: new Map(), propagation: new Map(), productive: new Map(), productiveBurst: 0, ordinaryNext: 0,
    depthNext: { state: 0, propagation: 0, productive: 0 } }));
  let next = 0, peak = 0;
  const maps = (lane) => [lane.state, lane.propagation, lane.productive];
  const sizeMap = (depths) => [...depths.values()].reduce((s, q) => s + q.size, 0);
  const size = () => lanes.reduce((n, lane) => n + maps(lane).reduce((s, depths) => s + sizeMap(depths), 0), 0);
  const takeFrom = (lane, kind) => {
    const depths = lane[kind], levels = [...depths.keys()].sort((a,b)=>a-b);
    if (!levels.length) return null;
    const start = lane.depthNext[kind] % levels.length;
    for (let j=0;j<levels.length;j++) {
      const at=(start+j)%levels.length, level=levels[at], q=depths.get(level);
      if (q.size) { lane.depthNext[kind]=(at+1)%levels.length; return {axis:lane.axis, propagation:kind!=="state", priority:kind, level, task:q.shift()}; }
    }
    return null;
  };
  return {
    add(axis, propagation, task, level=1) {
      const lane=lanes.find((x)=>x.axis===axis);
      const kind=propagation==="productive" ? "productive" : propagation ? "propagation" : "state";
      const depths=lane[kind]; if(!depths.has(level)) depths.set(level,queue()); depths.get(level).push(task); peak=Math.max(peak,size());
    },
    take() {
      for(let i=0;i<lanes.length;i++) {
        const lane=lanes[next]; next=(next+1)%lanes.length;
        if (sizeMap(lane.productive) && lane.productiveBurst < 4) {
          const item=takeFrom(lane,"productive"); if(item){ lane.productiveBurst++; return item; }
        }
        const order=lane.ordinaryNext++ % 2 === 0 ? ["state","propagation"] : ["propagation","state"];
        for(const kind of order){ const item=takeFrom(lane,kind); if(item){ lane.productiveBurst=0; return item; } }
        const item=takeFrom(lane,"productive"); if(item){ lane.productiveBurst=1; return item; }
      }
      return null;
    },
    snapshot(){ return {pending:size(), peak}; },
  };
}

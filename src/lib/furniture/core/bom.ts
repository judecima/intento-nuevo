import type { FurnitureModel, HardwareLine, MaterialRole, PartEdges } from './types';

export interface CutListLine {
  /** Clave estable de la línea (material + medidas + cantos + veta). */
  key: string;
  material: MaterialRole;
  name: string;
  cutLargo: number;
  cutAncho: number;
  cutEspesor: number;
  grainMatters: boolean;
  edges: PartEdges;
  quantity: number;
  partIds: string[];
}

const edgeKey = (e: PartEdges) => `${e.top[0]}${e.bottom[0]}${e.left[0]}${e.right[0]}`;

/** Agrupa piezas idénticas de uno o varios muebles. */
export function cutList(models: FurnitureModel[]): CutListLine[] {
  const map = new Map<string, CutListLine>();
  for (const m of models) {
    for (const p of m.parts) {
      if (p.isHardware || !p.material || !p.edges) continue;
      const key = [p.material, p.cutEspesor, p.cutLargo, p.cutAncho, p.grainMatters ? 'g' : 'n', edgeKey(p.edges), p.name].join('|');
      const line = map.get(key);
      if (line) {
        line.quantity += 1;
        line.partIds.push(p.id);
      } else {
        map.set(key, {
          key, material: p.material, name: p.name,
          cutLargo: p.cutLargo, cutAncho: p.cutAncho, cutEspesor: p.cutEspesor,
          grainMatters: p.grainMatters ?? true, edges: p.edges, quantity: 1, partIds: [p.id],
        });
      }
    }
  }
  return [...map.values()];
}

/** Suma herrajes 3D (según su `qty`) y herrajes sin geometría, por SKU. */
export function hardwareList(models: FurnitureModel[]): HardwareLine[] {
  const map = new Map<string, HardwareLine>();
  const add = (h: HardwareLine) => {
    if (h.qty === 0) return;
    const cur = map.get(h.sku);
    if (cur) cur.qty = Math.round((cur.qty + h.qty) * 1000) / 1000;
    else map.set(h.sku, { ...h });
  };
  for (const m of models) {
    for (const p of m.parts) if (p.hardware) add({ sku: p.hardware.sku, name: p.hardware.name, qty: p.hardware.qty, unit: p.hardware.unit });
    for (const h of m.hardware) add(h);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Metros lineales de tapacanto por tipo y material. */
export function edgeBandMeters(lines: CutListLine[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of lines) {
    const e = l.edges;
    const add = (type: string, mm: number) => {
      if (type === 'none') return;
      const k = `${l.material}:${type}`;
      out[k] = Math.round(((out[k] ?? 0) + (mm * l.quantity) / 1000) * 100) / 100;
    };
    add(e.top, l.cutLargo);
    add(e.bottom, l.cutLargo);
    add(e.left, l.cutAncho);
    add(e.right, l.cutAncho);
  }
  return out;
}

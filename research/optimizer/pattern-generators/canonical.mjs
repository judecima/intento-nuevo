import { createHash } from "node:crypto";

export function stableJson(value) {
  const stable = (v) => {
    if (Array.isArray(v)) return v.map(stable);
    if (v && typeof v === "object") {
      if (v instanceof Map) throw new TypeError("serialize usage Map explicitly");
      return Object.fromEntries(Object.keys(v).sort().map((key) => [key, stable(v[key])]));
    }
    if (typeof v === "number" && !Number.isFinite(v)) throw new TypeError("non-finite canonical number");
    return v;
  };
  return JSON.stringify(stable(value));
}
export const digest = (value) => createHash("sha256").update(stableJson(value)).digest("hex");
export const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;
export function freezeDeep(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

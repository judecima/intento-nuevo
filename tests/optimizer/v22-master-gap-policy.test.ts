import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const v10 = require("../../src/lib/optimizer/legacy/v10.cjs") as {
  debeEjecutarMasterPorGap(config: Record<string, unknown>, boards: number, cota: number): boolean;
};

const FLAG = "OPTIMIZER_V22_MASTER_GAP1_EXPERIMENTAL";
const previous = process.env[FLAG];

afterEach(() => {
  if (previous === undefined) delete process.env[FLAG];
  else process.env[FLAG] = previous;
});

describe("V22a Master gap policy", () => {
  it("is legacy-compatible when the flag is off", () => {
    delete process.env[FLAG];
    expect(v10.debeEjecutarMasterPorGap({}, 8, 7)).toBe(true);
    expect(v10.debeEjecutarMasterPorGap({}, 9, 7)).toBe(true);
    expect(v10.debeEjecutarMasterPorGap({}, 12, 7)).toBe(true);
  });

  it("runs Master only for gap <= 1 when enabled by env", () => {
    process.env[FLAG] = "1";
    expect(v10.debeEjecutarMasterPorGap({}, 8, 7)).toBe(true);
    expect(v10.debeEjecutarMasterPorGap({}, 9, 7)).toBe(false);
    expect(v10.debeEjecutarMasterPorGap({}, 12, 7)).toBe(false);
  });

  it("can be enabled explicitly from config", () => {
    delete process.env[FLAG];
    expect(v10.debeEjecutarMasterPorGap({ usarMasterSoloGap1: true }, 8, 7)).toBe(true);
    expect(v10.debeEjecutarMasterPorGap({ usarMasterSoloGap1: true }, 10, 7)).toBe(false);
  });
});

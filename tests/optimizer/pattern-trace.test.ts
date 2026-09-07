import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
// Allows the same contract to review a quarantined candidate without changing runtime.
const root = resolve(process.env.TRACE_CANDIDATE_ROOT ?? ".", "src/lib/optimizer/legacy");
type Placement = { _diagPath?: unknown[]; _diagLink?: unknown };
type Plan = { placas: Array<{ colocadas: Placement[] }> };
type Pattern = { placa: { colocadas: Placement[] } };
const motor = require(resolve(root, "motor.cjs")) as {
  resolverDiagPath?: (link: unknown) => unknown[];
};
const patterns = require(resolve(root, "patrones.cjs")) as {
  generarPatrones: (lines: unknown[], options: object, rounds: number) => Pattern[];
  patronesMonotipo: (lines: unknown[], options: object) => Pattern[];
};
const { materializar } = require(resolve(root, "materializar.cjs")) as {
  materializar: (patterns: Pattern[], lines: unknown[], options: object) => Plan | null;
};
const { validarPlanIndustrial } = require(resolve(root, "v10.cjs")) as {
  validarPlanIndustrial: (plan: Plan, pieces: number) => { ok: boolean };
};

const lines = [{ ref: "ESTANTE", detalle: "estante", cant: 3, base: 300, altura: 200, veta: false }];
const options = {
  placaBase: 1200, placaAltura: 800, refiladoX: 10, refiladoY: 10,
  sierra: 4.5, etapas: 4, materialConVeta: false,
  restoMin: 100, restoMax: 250, usarRescue: false, usarBeam: false,
};

describe("traces of materialized Master patterns", () => {
  it.each(["mixed", "monotype"] as const)("preserves final piece traces from %s generation", (kind) => {
    const pool = kind === "mixed"
      ? patterns.generarPatrones(lines, options, 1)
      : patterns.patronesMonotipo(lines, options);
    const pattern = pool.find((entry) => entry.placa.colocadas.length === 3);
    expect(pattern).toBeDefined();
    const plan = materializar([pattern!], lines, options);
    expect(plan).not.toBeNull();
    expect(validarPlanIndustrial(plan!, 3).ok).toBe(true);
    const placements = plan!.placas.flatMap((board) => board.colocadas);
    expect(placements).toHaveLength(3);
    for (const placement of placements) {
      const trace = placement._diagPath ?? motor.resolverDiagPath?.(placement._diagLink) ?? [];
      expect(trace.length, "a final Master placement must retain its diagnostic trace").toBeGreaterThan(0);
    }
  });
});

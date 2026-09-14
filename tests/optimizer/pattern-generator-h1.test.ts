import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { parseCanonicalXml } from "@/lib/optimizer/canonical-xml";
import { validateIndependentSlices } from "@/lib/optimizer/validators/independent-slices";
import { readB0PhysicalXml } from "./helpers/b0-xml-roundtrip";
const require = createRequire(import.meta.url);
const { createContext, toUnits } = require("../../research/optimizer/pattern-generators/context.mjs");
const { materializePattern, exportPlanCopy } = require("../../research/optimizer/pattern-generators/physical-pattern.mjs");
const { createWorkBudget } = require("../../research/optimizer/pattern-generators/work-budget.mjs");
const { digest } = require("../../research/optimizer/pattern-generators/canonical.mjs");
const { materializar } = require("../../src/lib/optimizer/legacy/materializar.cjs");
const { validarPlanIndustrial } = require("../../src/lib/optimizer/legacy/validador_industrial_v3.cjs");

const line = (base = 40, altura = 60, cant = 2, ref = "ESTANTE") => ({ base, altura, cant, ref, detalle: ref, veta: false });
type Line = ReturnType<typeof line> & { cantos?: { izq: boolean; der: boolean; arr: boolean; aba: boolean } };
const context = (lines: Line[] = [line()], opts = {}) => createContext(lines, { placaBase: 100, placaAltura: 60, sierra: 5, ...opts });
const piece = (type = 0, rotated = false) => ({ kind: "piece", type, rotated });
const slice = (axis: string, parts: Array<[number, object]>) => ({ kind: "slice", axis, parts: parts.map(([size, content]) => ({ size, content })) });
const siblings = () => slice("x", [[40, piece()], [40, piece()]]);

// Independent demand check after the existing XML importer; dimensions are
// normalized by that importer, so compare unordered sides and physical cut size.
function checkRoundTrip(ctx: ReturnType<typeof createContext>, tree: object, copies = 1, options = {}) {
  const result = materializePattern(ctx, tree, options);
  expect(result.validation.geometriaValida).toBe(true);
  expect(result.validation.secuenciaCompleta).toBe(true);
  const plan = materializar(Array(copies).fill(result.pattern), ctx.lines, ctx.opts);
  expect(plan).not.toBeNull();
  const expected = ctx.lines.reduce((sum: number, l: { cant: number }) => sum + l.cant, 0);
  expect(validarPlanIndustrial(plan, expected).ok).toBe(true);
  expect(validateIndependentSlices(plan)).toEqual({ ok: true, errores: [] });
  const before = digest(plan);
  const xml = exportPlanCopy(plan);
  expect(digest(plan)).toBe(before);
  expect(exportPlanCopy(plan)).toBe(xml);
  const parsed = parseCanonicalXml(xml);
  const physical = readB0PhysicalXml(xml, ctx.opts, plan.placas[0].arbol.dir);
  expect(physical).toHaveLength(plan.placas.length);
  physical.forEach((board, i) => {
    expect(board.colocadas.map((p) => [p.x, p.y, p.base, p.altura, p.pieza.ref])).toEqual(
      plan.placas[i].colocadas.map((p: { x: number; y: number; base: number; altura: number; pieza: { _codigoXml: string } }) =>
        [p.x, p.y, p.base, p.altura, p.pieza._codigoXml]));
    expect(board.cortes.map((c) => [c.x1, c.y1, c.x2, c.y2, c.nivel])).toEqual(
      plan.placas[i].cortes.map((c: { x1: number; y1: number; x2: number; y2: number; nivel: number }) => [c.x1, c.y1, c.x2, c.y2, c.nivel]));
  });
  expect(parsed.stats.pieceQuantity).toBe(expected);
  const actual = parsed.case.pieces.map((p) => [p.reference, Math.max(p.width, p.height), Math.min(p.width, p.height), p.quantity]);
  const wanted = ctx.types.map((t: { reference: string; cutWidth: number; cutHeight: number; quantity: number }) =>
    [t.reference, Math.max(t.cutWidth, t.cutHeight) / 1000, Math.min(t.cutWidth, t.cutHeight) / 1000, t.quantity]);
  expect(actual.sort()).toEqual(wanted.sort());
  const ids = new Set();
  for (const board of plan.placas) for (const p of board.colocadas) {
    expect(ids.has(p.pieza.id)).toBe(false);
    ids.add(p.pieza.id);
    expect(p._diagPath.length).toBeGreaterThan(0);
    expect(p._diagPath.at(-1).bloque).toEqual({ x: p.x, y: p.y, w: p.base, h: p.altura });
    expect(p._diagPath.at(-1).refFinal).toBe(p.pieza.tipo);
  }
  return { ...result, plan, xml, parsed };
}

describe("B0 H1 physical materializer (manual trees, no search)", () => {
  it("releases an exact board without artificial cuts", () => {
    const { pattern } = checkRoundTrip(context([line(100, 60, 1)]), piece());
    expect(pattern.placa.cortes).toHaveLength(0);
    expect(pattern.placa.restos).toHaveLength(0);
  });
  it.each([0, 5])("keeps independent siblings with kerf %s", (sierra) => {
    const { pattern } = checkRoundTrip(context([line()], { sierra }), siblings());
    expect(pattern.placa.colocadas.map((p: { x: number }) => p.x)).toEqual([0, 40 + sierra]);
  });
  it("exports asymmetric trim with full panel and correct root/child dimensions", () => {
    const { xml } = checkRoundTrip(context([line()], { placaBase: 110, placaAltura: 80, refiladoX: 10, refiladoY: 20 }), siblings());
    expect(xml).toContain('<panel1 l="110" w="80"');
    expect(xml).toContain('l="110" w="80" trim="10" x="0" y="0" layer="1"');
    expect(xml).toContain('l="80" w="40" trim="20"');
  });
  it("supports an allowed rotation", () => {
    checkRoundTrip(context([line(100, 60, 1)], { placaBase: 60, placaAltura: 100 }), piece(0, true));
  });
  it("rejects grain-forbidden rotation even when geometry fits", () => {
    const ctx = context([{ ...line(40, 60, 1), veta: true }], { placaBase: 100, placaAltura: 100, materialConVeta: true });
    expect(() => materializePattern(ctx, slice("x", [[60, slice("y", [[40, piece(0, true)]])]]))).toThrow(/rotation forbidden/);
  });
  it("exports terminal closure at the stage boundary", () => {
    const { pattern, xml } = checkRoundTrip(context([line(40, 30, 1)], { placaAltura: 80, etapas: 1 }),
      slice("x", [[40, { kind: "terminal", type: 0 }]]));
    expect(pattern.placa.cortes.map((c: { nivel: number }) => c.nivel)).toEqual([1, 2]);
    expect(xml).toContain('layer="3"');
  });
  it("exports a normal alternating two-stage tree", () => {
    checkRoundTrip(context([line(40, 30, 1)], { placaAltura: 80, etapas: 2 }), slice("x", [[40, slice("y", [[30, piece()]])]]));
  });
  it("supports Y-root siblings and asymmetric trim", () => {
    checkRoundTrip(context([line(60, 40, 2)], { placaBase: 70, placaAltura: 120, refiladoX: 10, refiladoY: 20 }),
      slice("y", [[40, piece()], [40, piece()]]));
  });
  it("fixes 578 as final thickness and starts the next sibling at 583", () => {
    const ctx = context([line(578, 300, 1, "A"), line(100, 300, 1, "B")], { placaBase: 1200, placaAltura: 300 });
    const { pattern } = checkRoundTrip(ctx, slice("x", [[578, piece()], [100, piece(1)]]));
    expect(pattern.placa.colocadas[1].x).toBe(583);
    expect(() => materializePattern(ctx, slice("x", [[622, piece()], [100, piece(1)]]))).toThrow(/exactly released/);
  });
  it("keeps equal geometry as distinct demand types and escaped XML references", () => {
    const { pattern } = checkRoundTrip(context([line(40, 60, 1, 'ESTANTE&"<'), line(40, 60, 1, "BASE")]),
      slice("x", [[40, piece()], [40, piece(1)]]));
    expect([...pattern.uso]).toEqual([[0, 1], [1, 1]]);
  });
  it("reuses a template on two boards with exact demand, unique IDs and retained traces", () => {
    checkRoundTrip(context([line(40, 60, 4)], { placaBase: 85 }), siblings(), 2);
  });
  it("honors exact effective dimensions after edge deductions", () => {
    checkRoundTrip(context([{ ...line(42, 62, 1), cantos: { izq: true, der: true, arr: true, aba: true } }],
      { placaBase: 40, descontarCanto: true, cantoEspesor: 1 }), piece());
  });
  it("retains decimals exactly and refuses unexportable precision", () => {
    expect(toUnits(1.005)).toBe(1005);
    expect(() => toUnits(0.0001)).toThrow(/precision/);
    checkRoundTrip(context([line(1.005, 2.001, 1)], { placaBase: 1.005, placaAltura: 2.001 }), piece());
  });
  it("clips kerf at discarded boundary without negative remnants", () => {
    const { pattern } = checkRoundTrip(context([line(40, 60, 1)], { placaBase: 42 }), slice("x", [[40, piece()]]));
    expect(pattern.placa.restos).toHaveLength(0);
  });
  it("preserves a deliberate waste strip before a piece", () => {
    checkRoundTrip(context([line(40, 60, 1)], { placaBase: 85 }), slice("x", [[40, { kind: "waste" }], [40, piece()]]));
  });
  it("rejects empty, oversubscribed, malformed and cyclic trees", () => {
    const ctx = context([line(40, 60, 1)]);
    const cyclic = slice("x", [[40, {}]]); cyclic.parts[0].content = cyclic;
    for (const tree of [{ kind: "waste" }, siblings(), cyclic, slice("x", [[-1, piece()]]), slice("x", [[101, piece()]]),
      slice("x", [[100, piece()], [40, piece()]])]) expect(() => materializePattern(ctx, tree)).toThrow();
  });
  it("rejects excess stages, non-alternating cuts and premature terminal closure", () => {
    const ctx = context([line(40, 30, 1)], { placaAltura: 80, etapas: 1 });
    expect(() => materializePattern(ctx, slice("x", [[40, slice("y", [[30, piece()]])]]))).toThrow(/stage limit/);
    expect(() => materializePattern(context(), slice("x", [[40, slice("x", [[40, piece()]])]]))).toThrow(/alternate/);
    expect(() => materializePattern(context([line(40, 30, 1)]), slice("x", [[40, { kind: "terminal", type: 0 }]]))).toThrow(/stage limit/);
  });
  it("counts invalid materializations and permits bounded finalization after search stops", () => {
    const budget = createWorkBudget({ maxExpansions: 1, maxAndCombinations: 1, maxFrontierEntries: 1, maxMaterializations: 2 });
    budget.tryExpand(); budget.tryExpand();
    const ctx = context();
    expect(() => materializePattern(ctx, piece(), { budget })).toThrow();
    expect(materializePattern(ctx, siblings(), { budget }).status).toBe("COMPLETE");
    expect(materializePattern(ctx, siblings(), { budget })).toEqual({ status: "WORK_LIMIT", pattern: null });
    expect(budget.snapshot().used.materializations).toBe(2);
  });
  it("isolates context from external mutation and includes demand in context identity", () => {
    const lines = [line()]; const ctx = context(lines);
    lines[0].cant = 99;
    expect(ctx.types[0].quantity).toBe(2);
    expect(Object.isFrozen(ctx.lines[0])).toBe(true);
    expect(ctx.contextHash).not.toBe(context(lines).contextHash);
  });
  it("rejects corrupted XML geometry, links and layers independently of demand import", () => {
    const ctx = context();
    const { xml } = checkRoundTrip(ctx, siblings());
    for (const damaged of [xml.replace('cut="40"', 'cut="39"'), xml.replace('layer="3"', 'layer="4"'),
      xml.replace('type="2" id="1"', 'type="2" id="999"'), xml.replace('x="45"', 'x="44"')]) {
      expect(() => readB0PhysicalXml(damaged, ctx.opts, "x")).toThrow();
    }
  });
  it("exports an exact whole usable board with asymmetric trim", () => {
    checkRoundTrip(context([line(100, 60, 1)], { placaBase: 110, placaAltura: 80, refiladoX: 10, refiladoY: 20 }), piece());
  });
  it("repeats manual materialization deterministically without mutating the AST", () => {
    const ctx = context(), tree = siblings(), original = digest(tree);
    const hashes = Array.from({ length: 3 }, () => digest(materializePattern(ctx, tree).pattern.placa));
    expect(new Set(hashes).size).toBe(1);
    expect(digest(tree)).toBe(original);
  });
  it("rejects incomplete and excessive template coverage in the legacy reassignment", () => {
    const ctx = context([line(40, 60, 4)]), p = materializePattern(ctx, siblings()).pattern;
    expect(materializar([p], ctx.lines, ctx.opts)).toBeNull();
    expect(materializar([p, p, p], ctx.lines, ctx.opts)).toBeNull();
  });
  it("matches legacy fallback for an empty reference", () => {
    checkRoundTrip(context([line(100, 60, 1, "")]), piece());
  });
});

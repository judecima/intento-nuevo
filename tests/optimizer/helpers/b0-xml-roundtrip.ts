import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { validarPlacaIndustrial } = require("../../../src/lib/optimizer/legacy/validador_industrial_v3.cjs");
type Options = { placaBase: number; placaAltura: number; refiladoX: number; refiladoY: number; sierra: number };
type Rect = { x: number; y: number; w: number; h: number };
type Attrs = Record<string, string>;
const attrs = (source: string): Attrs => Object.fromEntries([...source.matchAll(/([\w.]+)="([^"]*)"/g)].map((m) => [m[1], m[2]
  .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")]));
const near = (a: number, b: number) => assert.ok(Number.isFinite(a) && Math.abs(a - b) < 1e-6, `${a} != ${b}`);

/** Independent test reader for the flat XML dialect emitted by the legacy
 * exporter. Reconstructs cuts from ordered XML parts, never from placa.cortes.
 * Root axis is fixture input: this XML dialect has no explicit direction field.
 * The production canonical importer is also exercised separately for demand.
 */
export function readB0PhysicalXml(xml: string, opts: Options, rootAxis: "x" | "y") {
  const panels = [...xml.matchAll(/<panel\d+\b([^>]*)>([\s\S]*?)<\/panel\d+>/g)];
  assert.ok(panels.length);
  return panels.map((panel) => {
    const header = attrs(panel[1]);
    near(+header.l, opts.placaBase); near(+header.w, opts.placaAltura); near(+header.saw, opts.sierra);
    const nodes = new Map<number, { a: Attrs; parts: Attrs[] }>();
    for (const match of panel[2].matchAll(/<no\.\d+\b([^>]*)>([\s\S]*?)<\/no\.\d+>/g)) {
      const a = attrs(match[1]);
      assert.ok(!nodes.has(+a.id), "duplicate XML node id");
      nodes.set(+a.id, { a, parts: [...match[2].matchAll(/<part\b([^>]*)\/>/g)].map((p) => attrs(p[1])) });
    }
    const visited = new Set<number>();
    const colocadas: Array<{ x: number; y: number; base: number; altura: number; pieza: { id: number; ref: string } }> = [];
    const cortes: Array<{ x1: number; y1: number; x2: number; y2: number; nivel: number; largo: number }> = [];
    function visit(id: number, region: Rect, axis: "x" | "y", level: number, finalCode?: string) {
      assert.ok(!visited.has(id), "cycle or shared physical XML node"); visited.add(id);
      const entry = nodes.get(id); assert.ok(entry, "missing XML child");
      const { a, parts } = entry;
      near(+a.layer, level); near(+a.x, region.x); near(+a.y, region.y);
      const along = axis === "x" ? region.w : region.h, perpendicular = axis === "x" ? region.h : region.w;
      const trim = axis === "x" ? opts.refiladoX : opts.refiladoY;
      near(+a.l, along + (level <= 2 ? trim : 0));
      near(+a.w, perpendicular + (level === 1 ? (axis === "x" ? opts.refiladoY : opts.refiladoX) : 0));
      near(+a.trim, level <= 2 ? trim : 0);
      if (finalCode !== undefined) {
        assert.equal(parts.length, 0, "final piece cannot contain more cuts");
        colocadas.push({ x: region.x, y: region.y, base: region.w, altura: region.h, pieza: { id: colocadas.length, ref: finalCode } });
      }
      let cursor = 0;
      for (const part of parts) {
        const thickness = +part.cut;
        assert.equal(+part.num, 1); assert.ok(+part.type === 1 || +part.type === 2);
        assert.ok(thickness > 0 && cursor + thickness <= along + 1e-6, "XML cut exceeds region");
        const block = axis === "x" ? { ...region, x: region.x + cursor, w: thickness } : { ...region, y: region.y + cursor, h: thickness };
        if (cursor + thickness < along - 1e-6) {
          const x = region.x + cursor + thickness, y = region.y + cursor + thickness;
          cortes.push(axis === "x" ? { x1: x, x2: x, y1: region.y, y2: region.y + region.h, nivel: level, largo: region.h }
            : { y1: y, y2: y, x1: region.x, x2: region.x + region.w, nivel: level, largo: region.w });
        }
        visit(+part.id, block, axis === "x" ? "y" : "x", level + 1, +part.type === 1 ? part.code : undefined);
        cursor = Math.min(along, cursor + thickness + opts.sierra);
      }
    }
    const ancho = opts.placaBase - opts.refiladoX, alto = opts.placaAltura - opts.refiladoY;
    visit(0, { x: 0, y: 0, w: ancho, h: alto }, rootAxis, 1);
    assert.equal(visited.size, nodes.size, "unreachable XML nodes");
    cortes.sort((a, b) => a.nivel - b.nivel);
    const board = { ancho, alto, colocadas, cortes, restos: [] };
    const validation = validarPlacaIndustrial(board, opts);
    assert.ok(validation.geometriaValida && validation.secuenciaCompleta, JSON.stringify(validation));
    return board;
  });
}

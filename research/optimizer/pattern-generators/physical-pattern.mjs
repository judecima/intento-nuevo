import { createRequire } from "node:module";
import { fromUnits, toUnits } from "./context.mjs";
import { digest } from "./canonical.mjs";
import { assertSliceStage, assertTerminalStage, oppositeAxis, partitionSlice } from "./cut-policy.mjs";
const require = createRequire(import.meta.url);
const { validarPlacaIndustrial } = require("../../../src/lib/optimizer/legacy/validador_industrial_v3.cjs");
const { exportarProjectXml } = require("../../../src/lib/optimizer/legacy/xml-exporter.cjs");

export const MATERIALIZER_VERSION = "b0-physical-pattern-v1";
const rectangle = (r) => ({ x: fromUnits(r.x), y: fromUnits(r.y), w: fromUnits(r.w), h: fromUnits(r.h) });
const node = (r, axis, level) => ({ ...rectangle(r), dir: axis, nivel: level, partes: [] });

/** Manual AST: piece, waste, slice {axis, parts:[{size, content}]}, terminal.
 * All sizes are mm. Geometry internally uses exact 0.001 mm units.
 * No search, pattern generation, or hidden legacy packing is performed here.
 */
export function materializePattern(context, tree, { budget, rootAxis = tree?.axis ?? "x" } = {}) {
  if (budget && !budget.tryMaterialize()) return { status: "WORK_LIMIT", pattern: null };
  oppositeAxis(rootAxis);
  const placed = [], cuts = [], remnants = [];
  const usage = context.types.map(() => 0);
  const active = new Set();

  function addRemnant(r) {
    if (r.w > 0 && r.h > 0) remnants.push(rectangle(r));
  }
  function addCut(r, axis, offset, level, terminal = false) {
    const x = r.x + (axis === "x" ? offset : 0), y = r.y + (axis === "y" ? offset : 0);
    cuts.push({ x1: fromUnits(x), y1: fromUnits(y),
      x2: fromUnits(axis === "x" ? x : r.x + r.w), y2: fromUnits(axis === "y" ? y : r.y + r.h),
      nivel: level, largo: fromUnits(axis === "x" ? r.h : r.w), ...(terminal ? { terminal: true } : {}) });
  }
  function place(ast, region, level, path) {
    if (!Number.isSafeInteger(ast.type) || !context.types[ast.type]) throw new RangeError("unknown piece type");
    if (ast.rotated != null && typeof ast.rotated !== "boolean") throw new TypeError("rotated must be boolean");
    const type = context.types[ast.type];
    const orientation = type.orientations.find((o) => o.rotated === (ast.rotated ?? false));
    if (!orientation) throw new Error("rotation forbidden for this type");
    if (orientation.width !== region.w || orientation.height !== region.h) throw new Error("piece must be exactly released by its region");
    if (++usage[ast.type] > type.quantity) throw new Error("pattern exceeds type demand");
    const line = context.lines[ast.type];
    const piece = { id: placed.length, base: line.base, altura: line.altura, ref: ast.type,
      detalle: line.detalle ?? String(type.reference), veta: Boolean(line.veta), cantos: structuredClone(line.cantos ?? null),
      _corte: { base: fromUnits(type.cutWidth), altura: fromUnits(type.cutHeight) }, _codigoXml: String(type.reference) };
    const final = { nivel: level, tipo: "B0 PIECE", region: rectangle(region), bloque: rectangle(region),
      piezaFinal: piece.detalle, refFinal: ast.type, rotada: orientation.rotated };
    placed.push({ x: fromUnits(region.x), y: fromUnits(region.y), base: fromUnits(region.w), altura: fromUnits(region.h),
      rotada: orientation.rotated, nivel: level, pieza: piece, _diagPath: [...path, final] });
    return piece;
  }
  function piecePart(ast, region, axis, level, path) {
    // Export adds perpendicular trim to level-2 nodes. A finished piece must
    // therefore have a level-3 leaf even when the level-1 strip is exact.
    // This full-span declaration creates no saw cut and consumes no kerf.
    const childAxis = oppositeAxis(axis);
    const child = node(region, childAxis, level + 1);
    const wrap = level === 1;
    const trace = wrap ? [...path, { nivel: level + 1, tipo: "B0 RELEASE", dir: childAxis,
      region: rectangle(region), bloque: rectangle(region) }] : path;
    const piece = place(ast, region, level + Number(wrap), trace);
    if (wrap) child.partes.push({ cut: fromUnits(childAxis === "x" ? region.w : region.h),
      type: 1, pieza: piece, bloque: rectangle(region), hijo: node(region, axis, level + 2) });
    return { cut: fromUnits(axis === "x" ? region.w : region.h), type: wrap ? 2 : 1,
      pieza: wrap ? null : piece, bloque: rectangle(region), hijo: child };
  }
  function build(ast, region, axis, level, path) {
    if (!ast || typeof ast !== "object" || active.has(ast)) throw new Error("invalid/cyclic cut tree");
    active.add(ast);
    try {
      const out = node(region, axis, level);
      if (ast.kind === "waste") { addRemnant(region); return out; }
      if (ast.kind === "piece") {
        if (level > context.opts.etapas + 1) throw new Error("piece beyond physical stage limit");
        out.partes.push(piecePart(ast, region, axis, level, path));
        return out;
      }
      if (ast.kind !== "slice") throw new Error("expected slice, exact piece, or waste");
      assertSliceStage(ast.axis, axis, level, context.opts.etapas);
      if (!Array.isArray(ast.parts) || !ast.parts.length) throw new Error("slice requires parts");
      let remaining = { ...region, axis };
      for (let i = 0; i < ast.parts.length; i++) {
        const part = ast.parts[i];
        const size = toUnits(part.size, "slice thickness");
        const { block, tail, cut } = partitionSlice(remaining, size, context.kerf, i + 1 < ast.parts.length);
        const step = { nivel: level, tipo: "B0 SLICE", dir: axis, region: rectangle(region),
          bloque: rectangle(block), rebanada: fromUnits(size), sierra: context.opts.sierra };
        const trace = [...path, step];
        const content = part.content;
        if (!content || typeof content !== "object") throw new Error("missing slice content");
        let child, directPart = null, terminal = false;
        if (content.kind === "piece") {
          directPart = piecePart(content, block, axis, level, trace);
        } else if (content.kind === "terminal") {
          assertTerminalStage(level, context.opts.etapas);
          const type = context.types[content.type];
          const orientation = type?.orientations.find((o) => o.rotated === (content.rotated ?? false));
          if (!orientation) throw new Error("unknown or forbidden terminal orientation");
          const perpendicular = axis === "x" ? orientation.height : orientation.width;
          const thickness = axis === "x" ? orientation.width : orientation.height;
          const span = axis === "x" ? block.h : block.w;
          if (thickness !== size || perpendicular <= 0 || perpendicular >= span) throw new Error("terminal closure requires a piece and residual strip");
          const target = { ...block, w: orientation.width, h: orientation.height };
          const terminalStep = { nivel: level + 1, tipo: "B0 TERMINAL", dir: oppositeAxis(axis),
            region: rectangle(block), bloque: rectangle(target), rebanada: fromUnits(perpendicular) };
          const actual = place(content, target, level + 1, [...trace, terminalStep]);
          child = node(block, oppositeAxis(axis), level + 1);
          child.partes.push({ cut: fromUnits(perpendicular), type: 1, pieza: actual, bloque: rectangle(target),
            hijo: node(target, axis, level + 2), terminal: true });
          addCut(block, oppositeAxis(axis), perpendicular, level + 1, true);
          const consumed = Math.min(span, perpendicular + context.kerf);
          addRemnant(axis === "x" ? { ...block, y: block.y + consumed, h: span - consumed }
            : { ...block, x: block.x + consumed, w: span - consumed });
          terminal = true;
        } else {
          child = build(content, block, oppositeAxis(axis), level + 1, trace);
        }
        out.partes.push(directPart ?? { cut: fromUnits(size), type: 2, pieza: null,
          bloque: rectangle(block), hijo: child, ...(terminal ? { terminal: true } : {}) });
        if (cut) addCut(remaining, axis, size, level);
        remaining = tail;
      }
      addRemnant(remaining);
      return out;
    } finally { active.delete(ast); }
  }

  const root = { x: 0, y: 0, w: context.width, h: context.height };
  const arbol = build(tree, root, rootAxis, 1, []);
  if (!placed.length) throw new Error("empty board is not a Master pattern");
  cuts.sort((a, b) => a.nivel - b.nivel);
  const placa = { ancho: fromUnits(context.width), alto: fromUnits(context.height), colocadas: placed, cortes: cuts, restos: remnants, arbol };
  const validation = validarPlacaIndustrial(placa, context.opts);
  if (!validation.geometriaValida || !validation.secuenciaCompleta) throw new Error(`invalid physical pattern: ${JSON.stringify(validation)}`);
  const pattern = { uso: new Map(usage.map((count, type) => [type, count]).filter(([, count]) => count)),
    area: placed.reduce((sum, p) => sum + p.base * p.altura, 0), placa };
  return { status: "COMPLETE", pattern, validation, contextHash: context.contextHash, materializerVersion: MATERIALIZER_VERSION };
}

export function exportPlanCopy(plan, metadata = {}) {
  const before = digest(plan);
  const xml = exportarProjectXml(structuredClone(plan), metadata);
  if (digest(plan) !== before) throw new Error("XML export mutated source plan");
  return xml;
}

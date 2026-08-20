/**
 * Modelo de vista del plano de corte.
 *
 * Convierte las filas persistidas de una optimizacion en una estructura plana y
 * serializable que el visor interactivo puede consumir desde el cliente. Aca se
 * concentran las reglas de presentacion que el optimizador original resolvia al
 * dibujar el SVG: offset de refilado, clasificacion de sobrantes, agrupacion del
 * listado de cortes y metros lineales de tapacanto.
 */

import type { OptimizationEdgeBandType, OptimizationResult } from "@/lib/optimizer/types";

export type CutPlanEdges = {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
};

export type CutPlanTraceStep = {
  level: number | null;
  type: string;
  region: { x: number; y: number; width: number; height: number } | null;
  block: { x: number; y: number; width: number; height: number } | null;
  slice: number | null;
  provisionalSlice: number | null;
  direction: string | null;
  multiplier: number | null;
  anchorPiece: string;
  anchorWidth: number | null;
  anchorHeight: number | null;
  anchorRotated: boolean;
};

export type CutPlanPiece = {
  id: string;
  index: number;
  reference: string;
  description: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotated: boolean;
  level: number;
  sourceWidth: number;
  sourceHeight: number;
  edges: CutPlanEdges;
  edgeType: OptimizationEdgeBandType;
  trace: CutPlanTraceStep[];
};

export type CutPlanCut = {
  id: string;
  index: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  level: number;
  length: number;
  terminal: boolean;
  direction: "x" | "y";
};

export type CutPlanRemnant = {
  id: string;
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  area: number;
  commercial: boolean;
};

export type CutPlanBoard = {
  index: number;
  width: number;
  height: number;
  usedArea: number;
  utilization: number;
  pieces: CutPlanPiece[];
  cuts: CutPlanCut[];
  remnants: CutPlanRemnant[];
};

export type CutPlanGroup = {
  key: string;
  description: string;
  reference: string;
  width: number;
  height: number;
  quantity: number;
  edges: CutPlanEdges;
  edgeType: OptimizationEdgeBandType;
  boards: number[];
};

export type CutPlanStockItem = {
  id: string;
  boardNumber: number;
  width: number;
  height: number;
  areaM2: number;
};

export type CutPlanMeta = {
  boardWidth: number;
  boardHeight: number;
  trimX: number;
  trimY: number;
  kerf: number;
  stages: number;
  remnantMinShortSide: number;
  remnantMinLongSide: number;
  materialCode: string;
  materialName: string;
  thickness: number;
  grain: boolean;
  strategy: string;
  profile: string;
  modeLabel: string;
  origin: string;
  algorithmVersion: string;
  projectVersion: number;
  createdAt: string;
  resultId: string;
  stale: boolean;
  valid: boolean;
};

export type CutPlanMetrics = {
  utilization: number;
  wastePercentage: number;
  boards: number;
  pieces: number;
  cutAreaM2: number;
  totalAreaM2: number;
  offcutAreaM2: number;
  cuts: number;
  sawMeters: number;
  remnantAreaM2: number;
  remnantCount: number;
  largestRemnantM2: number;
  secondLargestRemnantM2: number;
  remnantFragments: number;
  edgeMeters: number;
  edgeBand045Meters: number;
  edgeBand2mmMeters: number;
  edgeSides: number;
};

export type CutPlanView = {
  meta: CutPlanMeta;
  metrics: CutPlanMetrics;
  boards: CutPlanBoard[];
  groups: CutPlanGroup[];
  stock: CutPlanStockItem[];
};

type PieceRowLike = {
  id: string;
  board_index: number;
  piece_id: string;
  reference: string;
  description: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotated: boolean;
  level: number;
  raw_json: unknown;
};

type CutRowLike = {
  id: string;
  board_index: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  level: number;
  length: number;
  terminal: boolean;
};

type RemnantRowLike = {
  id: string;
  board_index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  area: number;
  commercial: boolean;
};

type BoardRowLike = {
  id: string;
  board_index: number;
  width: number;
  height: number;
};

type ResultRowLike = {
  id: string;
  project_version: number;
  board_count: number;
  piece_count: number;
  utilization_percentage: number;
  waste_percentage: number;
  commercial_remnant_area: number;
  cut_count: number;
  saw_meters: number;
  result_json: unknown;
  created_at: string;
};

type JobRowLike = {
  strategy: string;
  algorithm_version: string;
};

export type BuildCutPlanViewInput = {
  job: JobRowLike;
  result: ResultRowLike;
  boards: BoardRowLike[];
  pieces: PieceRowLike[];
  cuts: CutRowLike[];
  remnants: RemnantRowLike[];
  project: {
    version: number;
    board_width: number;
    board_height: number;
    board_thickness: number;
    kerf: number;
    trim_x: number;
    trim_y: number;
    min_remnant: number;
    grain_enabled: boolean;
  };
  material: {
    code: string | null;
    description: string | null;
  } | null;
};

export function buildCutPlanView(input: BuildCutPlanViewInput): CutPlanView {
  const legacyOptions = readLegacyOptions(input.result.result_json);
  const trimX = pickNumber(legacyOptions.refiladoX, input.project.trim_x, 0);
  const trimY = pickNumber(legacyOptions.refiladoY, input.project.trim_y, 0);
  const kerf = pickNumber(legacyOptions.sierra, input.project.kerf, 4.5);
  const remnantMinShortSide = pickNumber(legacyOptions.restoMin, input.project.min_remnant, 250);
  const remnantMinLongSide = pickNumber(
    legacyOptions.restoMax,
    Math.max(Number(input.project.min_remnant) || 0, 400),
    400
  );
  const boardWidth = pickNumber(legacyOptions.placaBase, input.project.board_width, 0);
  const boardHeight = pickNumber(legacyOptions.placaAltura, input.project.board_height, 0);

  const boards: CutPlanBoard[] = input.boards
    .slice()
    .sort((a, b) => a.board_index - b.board_index)
    .map((board) => {
      const pieces = input.pieces
        .filter((piece) => piece.board_index === board.board_index)
        .map(toPlanPiece);
      const cuts = input.cuts.filter((cut) => cut.board_index === board.board_index).map(toPlanCut);
      const remnants = input.remnants
        .filter((remnant) => remnant.board_index === board.board_index)
        .map(toPlanRemnant);

      const usedArea = pieces.reduce((total, piece) => total + piece.width * piece.height, 0);
      const grossArea = Number(board.width) * Number(board.height);

      return {
        index: board.board_index,
        width: Number(board.width),
        height: Number(board.height),
        usedArea,
        utilization: grossArea > 0 ? (usedArea / grossArea) * 100 : 0,
        pieces,
        cuts,
        remnants
      };
    });

  const totalAreaM2 = boards.reduce((total, board) => total + (board.width * board.height) / 1e6, 0);
  const cutAreaM2 = boards.reduce((total, board) => total + board.usedArea / 1e6, 0);
  const stock = buildStock(boards);
  const stockQuality = summarizeStock(stock);
  const legacySummary = readLegacySummary(input.result.result_json);
  const resultProfile = readResultProfile(input.result.result_json);
  const edgeSummary = summarizeEdges(boards);

  return {
    meta: {
      boardWidth,
      boardHeight,
      trimX,
      trimY,
      kerf,
      stages: pickNumber(legacyOptions.etapas, 4, 4),
      remnantMinShortSide,
      remnantMinLongSide,
      materialCode: input.material?.code ?? "",
      materialName: input.material?.description ?? "Material",
      thickness: Number(input.project.board_thickness) || 0,
      grain: Boolean(legacyOptions.materialConVeta ?? input.project.grain_enabled),
      strategy: input.job.strategy,
      profile: resultProfile,
      modeLabel: optimizationModeLabel(input.job.strategy, resultProfile),
      origin: String(legacyOptions.origen ?? ""),
      algorithmVersion: input.job.algorithm_version,
      projectVersion: Number(input.result.project_version),
      createdAt: input.result.created_at,
      resultId: input.result.id,
      stale: Number(input.result.project_version) !== Number(input.project.version),
      valid: readValidationOk(input.result.result_json)
    },
    metrics: {
      utilization: Number(input.result.utilization_percentage),
      wastePercentage: Number(input.result.waste_percentage),
      boards: boards.length || Number(input.result.board_count),
      pieces: boards.reduce((total, board) => total + board.pieces.length, 0) || Number(input.result.piece_count),
      cutAreaM2,
      totalAreaM2,
      offcutAreaM2: Math.max(0, totalAreaM2 - cutAreaM2),
      cuts: boards.reduce((total, board) => total + board.cuts.length, 0) || Number(input.result.cut_count),
      sawMeters: Number(input.result.saw_meters),
      remnantAreaM2: stockQuality.totalM2,
      remnantCount: stock.length,
      largestRemnantM2: pickNumber(legacySummary.mayorSobranteM2, stockQuality.largestM2, 0),
      secondLargestRemnantM2: pickNumber(legacySummary.segundoSobranteM2, stockQuality.secondLargestM2, 0),
      remnantFragments: Math.round(pickNumber(legacySummary.fragmentosComerciales, stockQuality.fragments, 0)),
      edgeMeters: edgeSummary.meters,
      edgeBand045Meters: edgeSummary.edgeBand045Meters,
      edgeBand2mmMeters: edgeSummary.edgeBand2mmMeters,
      edgeSides: edgeSummary.sides
    },
    boards,
    groups: buildGroups(boards),
    stock
  };
}

/**
 * Vista del plano para un resultado que todavia no se persistio (prueba desde
 * el editor). Reusa el mismo mapeo que los resultados guardados.
 */
export function cutPlanViewFromResult(
  result: OptimizationResult,
  context: Pick<BuildCutPlanViewInput, "project" | "material"> & { strategy: string }
): CutPlanView {
  return buildCutPlanView({
    job: { strategy: context.strategy, algorithm_version: result.algorithmVersion },
    result: {
      id: "draft",
      project_version: context.project.version,
      board_count: result.metrics.boardCount,
      piece_count: result.metrics.pieceCount,
      utilization_percentage: result.metrics.utilizationPercentage,
      waste_percentage: result.metrics.wastePercentage,
      commercial_remnant_area: result.metrics.commercialRemnantAreaM2,
      cut_count: result.metrics.cutCount,
      saw_meters: result.metrics.sawMeters,
      created_at: new Date().toISOString(),
      result_json: JSON.parse(JSON.stringify(result))
    },
    boards: result.boards.map((board) => ({
      id: `board-${board.boardIndex}`,
      board_index: board.boardIndex,
      width: board.width,
      height: board.height
    })),
    pieces: result.placements.map((placement, index) => ({
      id: `piece-${index}`,
      board_index: placement.boardIndex,
      piece_id: placement.pieceId,
      reference: placement.reference,
      description: placement.description,
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
      rotated: placement.rotated,
      level: placement.level,
      raw_json: placement
    })),
    cuts: result.cuts.map((cut, index) => ({
      id: `cut-${index}`,
      board_index: cut.boardIndex,
      x1: cut.x1,
      y1: cut.y1,
      x2: cut.x2,
      y2: cut.y2,
      level: cut.level,
      length: cut.length,
      terminal: cut.terminal
    })),
    remnants: result.remnants.map((remnant, index) => ({
      id: `remnant-${index}`,
      board_index: remnant.boardIndex,
      x: remnant.x,
      y: remnant.y,
      width: remnant.width,
      height: remnant.height,
      area: remnant.area,
      commercial: remnant.commercial
    })),
    project: context.project,
    material: context.material
  });
}

function toPlanPiece(row: PieceRowLike, index: number): CutPlanPiece {
  const raw = asRecord(row.raw_json);
  const edges = asRecord(raw.edges);
  const width = Number(row.width);
  const height = Number(row.height);
  const edgeType = readEdgeType(raw.edgeType, edges);

  return {
    id: row.id,
    index,
    reference: row.reference,
    description: row.description ?? "",
    x: Number(row.x),
    y: Number(row.y),
    width,
    height,
    rotated: Boolean(row.rotated),
    level: Number(row.level),
    sourceWidth: numberOr(raw.sourceWidth, row.rotated ? height : width),
    sourceHeight: numberOr(raw.sourceHeight, row.rotated ? width : height),
    edges: {
      top: Boolean(edges.top),
      bottom: Boolean(edges.bottom),
      left: Boolean(edges.left),
      right: Boolean(edges.right)
    },
    edgeType,
    trace: Array.isArray(raw.trace) ? (raw.trace as CutPlanTraceStep[]) : []
  };
}

function toPlanCut(row: CutRowLike, index: number): CutPlanCut {
  const x1 = Number(row.x1);
  const y1 = Number(row.y1);
  const x2 = Number(row.x2);
  const y2 = Number(row.y2);

  return {
    id: row.id,
    index,
    x1,
    y1,
    x2,
    y2,
    level: Number(row.level),
    length: Number(row.length),
    terminal: Boolean(row.terminal),
    direction: Math.abs(x2 - x1) >= Math.abs(y2 - y1) ? "x" : "y"
  };
}

function toPlanRemnant(row: RemnantRowLike, index: number): CutPlanRemnant {
  return {
    id: row.id,
    index,
    x: Number(row.x),
    y: Number(row.y),
    width: Number(row.width),
    height: Number(row.height),
    area: Number(row.area),
    commercial: Boolean(row.commercial)
  };
}

function buildGroups(boards: CutPlanBoard[]): CutPlanGroup[] {
  const groups = new Map<string, CutPlanGroup>();

  for (const board of boards) {
    for (const piece of board.pieces) {
      const key = `${piece.description}|${piece.sourceWidth}|${piece.sourceHeight}|${edgeKey(piece.edges)}|${piece.edgeType}`;
      const existing = groups.get(key);

      if (existing) {
        existing.quantity += 1;
        if (!existing.boards.includes(board.index + 1)) existing.boards.push(board.index + 1);
        continue;
      }

      groups.set(key, {
        key,
        description: piece.description || piece.reference || "Pieza",
        reference: piece.reference,
        width: piece.sourceWidth,
        height: piece.sourceHeight,
        quantity: 1,
        edges: piece.edges,
        edgeType: piece.edgeType,
        boards: [board.index + 1]
      });
    }
  }

  return [...groups.values()].sort((a, b) => b.width * b.height - a.width * a.height);
}

function buildStock(boards: CutPlanBoard[]): CutPlanStockItem[] {
  const items: CutPlanStockItem[] = [];

  for (const board of boards) {
    for (const remnant of board.remnants) {
      if (!remnant.commercial) continue;
      items.push({
        id: remnant.id,
        boardNumber: board.index + 1,
        width: remnant.width,
        height: remnant.height,
        areaM2: (remnant.width * remnant.height) / 1e6
      });
    }
  }

  return items.sort((a, b) => b.areaM2 - a.areaM2);
}

function summarizeStock(stock: CutPlanStockItem[]): {
  totalM2: number;
  largestM2: number;
  secondLargestM2: number;
  fragments: number;
} {
  const areas = stock.map((item) => item.areaM2).sort((a, b) => b - a);

  return {
    totalM2: areas.reduce((total, area) => total + area, 0),
    largestM2: areas[0] ?? 0,
    secondLargestM2: areas[1] ?? 0,
    fragments: areas.length
  };
}

function summarizeEdges(boards: CutPlanBoard[]): {
  meters: number;
  edgeBand045Meters: number;
  edgeBand2mmMeters: number;
  sides: number;
} {
  let edgeBand045Meters = 0;
  let edgeBand2mmMeters = 0;
  let sides = 0;

  for (const board of boards) {
    for (const piece of board.pieces) {
      // El largo del canto es el del lado original de la pieza: rotarla en la
      // placa no cambia cuanto tapacanto consume.
      for (const side of ["top", "bottom", "left", "right"] as const) {
        if (!piece.edges[side]) continue;
        sides += 1;
        const meters = (side === "left" || side === "right" ? piece.sourceHeight : piece.sourceWidth) / 1000;
        if (piece.edgeType === "thin" || piece.edgeType === "both") edgeBand045Meters += meters;
        if (piece.edgeType === "thick" || piece.edgeType === "both") edgeBand2mmMeters += meters;
      }
    }
  }

  return {
    meters: edgeBand045Meters + edgeBand2mmMeters,
    edgeBand045Meters,
    edgeBand2mmMeters,
    sides
  };
}

function readEdgeType(value: unknown, edges: Record<string, unknown>): OptimizationEdgeBandType {
  const hasEdges = Object.values(edges).some(Boolean);
  if (value === "thin" || value === "thick" || value === "both") return value;
  if (value === "none") return hasEdges ? "thin" : "none";
  return hasEdges ? "thin" : "none";
}

function edgeKey(edges: CutPlanEdges): string {
  return `${edges.top ? "A" : "-"}${edges.bottom ? "B" : "-"}${edges.left ? "I" : "-"}${edges.right ? "D" : "-"}`;
}

export function edgeLabel(edges: CutPlanEdges): string {
  const label = [edges.top && "A", edges.bottom && "B", edges.left && "I", edges.right && "D"]
    .filter(Boolean)
    .join(" ");
  return label || "—";
}

function readLegacyOptions(resultJson: unknown): Record<string, unknown> {
  const result = asRecord(resultJson);
  const raw = asRecord(result.raw);
  const options = asRecord(raw.opts);
  const summary = asRecord(raw.resumen);
  return { ...options, origen: summary.origen };
}

function readLegacySummary(resultJson: unknown): Record<string, unknown> {
  const result = asRecord(resultJson);
  const raw = asRecord(result.raw);
  return asRecord(raw.resumen);
}

function readValidationOk(resultJson: unknown): boolean {
  const result = asRecord(resultJson);
  const validation = asRecord(result.validation);
  return validation.ok !== false;
}

function readResultProfile(resultJson: unknown): string {
  const result = asRecord(resultJson);
  const profile = result.profile;
  return typeof profile === "string" && profile ? profile : "";
}

function optimizationModeLabel(strategy: string, profile: string): string {
  if (strategy === "baseline" && profile === "fast") return "Baseline rapido";
  if (strategy === "v10" && profile === "fast") return "V10 rapido";
  if (strategy === "v10" && profile === "balanced") return "V10 balanceado / Lepton";
  if (strategy === "v10" && profile === "deep") return "V10 profundo";
  return profile ? `${strategy} ${profile}` : strategy;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function numberOr(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function pickNumber(primary: unknown, secondary: unknown, fallback: number): number {
  const first = Number(primary);
  if (Number.isFinite(first)) return first;
  const second = Number(secondary);
  if (Number.isFinite(second)) return second;
  return fallback;
}

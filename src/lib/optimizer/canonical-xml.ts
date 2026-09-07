import {
  normalizeCanonicalOptimizationCase,
  type CanonicalCaseSource,
  type CanonicalGrainSource,
  type CanonicalOptimizationCase,
  type CanonicalOptimizationPiece,
  type CanonicalRotationSource
} from "./canonical-case";

type XmlFormat = "project" | "order";
type XmlDirection = "x" | "y";
type KerfSource = "xml" | "default";
type PieceOrientationSource = "normalized-from-placement" | "xml-declared";

interface XmlNode {
  name: string;
  attributes: Record<string, string>;
  children: XmlNode[];
}

export interface CanonicalXmlParseOptions {
  fileName?: string;
  defaultKerf?: number;
  defaultMinRemnant?: number;
  defaultMinCommercialRemnantLongSide?: number;
}

export interface CanonicalXmlParseStats {
  root: string;
  format: XmlFormat;
  boardFormats: string[];
  materials: string[];
  kerfSource: KerfSource;
  pieceTypes: number;
  pieceQuantity: number;
  warnings: number;
  /**
   * "normalized-from-placement": el XML solo muestra como Lepton ubico la pieza, y esa
   * orientacion varia entre paneles del mismo archivo, asi que la pieza canonica se
   * normaliza a lado mayor x lado menor (project).
   * "xml-declared": las dimensiones vienen declaradas en la demanda (Order).
   */
  pieceOrientation: PieceOrientationSource;
  /** Direccion de corte del nodo raiz por panel (solo project). */
  rootDirections?: XmlDirection[];
  /** Atributo trim del nodo raiz, conservado solo como referencia (solo project). */
  trimReference?: number[];
}

export interface CanonicalXmlParseResult {
  case: CanonicalOptimizationCase;
  format: XmlFormat;
  warnings: string[];
  stats: CanonicalXmlParseStats;
}

export class CanonicalXmlParseError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly fileName?: string
  ) {
    super(fileName ? `${fileName}: ${message}` : message);
    this.name = "CanonicalXmlParseError";
  }
}

export function parseCanonicalXml(xml: string, options: CanonicalXmlParseOptions = {}): CanonicalXmlParseResult {
  const root = parseXmlDocument(xml, options.fileName);
  const normalizedRoot = root.name.toLowerCase();

  if (normalizedRoot === "project") return parseProjectXml(root, options);
  if (normalizedRoot === "order") return parseOrderXml(root, options);

  throw parseError(`unsupported XML root <${root.name}>`, "unsupported-root", options.fileName);
}

interface ProjectPanelShape {
  index: number;
  info: ReturnType<typeof readProjectPanel>;
  nodes: XmlNode[];
  byId: Map<string, XmlNode>;
  rootNode: XmlNode;
  direction: XmlDirection | null;
}

function parseProjectXml(root: XmlNode, options: CanonicalXmlParseOptions): CanonicalXmlParseResult {
  const warnings: string[] = [];
  const panels = root.children.filter((child) => /^panel\d+$/i.test(child.name));
  if (panels.length === 0) throw parseError("project XML does not contain panel nodes", "project-no-panels", options.fileName);

  const shapes = panels.map((panel, index) => readProjectPanelShape(panel, index, options, warnings));
  const first = shapes[0];
  if (!first) throw parseError("project XML does not contain readable panels", "project-no-readable-panels", options.fileName);

  // Todos los <panelN> de un mismo project son el mismo tablero, asi que el marco global
  // resuelto en un panel con evidencia sirve para desambiguar los paneles que no la tienen.
  const reference = shapes.find((shape) => shape.direction != null);
  const referenceFrame = reference?.direction
    ? globalProjectNodeDimensions(reference.rootNode, reference.direction, options.fileName)
    : null;
  for (const shape of shapes) {
    shape.direction = shape.direction ?? resolveProjectRootDirection(shape, referenceFrame, warnings, options.fileName);
  }

  const rootDirections: XmlDirection[] = [];
  const trimReference: number[] = [];
  const boardFormats: string[] = [];
  let panelFrame: { width: number; height: number } | null = null;
  const grouped = new Map<string, CanonicalOptimizationPiece>();

  for (const shape of shapes) {
    const rootDirection = shape.direction as XmlDirection;
    rootDirections.push(rootDirection);
    const rootTrim = numberAttr(shape.rootNode, ["trim", "Trim"]);
    if (rootTrim != null) trimReference.push(rootTrim);

    // El marco global del panel se toma del nodo raiz ya transformado, no de panel l/w:
    // panel l/w nombra el mismo rectangulo pero no siempre en orden ancho/alto global.
    const frame = globalProjectNodeDimensions(shape.rootNode, rootDirection, options.fileName);
    const board = landscape(frame);
    if (!sameRectangle(frame, shape.info)) {
      warnings.push(
        warning(
          options.fileName,
          `project panel ${shape.index + 1} declares ${formatNumber(shape.info.width)}x${formatNumber(shape.info.height)} but its root node spans ${formatNumber(frame.width)}x${formatNumber(frame.height)}`
        )
      );
    }
    panelFrame = panelFrame ?? board;
    boardFormats.push(boardKey(board.width, board.height, shape.info.material.thickness, shape.info.material.description, shape.info.kerf));

    for (const node of shape.nodes) {
      const parentLayer = positiveNumberAttr(node, ["layer"], `node ${node.name} layer`, options.fileName);
      for (const part of node.children.filter((child) => child.name.toLowerCase() === "part")) {
        if (integerAttr(part, ["type"], 0) !== 1) continue;

        const childId = attr(part, "id");
        if (childId == null) throw parseError("project terminal part without child id", "project-terminal-without-id", options.fileName);

        const child = shape.byId.get(childId);
        if (!child) throw parseError(`project terminal part references missing node id ${childId}`, "project-terminal-missing-node", options.fileName);

        const childLayer = positiveNumberAttr(child, ["layer"], `terminal node ${childId} layer`, options.fileName);
        if (childLayer !== parentLayer + 1) {
          warnings.push(warning(options.fileName, `project terminal node ${childId} jumps from layer ${parentLayer} to ${childLayer}`));
        }

        const placed = globalProjectNodeDimensions(child, rootDirection, options.fileName);
        const placedX = numberAttr(child, ["x", "X"]) ?? 0;
        const placedY = numberAttr(child, ["y", "Y"]) ?? 0;
        if (placedX + placed.width > frame.width + FIT_TOLERANCE || placedY + placed.height > frame.height + FIT_TOLERANCE) {
          warnings.push(
            warning(
              options.fileName,
              `project terminal node ${childId} spans ${formatNumber(placed.width)}x${formatNumber(placed.height)} at ${formatNumber(placedX)},${formatNumber(placedY)} outside the ${formatNumber(frame.width)}x${formatNumber(frame.height)} panel frame`
            )
          );
        }

        // La orientacion colocada es una decision de Lepton y cambia entre paneles del
        // mismo archivo, asi que la pieza canonica se normaliza a mayor x menor.
        const dimensions = landscape(placed);
        const quantity = positiveIntegerAttr(part, ["num"], 1, options.fileName) * shape.info.quantity;
        const code = nonEmpty(attr(part, "code"));
        addGroupedPiece(grouped, {
          reference: code ?? `project-${formatNumber(dimensions.width)}x${formatNumber(dimensions.height)}`,
          width: dimensions.width,
          height: dimensions.height,
          quantity,
          grain: null,
          grainSource: "unknown",
          rotationAllowed: null,
          rotationSource: "unknown",
          edges: emptyEdges()
        });
      }
    }
  }

  const pieces = [...grouped.values()];
  if (pieces.length === 0) throw parseError("project XML has no terminal pieces", "project-no-terminal-pieces", options.fileName);
  ensureSingleBoardFormat(boardFormats, "project", options.fileName);
  if (!panelFrame) throw parseError("project XML does not contain readable panels", "project-no-readable-panels", options.fileName);

  return buildResult({
    source: "xml-project",
    format: "project",
    warnings,
    boardFormats: [boardFormats[0] as string],
    materials: [first.info.material.description],
    kerfSource: first.info.kerfSource,
    pieceOrientation: "normalized-from-placement",
    rootDirections,
    trimReference,
    canonicalCase: {
      source: "xml-project",
      panel: {
        width: panelFrame.width,
        height: panelFrame.height,
        thickness: first.info.material.thickness
      },
      trim: { x: 0, y: 0 },
      kerf: first.info.kerf,
      material: first.info.material,
      constraints: defaultConstraints(options),
      pieces
    }
  });
}

function readProjectPanelShape(
  panel: XmlNode,
  index: number,
  options: CanonicalXmlParseOptions,
  warnings: string[]
): ProjectPanelShape {
  const info = readProjectPanel(panel, options, warnings);
  const nodes = panel.children.filter((child) => /^no\.\d+$/i.test(child.name));
  if (nodes.length === 0) throw parseError(`panel ${index + 1} has no <no.N> nodes`, "project-panel-no-nodes", options.fileName);

  const byId = new Map<string, XmlNode>();
  let roots = 0;
  for (const node of nodes) {
    const id = attr(node, "id");
    if (id == null) throw parseError(`panel ${index + 1} has a node without id`, "project-node-without-id", options.fileName);
    if (id === "0") roots++;
    else if (byId.has(id)) {
      throw parseError(`panel ${index + 1} has duplicated node id ${id}`, "project-duplicated-node-id", options.fileName);
    }
    byId.set(id, node);
  }

  const rootNode = byId.get("0");
  if (!rootNode) throw parseError(`panel ${index + 1} has no root node id=0`, "project-no-root-node", options.fileName);
  if (roots !== 1) throw parseError(`panel ${index + 1} has ${roots} root nodes id=0`, "project-multiple-root-nodes", options.fileName);

  return { index, info, nodes, byId, rootNode, direction: inferProjectRootDirection(nodes, byId, warnings, options.fileName) };
}

function resolveProjectRootDirection(
  shape: ProjectPanelShape,
  referenceFrame: { width: number; height: number } | null,
  warnings: string[],
  fileName?: string
): XmlDirection {
  const frameOf = (direction: XmlDirection) => globalProjectNodeDimensions(shape.rootNode, direction, fileName);

  if (referenceFrame) {
    const matchesX = sameFrame(frameOf("x"), referenceFrame);
    const matchesY = sameFrame(frameOf("y"), referenceFrame);
    if (matchesX !== matchesY) return matchesX ? "x" : "y";
    if (matchesX && matchesY) return "x";
  }

  const fitsX = projectDirectionFits(shape.nodes, "x", fileName);
  const fitsY = projectDirectionFits(shape.nodes, "y", fileName);
  if (fitsX !== fitsY) {
    warnings.push(warning(fileName, `project panel ${shape.index + 1} root direction inferred from containment only: ${fitsX ? "x" : "y"}`));
    return fitsX ? "x" : "y";
  }

  warnings.push(warning(fileName, `project panel ${shape.index + 1} root direction is undetermined; assuming x`));
  return "x";
}

const FIT_TOLERANCE = 0.6;

/** Normaliza un rectangulo a lado mayor x lado menor. */
function landscape(value: { width: number; height: number }): { width: number; height: number } {
  return value.width >= value.height
    ? { width: value.width, height: value.height }
    : { width: value.height, height: value.width };
}

function sameFrame(a: { width: number; height: number }, b: { width: number; height: number }): boolean {
  return sameNumber(a.width, b.width) && sameNumber(a.height, b.height);
}

function parseOrderXml(root: XmlNode, options: CanonicalXmlParseOptions): CanonicalXmlParseResult {
  const warnings: string[] = [];
  const workList = child(root, "WorkList");
  if (!workList) throw parseError("Order XML does not contain WorkList", "order-no-worklist", options.fileName);

  const boards = workList.children
    .filter((node) => node.name.toLowerCase() === "job")
    .flatMap((job) => job.children.filter((node) => node.name.toLowerCase() === "board"));
  if (boards.length === 0) throw parseError("Order XML does not contain Job/Board stock data", "order-no-board", options.fileName);

  const boardInfos = boards.map((board) => readOrderBoard(board, root, workList, options, warnings));
  ensureSingleBoardFormat(boardInfos.map((info) => info.boardKey), "Order", options.fileName);
  const first = boardInfos[0];
  if (!first) throw parseError("Order XML does not contain readable board data", "order-no-readable-board", options.fileName);

  const partNodes = workList.children.filter((node) => node.name.toLowerCase() === "part");
  if (partNodes.length === 0) throw parseError("Order XML does not contain Part demand nodes", "order-no-parts", options.fileName);

  const grouped = new Map<string, CanonicalOptimizationPiece>();
  for (const part of partNodes) {
    const width = positiveNumberAttr(part, ["L", "l"], "Order Part L", options.fileName);
    const height = positiveNumberAttr(part, ["W", "w"], "Order Part W", options.fileName);
    const quantity = positiveIntegerAttr(part, ["qMin", "QMin", "Q", "q"], 1, options.fileName);
    const rawGrain = attr(part, "Grain");
    const grain = rawGrain == null ? null : parseStandardBoolean(rawGrain, "Order Part Grain", options.fileName);
    const rotation = readRotationAllowed(part, first.material.hasGrain, grain);

    if (rawGrain == null) warnings.push(warning(options.fileName, `Order Part ${attr(part, "id") ?? attr(part, "Code") ?? ""} has no Grain attribute`));

    addGroupedPiece(grouped, {
      reference: nonEmpty(attr(part, "Code")) ?? nonEmpty(attr(part, "id")) ?? `order-${formatNumber(width)}x${formatNumber(height)}`,
      description: nonEmpty(attr(part, "IDesc")),
      width,
      height,
      quantity,
      grain,
      grainSource: rawGrain == null ? "unknown" : "xml",
      grainConfidence: rawGrain == null ? undefined : 1,
      rawGrain,
      rotationAllowed: rotation.value,
      rotationSource: rotation.source,
      edges: {
        left: hasValue(attr(part, "MatEdgeL")),
        right: hasValue(attr(part, "MatEdgeR")),
        top: hasValue(attr(part, "MatEdgeUp")),
        bottom: hasValue(attr(part, "MatEdgeLo"))
      }
    });
  }

  const pieces = [...grouped.values()];
  if (pieces.length === 0) throw parseError("Order XML produced no pieces", "order-no-canonical-pieces", options.fileName);

  return buildResult({
    source: "xml-order",
    format: "order",
    warnings,
    boardFormats: [first.boardKey],
    materials: [first.material.description],
    kerfSource: first.kerfSource,
    pieceOrientation: "xml-declared",
    canonicalCase: {
      source: "xml-order",
      panel: {
        width: first.width,
        height: first.height,
        thickness: first.material.thickness
      },
      trim: { x: 0, y: 0 },
      kerf: first.kerf,
      material: first.material,
      constraints: defaultConstraints(options),
      pieces
    }
  });
}

function buildResult(input: {
  source: CanonicalCaseSource;
  format: XmlFormat;
  warnings: string[];
  boardFormats: string[];
  materials: string[];
  kerfSource: KerfSource;
  pieceOrientation: PieceOrientationSource;
  rootDirections?: XmlDirection[];
  trimReference?: number[];
  canonicalCase: CanonicalOptimizationCase;
}): CanonicalXmlParseResult {
  const canonicalCase = normalizeCanonicalOptimizationCase(input.canonicalCase);
  return {
    case: canonicalCase,
    format: input.format,
    warnings: input.warnings,
    stats: {
      root: input.source === "xml-project" ? "project" : "Order",
      format: input.format,
      boardFormats: input.boardFormats,
      materials: input.materials,
      kerfSource: input.kerfSource,
      pieceTypes: canonicalCase.pieces.length,
      pieceQuantity: canonicalCase.pieces.reduce((sum, piece) => sum + piece.quantity, 0),
      warnings: input.warnings.length,
      pieceOrientation: input.pieceOrientation,
      ...(input.rootDirections ? { rootDirections: input.rootDirections } : {}),
      ...(input.trimReference ? { trimReference: input.trimReference } : {})
    }
  };
}

function readProjectPanel(panel: XmlNode, options: CanonicalXmlParseOptions, warnings: string[]) {
  const width = positiveNumberAttr(panel, ["l", "L"], "project panel l", options.fileName);
  const height = positiveNumberAttr(panel, ["w", "W"], "project panel w", options.fileName);
  const kerfValue = numberAttr(panel, ["saw", "Saw", "kerf", "Kerf"]);
  const kerfSource: KerfSource = kerfValue == null ? "default" : "xml";
  if (kerfValue == null) warnings.push(warning(options.fileName, "project panel has no saw/kerf; using default 4.5"));
  const materialDescription = nonEmpty(attr(panel, "material")) ?? "UNKNOWN";
  const thickness = numberAttr(panel, ["thickness", "Thickness"]);
  const quantity = positiveIntegerAttr(panel, ["num", "Num"], 1, options.fileName);
  const material = {
    description: materialDescription,
    hasGrain: null,
    grainSource: "unknown" as CanonicalGrainSource,
    thickness: thickness ?? undefined
  };
  const kerf = kerfValue ?? options.defaultKerf ?? 4.5;
  return {
    width,
    height,
    kerf,
    kerfSource,
    quantity,
    material,
    boardKey: boardKey(width, height, material.thickness, material.description, kerf)
  };
}

function readOrderBoard(board: XmlNode, root: XmlNode, workList: XmlNode, options: CanonicalXmlParseOptions, warnings: string[]) {
  const width = positiveNumberAttr(board, ["L", "l"], "Order Board L", options.fileName);
  const height = positiveNumberAttr(board, ["W", "w"], "Order Board W", options.fileName);
  const thickness = numberAttr(board, ["Thickness", "thickness"]);
  const materialCode = nonEmpty(attr(board, "MatCode")) ?? nonEmpty(attr(board, "Code")) ?? "UNKNOWN";
  const materialId = nonEmpty(attr(board, "MatNo")) ?? nonEmpty(attr(workList, "MaterialID"));
  const rawBoardGrain = attr(board, "Grain");
  const hasGrain = rawBoardGrain == null ? null : parseOrderBoardGrain(rawBoardGrain, options.fileName);
  const kerfValue =
    numberAttr(board, ["Saw", "saw", "Kerf", "kerf"]) ??
    numberAttr(workList, ["Saw", "saw", "Kerf", "kerf"]) ??
    numberAttr(root, ["Saw", "saw", "Kerf", "kerf"]);
  const kerfSource: KerfSource = kerfValue == null ? "default" : "xml";
  if (kerfValue == null) warnings.push(warning(options.fileName, "Order XML has no saw/kerf; using default 4.5"));
  if (rawBoardGrain == null) warnings.push(warning(options.fileName, "Order Board has no Grain attribute"));

  const kerf = kerfValue ?? options.defaultKerf ?? 4.5;
  const material = {
    id: materialId,
    code: materialCode,
    description: materialCode,
    hasGrain,
    grainSource: rawBoardGrain == null ? "unknown" as CanonicalGrainSource : "xml" as CanonicalGrainSource,
    grainConfidence: rawBoardGrain == null ? undefined : 1,
    rawGrain: rawBoardGrain,
    thickness: thickness ?? undefined
  };

  return {
    width,
    height,
    kerf,
    kerfSource,
    material,
    boardKey: boardKey(width, height, material.thickness, material.description, kerf)
  };
}

/**
 * La direccion de corte del nodo raiz se infiere de las coordenadas reales: los hijos de
 * un nodo avanzan sobre el eje de corte de ese nodo, y la direccion alterna por layer.
 *
 * NO se infiere comparando root l/w contra panel l/w: panel l/w nombra el mismo
 * rectangulo que el nodo raiz pero no necesariamente en orden ancho/alto global.
 * Medido sobre el corpus real (800 XML project, 2427 paneles), la inferencia por
 * panel l/w produce cajas fuera del tablero en 1198 paneles (49.4%), mientras que la
 * inferencia por coordenadas encaja en 2366/2366 paneles resolubles, sin conflictos
 * internos, y discrepa de la inferencia por panel en 1253 paneles (53%).
 */
function inferProjectRootDirection(
  nodes: XmlNode[],
  byId: Map<string, XmlNode>,
  warnings: string[],
  fileName?: string
): XmlDirection | null {
  let inferred: XmlDirection | null = null;

  for (const node of nodes) {
    const layer = positiveIntegerAttr(node, ["layer"], undefined, fileName);
    const children = node.children
      .filter((child) => child.name.toLowerCase() === "part")
      .map((part) => byId.get(attr(part, "id") ?? ""))
      .filter((child): child is XmlNode => child != null);
    if (children.length < 2) continue;

    const xs = new Set(children.map((child) => numberAttr(child, ["x", "X"]) ?? 0));
    const ys = new Set(children.map((child) => numberAttr(child, ["y", "Y"]) ?? 0));
    const observed: XmlDirection | null = xs.size > 1 && ys.size === 1 ? "x" : ys.size > 1 && xs.size === 1 ? "y" : null;
    if (!observed) continue;

    const candidate = layer % 2 === 1 ? observed : flipDirection(observed);
    if (inferred != null && inferred !== candidate) {
      warnings.push(warning(fileName, "project node cut directions are inconsistent; keeping the first observation"));
      break;
    }
    inferred = inferred ?? candidate;
  }

  // Sin dos hermanos en origenes distintos no hay evidencia directa en este panel:
  // la resolucion queda para resolveProjectRootDirection, que usa el marco compartido.
  return inferred;
}

function projectDirectionFits(nodes: XmlNode[], rootDirection: XmlDirection, fileName?: string): boolean {
  const root = nodes.find((node) => attr(node, "id") === "0");
  if (!root) return false;

  const frame = globalProjectNodeDimensions(root, rootDirection, fileName);
  return nodes.every((node) => {
    const dimensions = globalProjectNodeDimensions(node, rootDirection, fileName);
    const x = numberAttr(node, ["x", "X"]) ?? 0;
    const y = numberAttr(node, ["y", "Y"]) ?? 0;
    return x + dimensions.width <= frame.width + 0.6 && y + dimensions.height <= frame.height + 0.6;
  });
}

function flipDirection(direction: XmlDirection): XmlDirection {
  return direction === "x" ? "y" : "x";
}

function sameRectangle(a: { width: number; height: number }, b: { width: number; height: number }): boolean {
  return (
    (sameNumber(a.width, b.width) && sameNumber(a.height, b.height)) ||
    (sameNumber(a.width, b.height) && sameNumber(a.height, b.width))
  );
}

/**
 * En un XML <project> los atributos l/w de un <no.N> NO son ancho/alto globales: estan
 * expresados sobre el eje de corte del propio nodo. La transformacion se deriva del
 * exportador legacy (src/lib/optimizer/legacy/xml-exporter.cjs, dimsNodoXml):
 *
 *   l = dir === "x" ? anchoGlobal : altoGlobal
 *   w = dir === "x" ? altoGlobal  : anchoGlobal
 *
 * y en el motor legacy (motor.cjs) la direccion alterna en cada nivel del arbol
 * (dirHijo = dir === x ? y : x), de modo que dir(layer) depende solo de la paridad del
 * layer respecto de la direccion del nodo raiz.
 *
 * Verificado sobre el corpus real (D:proyectos asistidosleptondatalepton-xml,
 * 1500 XML project, 4527 paneles, 82444 relaciones padre/hijo) con el invariante
 * "el hijo mide exactamente part.cut sobre el eje de corte del padre":
 *   - transformacion por paridad de layer: 82444/82444 (100%)
 *   - leer width=l / height=w directamente: 41485/82444 (50.3%)
 * Direccion del nodo raiz observada: x en 2307 paneles, y en 2220.
 */
function globalProjectNodeDimensions(node: XmlNode, rootDirection: XmlDirection, fileName?: string) {
  const l = positiveNumberAttr(node, ["l", "L"], `project node ${node.name} l`, fileName);
  const w = positiveNumberAttr(node, ["w", "W"], `project node ${node.name} w`, fileName);
  const layer = positiveIntegerAttr(node, ["layer"], undefined, fileName);
  const direction = nodeDirection(rootDirection, layer);
  return direction === "x"
    ? { width: roundDimension(l), height: roundDimension(w) }
    : { width: roundDimension(w), height: roundDimension(l) };
}

function nodeDirection(rootDirection: XmlDirection, layer: number): XmlDirection {
  return layer % 2 === 1 ? rootDirection : flipDirection(rootDirection);
}

function readRotationAllowed(
  part: XmlNode,
  materialHasGrain: boolean | null,
  pieceGrain: boolean | null
): { value: boolean | null; source: CanonicalRotationSource } {
  const explicit = attr(part, "CanRotate", "RotationAllowed", "AllowRotate", "Rotate", "Rot");
  if (explicit != null) return { value: parseRotationBoolean(explicit), source: "xml" };
  if (materialHasGrain != null && pieceGrain != null) {
    return { value: !(materialHasGrain && pieceGrain), source: "grain-rule" };
  }
  return { value: null, source: "unknown" };
}

function addGroupedPiece(grouped: Map<string, CanonicalOptimizationPiece>, piece: CanonicalOptimizationPiece): void {
  const key = pieceGroupKey(piece);
  const existing = grouped.get(key);
  if (existing) {
    existing.quantity += piece.quantity;
    return;
  }
  grouped.set(key, { ...piece });
}

function pieceGroupKey(piece: CanonicalOptimizationPiece): string {
  return [
    piece.reference,
    piece.description ?? "",
    piece.width,
    piece.height,
    piece.grain === null ? "null" : String(piece.grain),
    piece.grainSource,
    piece.rawGrain ?? "",
    piece.rotationAllowed === null ? "null" : String(piece.rotationAllowed),
    piece.rotationSource,
    piece.family ?? "",
    piece.edges.top ? "T" : "",
    piece.edges.bottom ? "B" : "",
    piece.edges.left ? "L" : "",
    piece.edges.right ? "R" : "",
    piece.edgeType ?? ""
  ].join("|");
}

/**
 * El optimizador trabaja con un unico formato de tablero por caso. Un XML que mezcla
 * medidas o materiales de panel no se puede representar como un CanonicalOptimizationCase,
 * asi que se excluye del dataset: no es un XML corrupto, es un caso fuera de alcance.
 * El benchmark HTML existente aplica el mismo criterio ("stock mixto").
 */
function ensureSingleBoardFormat(keys: string[], format: string, fileName?: string): void {
  if (new Set(keys).size > 1) throw parseError(`${format} XML uses mixed board formats`, "mixed-board-formats", fileName);
}

function defaultConstraints(options: CanonicalXmlParseOptions) {
  return {
    stages: 4,
    minRemnant: options.defaultMinRemnant ?? 250,
    minCommercialRemnantLongSide: options.defaultMinCommercialRemnantLongSide ?? 400
  };
}

function boardKey(width: number, height: number, thickness: number | undefined, material: string, kerf: number): string {
  return `${formatNumber(width)}x${formatNumber(height)}x${formatNumber(thickness)}|${material}|kerf=${formatNumber(kerf)}`;
}

function emptyEdges() {
  return { top: false, bottom: false, left: false, right: false };
}

function parseOrderBoardGrain(raw: string, fileName?: string): boolean {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "0") return true;
  if (normalized === "1") return false;
  return parseStandardBoolean(raw, "Order Board Grain", fileName);
}

function parseStandardBoolean(raw: string, label: string, fileName?: string): boolean {
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "y", "si", "s"].includes(normalized)) return true;
  if (["0", "false", "no", "n"].includes(normalized)) return false;
  throw parseError(`${label} has unsupported boolean value ${raw}`, "invalid-boolean", fileName);
}

function parseRotationBoolean(raw: string): boolean {
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "y", "si", "s", "allow", "permitir", "allowed"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "lock", "locked", "block", "blocked", "bloquear"].includes(normalized)) return false;
  return parseStandardBoolean(raw, "rotation flag");
}

function parseXmlDocument(xml: string, fileName?: string): XmlNode {
  if (!xml.trim()) throw parseError("XML is empty", "empty-xml", fileName);

  const tokenPattern = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\/[^>]+>|<[^>]+>|[^<]+/g;
  const stack: XmlNode[] = [];
  let root: XmlNode | null = null;
  let token: RegExpExecArray | null;

  while ((token = tokenPattern.exec(xml)) != null) {
    const raw = token[0];
    if (raw.startsWith("<?") || raw.startsWith("<!--") || raw.startsWith("<!")) continue;
    if (!raw.startsWith("<")) {
      if (raw.trim() && stack.length === 0) throw parseError("text outside XML root", "text-outside-root", fileName);
      continue;
    }

    if (raw.startsWith("</")) {
      const closingName = raw.slice(2, -1).trim();
      const current = stack.pop();
      if (!current || current.name !== closingName) {
        throw parseError(`unexpected closing tag </${closingName}>`, "unexpected-closing-tag", fileName);
      }
      continue;
    }

    const parsed = parseStartTag(raw, fileName);
    const node: XmlNode = { name: parsed.name, attributes: parsed.attributes, children: [] };
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(node);
    else if (root) throw parseError("XML contains multiple root elements", "multiple-roots", fileName);
    else root = node;

    if (!parsed.selfClosing) stack.push(node);
  }

  if (!root) throw parseError("XML has no root element", "no-root", fileName);
  if (stack.length > 0) throw parseError(`unclosed tag <${stack[stack.length - 1]?.name}>`, "unclosed-tag", fileName);
  return root;
}

function parseStartTag(raw: string, fileName?: string) {
  const selfClosing = raw.endsWith("/>");
  const body = raw.slice(1, selfClosing ? -2 : -1).trim();
  const nameMatch = /^([^\s/>]+)/.exec(body);
  if (!nameMatch) throw parseError("invalid opening tag", "invalid-opening-tag", fileName);

  const name = nameMatch[1];
  let rest = body.slice(name.length);
  const attributes: Record<string, string> = {};

  while (rest.trim().length > 0) {
    rest = rest.trimStart();
    const keyMatch = /^([^\s=]+)\s*=/.exec(rest);
    if (!keyMatch) throw parseError(`invalid attributes in <${name}>`, "invalid-attributes", fileName);

    const key = keyMatch[1];
    rest = rest.slice(keyMatch[0].length).trimStart();
    const quote = rest[0];
    if (quote !== `"` && quote !== "'") throw parseError(`attribute ${key} in <${name}> is not quoted`, "unquoted-attribute", fileName);

    const end = rest.indexOf(quote, 1);
    if (end < 0) throw parseError(`attribute ${key} in <${name}> is not closed`, "unclosed-attribute", fileName);

    attributes[key] = decodeXmlEntities(rest.slice(1, end));
    rest = rest.slice(end + 1);
  }

  return { name, attributes, selfClosing };
}

function decodeXmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (_, entity: string) => {
    if (entity === "amp") return "&";
    if (entity === "lt") return "<";
    if (entity === "gt") return ">";
    if (entity === "quot") return `"`;
    if (entity === "apos") return "'";
    if (entity.startsWith("#x")) return String.fromCodePoint(parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(parseInt(entity.slice(1), 10));
    return `&${entity};`;
  });
}

function child(node: XmlNode, name: string): XmlNode | undefined {
  return node.children.find((candidate) => candidate.name.toLowerCase() === name.toLowerCase());
}

function attr(node: XmlNode, ...names: string[]): string | undefined {
  for (const name of names) {
    if (node.attributes[name] != null) return node.attributes[name];
  }

  const lower = new Map(Object.entries(node.attributes).map(([key, value]) => [key.toLowerCase(), value]));
  for (const name of names) {
    const value = lower.get(name.toLowerCase());
    if (value != null) return value;
  }

  return undefined;
}

function numberAttr(node: XmlNode, names: string[]): number | null {
  const value = attr(node, ...names);
  if (value == null || value.trim() === "") return null;
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) ? roundDimension(parsed) : null;
}

function positiveNumberAttr(node: XmlNode, names: string[], label: string, fileName?: string): number {
  const value = numberAttr(node, names);
  if (!(value != null && value > 0)) throw parseError(`${label} is missing or invalid`, "invalid-number", fileName);
  return value;
}

function integerAttr(node: XmlNode, names: string[], defaultValue: number): number {
  const value = numberAttr(node, names);
  return value == null ? defaultValue : Math.trunc(value);
}

function positiveIntegerAttr(node: XmlNode, names: string[], defaultValue: number | undefined, fileName?: string): number {
  const value = numberAttr(node, names);
  if (value == null && defaultValue != null) return defaultValue;
  if (!(value != null && value > 0 && Number.isInteger(value))) {
    throw parseError(`integer attribute ${names.join("/")} is missing or invalid`, "invalid-integer", fileName);
  }
  return value;
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function hasValue(value: string | undefined): boolean {
  return nonEmpty(value) != null;
}

function sameNumber(a: number, b: number): boolean {
  return Math.abs(a - b) <= 0.001;
}

function roundDimension(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function formatNumber(value: number | undefined): string {
  if (value == null) return "";
  const rounded = roundDimension(value);
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, "").replace(/\.$/, "");
}

function warning(fileName: string | undefined, message: string): string {
  return fileName ? `${fileName}: ${message}` : message;
}

function parseError(message: string, code: string, fileName?: string): CanonicalXmlParseError {
  return new CanonicalXmlParseError(message, code, fileName);
}

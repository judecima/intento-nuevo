import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CanonicalXmlParseError, parseCanonicalXml, serializeCanonicalOptimizationCase } from "@/lib/optimizer";

const projectXml = fixture("project-minimal.xml");
const projectDirectionalXml = fixture("project-directional.xml");
const projectRootDirectionXml = fixture("project-root-direction.xml");
const orderXml = fixture("order-minimal.xml");
const orderGrainXml = fixture("order-grain.xml");

describe("parseCanonicalXml / formato", () => {
  it("detecta la raiz project", () => {
    expect(parseCanonicalXml(projectXml).format).toBe("project");
    expect(parseCanonicalXml(projectXml).case.source).toBe("xml-project");
  });

  it("detecta la raiz Order", () => {
    expect(parseCanonicalXml(orderXml).format).toBe("order");
    expect(parseCanonicalXml(orderXml).case.source).toBe("xml-order");
  });

  it("rechaza una raiz desconocida", () => {
    expect(() => parseCanonicalXml("<Cutting />")).toThrow(CanonicalXmlParseError);
    expect(errorCode("<Cutting />")).toBe("unsupported-root");
  });

  it("falla de forma controlada con XML invalido o incompleto", () => {
    expect(errorCode("")).toBe("empty-xml");
    expect(errorCode("<project><panel1 l='1' w='1'></project>")).toBe("unexpected-closing-tag");
    expect(errorCode("<project />")).toBe("project-no-panels");
    expect(errorCode("<Order><WorkList /></Order>")).toBe("order-no-board");
    expect(errorCode(projectXml.replace(/ l="2600"/, ""))).toBe("invalid-number");
  });

  it("lee el formato real del corpus con comillas simples o dobles", () => {
    const doubleQuoted = orderXml.replace(/'/g, '"');

    expect(canonicalString(doubleQuoted)).toBe(canonicalString(orderXml));
  });
});

describe("parseCanonicalXml / determinismo", () => {
  it("es deterministico para project", () => {
    expect(canonicalString(projectXml)).toBe(canonicalString(projectXml));
    expect(canonicalString(projectDirectionalXml)).toBe(canonicalString(projectDirectionalXml));
  });

  it("es deterministico para Order", () => {
    expect(canonicalString(orderXml)).toBe(canonicalString(orderXml));
  });

  it("no depende del orden de las piezas en Order", () => {
    const part1 = matchTag(orderXml, "Part", "P1");
    const part2 = matchTag(orderXml, "Part", "P2");
    const reordered = orderXml.replace(part1, "__P1__").replace(part2, part1).replace("__P1__", part2);

    expect(reordered).not.toBe(orderXml);
    expect(canonicalString(reordered)).toBe(canonicalString(orderXml));
  });

  it("no depende del orden de los nodos en project", () => {
    const reordered = swapLines(projectXml, "<no.2 ", "<no.3 ");

    expect(reordered).not.toBe(projectXml);
    expect(canonicalString(reordered)).toBe(canonicalString(projectXml));
  });
});

describe("parseCanonicalXml / diferencias relevantes", () => {
  it("cambia cuando cambia la cantidad", () => {
    expect(canonicalString(orderXml.replace("qMin='4'", "qMin='5'"))).not.toBe(canonicalString(orderXml));
  });

  it("cambia cuando cambia el kerf", () => {
    expect(canonicalString(projectXml.replace('saw="4.4"', 'saw="5"'))).not.toBe(canonicalString(projectXml));
  });

  it("cambia cuando cambia el tablero", () => {
    expect(canonicalString(orderXml.replace("L='2500.00'", "L='2750.00'"))).not.toBe(canonicalString(orderXml));
  });

  it("cambia cuando cambia el material", () => {
    expect(canonicalString(orderXml.replace("FIB MEL BLANCO 18MM 2.50X1.83", "MDF ROBLE 18MM 2.50X1.83"))).not.toBe(
      canonicalString(orderXml)
    );
  });

  it("cambia cuando cambia la veta de la pieza", () => {
    expect(canonicalString(orderGrainXml.replace("qMin='2' Grain='1'", "qMin='2' Grain='0'"))).not.toBe(
      canonicalString(orderGrainXml)
    );
  });

  it("cambia cuando cambia la veta del material", () => {
    const flipped = orderGrainXml.replace(/Grain='0'\/>/g, "Grain='1'/>");

    expect(flipped).not.toBe(orderGrainXml);
    expect(canonicalString(flipped)).not.toBe(canonicalString(orderGrainXml));
  });

  it("cambia cuando cambia la rotacion declarada", () => {
    const allowed = orderXml.replace("<Part id='P1'", "<Part id='P1' CanRotate='1'");
    const blocked = orderXml.replace("<Part id='P1'", "<Part id='P1' CanRotate='0'");

    expect(canonicalString(allowed)).not.toBe(canonicalString(blocked));
  });
});

describe("parseCanonicalXml / orientacion en project", () => {
  it("convierte los ejes locales l/w a dimensiones globales segun el layer", () => {
    const parsed = parseCanonicalXml(projectXml, { fileName: "project-minimal.xml" });

    // no.3 declara l="410" w="560" en layer 2: la pieza colocada mide 560x410, no 410x560.
    expect(piece(parsed.case, "B")).toMatchObject({ width: 560, height: 410, quantity: 2 });
    expect(piece(parsed.case, "A")).toMatchObject({
      width: 1830,
      height: 230,
      quantity: 1,
      grain: null,
      grainSource: "unknown",
      rotationAllowed: null,
      rotationSource: "unknown"
    });
    expect(parsed.stats.rootDirections).toEqual(["x"]);
    expect(parsed.stats.pieceOrientation).toBe("normalized-from-placement");
    expect(parsed.warnings).toEqual([]);
  });

  it("resuelve un panel con nodo raiz en direccion y y agrega piezas entre paneles", () => {
    const parsed = parseCanonicalXml(projectDirectionalXml, { fileName: "project-directional.xml" });

    expect(parsed.stats.rootDirections).toEqual(["y", "y"]);
    expect(parsed.case.panel).toEqual({ width: 2600, height: 1830, thickness: 18 });
    expect(parsed.case.kerf).toBe(5);
    // no.3 declara l="95" w="2588" en layer 3: la pieza colocada mide 2588x95.
    expect(piece(parsed.case, "3")).toMatchObject({ width: 2588, height: 95, quantity: 1 });
    expect(piece(parsed.case, "2")).toMatchObject({ width: 2590, height: 120, quantity: 2 });
    // code="1" aparece una vez en cada panel: se agrega a cantidad 2.
    expect(piece(parsed.case, "1")).toMatchObject({ width: 2537, height: 1240, quantity: 2 });
    expect(parsed.stats.pieceQuantity).toBe(5);
    expect(parsed.stats.pieceTypes).toBe(3);
    expect(parsed.warnings).toEqual([]);
  });

  it("infiere la direccion del raiz por coordenadas y no por panel l/w", () => {
    const parsed = parseCanonicalXml(projectRootDirectionXml, { fileName: "project-root-direction.xml" });

    // panel l=1830 w=1300 y root l=1830 w=1300 son identicos: comparar l/w diria "x".
    // Los hijos del raiz comparten x y avanzan en y, asi que la direccion real es "y".
    expect(parsed.stats.rootDirections).toEqual(["y"]);
    expect(parsed.case.panel).toEqual({ width: 1830, height: 1300, thickness: 18 });
    expect(parsed.warnings).toEqual([]);
  });

  it("resuelve por contencion cuando ningun nodo tiene dos hermanos", () => {
    // Sin dos hijos en origenes distintos no hay evidencia directa de la direccion.
    // Con direccion x el terminal id=5 caeria en y=1284..1437 sobre un alto de 1300,
    // asi que la unica direccion que entra en el tablero es y.
    const singleBranch = projectRootDirectionXml
      .replace('<part cut="429.6" num="1" type="2" id="1" code="" />\n', "")
      .replace(/<no\.17[\s\S]*?<\/no\.17>\n/, "")
      .replace(/<no\.19[\s\S]*?<\/no\.19>\n/, "");
    const parsed = parseCanonicalXml(singleBranch, { fileName: "single-branch.xml" });

    expect(parsed.stats.rootDirections).toEqual(["y"]);
    expect(parsed.warnings.some((entry) => entry.includes("inferred from containment only: y"))).toBe(true);
    expect(piece(parsed.case, "6")).toMatchObject({ width: 537.2, height: 153.2 });
  });

  it("normaliza la orientacion de las piezas porque es una decision de Lepton", () => {
    // El mismo tablero aparece transpuesto entre paneles del corpus real, asi que la
    // pieza canonica se expresa siempre como lado mayor x lado menor y entra en el tablero.
    for (const xml of [projectXml, projectDirectionalXml, projectRootDirectionXml]) {
      const { case: canonical } = parseCanonicalXml(xml);
      expect(canonical.panel.width).toBeGreaterThanOrEqual(canonical.panel.height);
      for (const part of canonical.pieces) {
        expect(part.width).toBeGreaterThanOrEqual(part.height);
        expect(part.width).toBeLessThanOrEqual(canonical.panel.width);
        expect(part.height).toBeLessThanOrEqual(canonical.panel.height);
      }
    }
  });

  it("agrega la misma pieza aunque Lepton la coloque transpuesta en otro panel", () => {
    // panel2 pasa a expresar el mismo tablero con el marco global transpuesto.
    const transposed = projectDirectionalXml
      .replace('<no.10 l="1830" w="2600" trim="5" x="0" y="0" layer="1" id="0">', '<no.10 l="2600" w="1830" trim="5" x="0" y="0" layer="1" id="0">')
      .replace('<no.11 l="2600" w="1240" trim="5" x="0" y="0" layer="2" id="9">', '<no.11 l="1240" w="2600" trim="5" x="0" y="0" layer="2" id="9">')
      .replace('<no.12 l="1240" w="2537" trim="0" x="0" y="0" layer="3" id="10">', '<no.12 l="2537" w="1240" trim="0" x="0" y="0" layer="3" id="10">');
    const parsed = parseCanonicalXml(transposed, { fileName: "transposed.xml" });

    expect(parsed.case.panel).toEqual({ width: 2600, height: 1830, thickness: 18 });
    expect(piece(parsed.case, "1")).toMatchObject({ width: 2537, height: 1240, quantity: 2 });
    expect(parsed.stats.pieceTypes).toBe(3);
  });

  it("multiplica las cantidades por el atributo num del panel", () => {
    const repeated = projectDirectionalXml.replace('saw="5" num="1">', 'saw="5" num="3">');
    const parsed = parseCanonicalXml(repeated);

    // Solo el primer panel pasa a valer 3: code 1 sube de 2 a 4, code 2 de 2 a 6, code 3 de 1 a 3.
    expect(piece(parsed.case, "1")).toMatchObject({ quantity: 4 });
    expect(piece(parsed.case, "2")).toMatchObject({ quantity: 6 });
    expect(piece(parsed.case, "3")).toMatchObject({ quantity: 3 });
  });

  it("rechaza un project con formatos de tablero mezclados", () => {
    const mixedMaterial = projectDirectionalXml.replace(
      '<panel2 l="2600" w="1830" material="TEXTIL GRIS 18 mm"',
      '<panel2 l="2600" w="1830" material="MDF BLANCO 18 mm"'
    );
    const mixedStock = projectDirectionalXml.replace(
      '<no.10 l="1830" w="2600"',
      '<no.10 l="1830" w="2750"'
    );

    expect(errorCode(mixedMaterial)).toBe("mixed-board-formats");
    expect(errorCode(mixedStock)).toBe("mixed-board-formats");
  });

  it("avisa cuando panel l/w no describe el mismo rectangulo que el nodo raiz", () => {
    const inconsistent = projectXml.replace('<panel1 l="2600" w="1830"', '<panel1 l="2750" w="1830"');
    const parsed = parseCanonicalXml(inconsistent, { fileName: "inconsistent.xml" });

    // El marco global lo fija el nodo raiz, no el atributo del panel.
    expect(parsed.case.panel).toMatchObject({ width: 2600, height: 1830 });
    expect(parsed.warnings.some((entry) => entry.includes("but its root node spans"))).toBe(true);
  });
});

describe("parseCanonicalXml / veta en Order", () => {
  it("conserva la senal explicita de veta de la pieza y del tablero", () => {
    const parsed = parseCanonicalXml(orderGrainXml, { fileName: "order-grain.xml" });

    // Board Grain='0' identifica un material CON veta (decor direccional).
    expect(parsed.case.material).toMatchObject({
      id: "1",
      code: "EURODEKOR MDF FINLINE METALLIC ANTRACITA",
      hasGrain: true,
      grainSource: "xml",
      grainConfidence: 1,
      rawGrain: "0",
      thickness: 18
    });
    // Part Grain='1' = la pieza respeta la veta, y sobre material con veta no puede rotar.
    expect(piece(parsed.case, "5")).toMatchObject({
      width: 569.6,
      height: 494.2,
      quantity: 2,
      grain: true,
      grainSource: "xml",
      grainConfidence: 1,
      rawGrain: "1",
      rotationAllowed: false,
      rotationSource: "grain-rule"
    });
    // Part Grain='0' = pieza libre, puede rotar aun sobre material con veta.
    expect(piece(parsed.case, "1")).toMatchObject({
      grain: false,
      grainSource: "xml",
      rotationAllowed: true,
      rotationSource: "grain-rule"
    });
    expect(parsed.stats.pieceOrientation).toBe("xml-declared");
  });

  it("no convierte la ausencia de veta en veta conocida", () => {
    const withoutGrain = orderXml.replace(/ Grain='0'/g, "");
    const parsed = parseCanonicalXml(withoutGrain, { fileName: "order-no-grain.xml" });

    expect(piece(parsed.case, "1")).toMatchObject({
      grain: null,
      grainSource: "unknown",
      rotationAllowed: null,
      rotationSource: "unknown"
    });
    expect(piece(parsed.case, "1")).not.toHaveProperty("grainConfidence");
    expect(parsed.warnings.some((entry) => entry.includes("has no Grain attribute"))).toBe(true);
  });

  it("un project no inventa veta ni rotacion", () => {
    const parsed = parseCanonicalXml(projectDirectionalXml);

    expect(parsed.case.material.hasGrain).toBeNull();
    expect(parsed.case.material.grainSource).toBe("unknown");
    for (const part of parsed.case.pieces) {
      expect(part.grain).toBeNull();
      expect(part.grainSource).toBe("unknown");
      expect(part.rotationAllowed).toBeNull();
      expect(part.rotationSource).toBe("unknown");
    }
  });
});

describe("parseCanonicalXml / demanda en Order", () => {
  it("extrae piezas, tablero, kerf y cantos", () => {
    const parsed = parseCanonicalXml(orderXml, { fileName: "order-minimal.xml" });

    expect(parsed.case.panel).toEqual({ width: 2500, height: 1830, thickness: 18 });
    expect(parsed.case.kerf).toBe(4.5);
    expect(parsed.stats.kerfSource).toBe("default");
    expect(parsed.case.material).toMatchObject({
      code: "FIB MEL BLANCO 18MM 2.50X1.83",
      description: "FIB MEL BLANCO 18MM 2.50X1.83",
      hasGrain: false,
      grainSource: "xml",
      rawGrain: "1"
    });
    expect(parsed.case.pieces).toEqual([
      expect.objectContaining({
        reference: "1",
        description: "PISO TECHO A DORM2",
        width: 784,
        height: 668,
        quantity: 2,
        grain: false,
        rotationAllowed: true,
        rotationSource: "grain-rule",
        edges: { top: true, bottom: false, left: false, right: false }
      }),
      expect.objectContaining({ reference: "2", width: 1005, height: 668, quantity: 4 })
    ]);
    expect(parsed.warnings).toContain("order-minimal.xml: Order XML has no saw/kerf; using default 4.5");
  });

  it("ignora la cantidad de placas decidida por Lepton", () => {
    const parsed = parseCanonicalXml(orderGrainXml);
    const more = parseCanonicalXml(orderGrainXml.replace(/QBoards='1'/g, "QBoards='9'"));

    expect(serializeCanonicalOptimizationCase(more.case)).toBe(serializeCanonicalOptimizationCase(parsed.case));
  });
});

function canonicalString(xml: string): string {
  return serializeCanonicalOptimizationCase(parseCanonicalXml(xml).case);
}

function piece(value: { pieces: Array<{ reference: string }> }, reference: string) {
  const found = value.pieces.find((entry) => entry.reference === reference);
  if (!found) throw new Error(`Canonical piece ${reference} not found`);
  return found;
}

function errorCode(xml: string): string | undefined {
  try {
    parseCanonicalXml(xml);
  } catch (error) {
    if (error instanceof CanonicalXmlParseError) return error.code;
    throw error;
  }
  throw new Error("Expected parseCanonicalXml to throw");
}

function fixture(name: string): string {
  return readFileSync(join(process.cwd(), "tests", "fixtures", "optimizer", "xml", name), "utf8");
}

function matchTag(xml: string, tagName: string, id: string): string {
  const match = new RegExp(`<${tagName}[^>]+id='${id}'[^>]*/>`).exec(xml);
  if (!match) throw new Error(`Fixture tag ${tagName} ${id} not found`);
  return match[0];
}

function swapLines(xml: string, firstPrefix: string, secondPrefix: string): string {
  const lines = xml.split(/\r?\n/);
  const a = lines.findIndex((line) => line.trimStart().startsWith(firstPrefix));
  const b = lines.findIndex((line) => line.trimStart().startsWith(secondPrefix));
  if (a < 0 || b < 0) throw new Error("Fixture lines not found");
  const swapped = [...lines];
  swapped[a] = lines[b] as string;
  swapped[b] = lines[a] as string;
  return swapped.join("\n");
}

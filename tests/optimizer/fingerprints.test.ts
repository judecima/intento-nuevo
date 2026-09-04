import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  EXACT_FINGERPRINT_VERSION,
  canonicalizeOptimizationInput,
  exactFingerprint,
  exactFingerprintPayload,
  parseCanonicalXml,
  type CanonicalOptimizationCase,
  type OptimizationInput
} from "@/lib/optimizer";

const baseInput: OptimizationInput = {
  board: { width: 2750, height: 1830, thickness: 18 },
  material: { id: "mat-1", code: "MDF18", description: "MDF Blanco 18mm", hasGrain: false, thickness: 18 },
  kerf: 4.5,
  trim: { x: 0, y: 0 },
  constraints: { stages: 4, minRemnant: 250, minCommercialRemnantLongSide: 400 },
  pieces: [
    {
      reference: "B",
      description: "Lateral",
      quantity: 2,
      width: 700,
      height: 450,
      grain: false,
      canRotate: true,
      edges: { top: true },
      edgeType: "thin",
      metadata: { family: "module-a" }
    },
    {
      reference: "A",
      description: "Tapa",
      quantity: 1,
      width: 900,
      height: 500,
      grain: false,
      canRotate: true,
      edges: { left: true, right: true },
      edgeType: "both"
    },
    { reference: "C", description: "Estante", quantity: 3, width: 600, height: 320, grain: false, canRotate: true }
  ]
};

const base = canonicalizeOptimizationInput(baseInput);

describe("exactFingerprint / estabilidad", () => {
  it("es un sha256 hexadecimal", () => {
    expect(exactFingerprint(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("el mismo canonical case da el mismo fingerprint", () => {
    expect(exactFingerprint(base)).toBe(exactFingerprint(base));
    expect(exactFingerprint(canonicalizeOptimizationInput(baseInput))).toBe(exactFingerprint(base));
  });

  it("serializar repetidas veces da el mismo resultado", () => {
    const first = exactFingerprintPayload(base);
    expect(exactFingerprintPayload(base)).toBe(first);
    expect(exactFingerprintPayload(structuredClone(base))).toBe(first);
  });

  it("no depende del orden de las piezas de entrada", () => {
    const reversed = canonicalizeOptimizationInput({ ...baseInput, pieces: [...baseInput.pieces].reverse() });
    const rotated = canonicalizeOptimizationInput({
      ...baseInput,
      pieces: [baseInput.pieces[2], baseInput.pieces[0], baseInput.pieces[1]] as OptimizationInput["pieces"]
    });

    expect(exactFingerprint(reversed)).toBe(exactFingerprint(base));
    expect(exactFingerprint(rotated)).toBe(exactFingerprint(base));
  });

  it("tampoco depende del orden del array del canonical case", () => {
    const shuffled: CanonicalOptimizationCase = { ...base, pieces: [...base.pieces].reverse() };

    expect(exactFingerprint(shuffled)).toBe(exactFingerprint(base));
  });

  it("incluye la version en la entrada del hash", () => {
    expect(exactFingerprintPayload(base)).toContain(`"version":"${EXACT_FINGERPRINT_VERSION}"`);
  });

  it("cambiar la version cambia el hash", () => {
    expect(exactFingerprint(base, { version: "experience-exact-v2" })).not.toBe(exactFingerprint(base));
    expect(exactFingerprint(base, { version: EXACT_FINGERPRINT_VERSION })).toBe(exactFingerprint(base));
  });
});

describe("exactFingerprint / diferencias relevantes", () => {
  it("cambia con la cantidad", () => {
    expect(fromPiece(0, { quantity: 3 })).not.toBe(exactFingerprint(base));
  });

  it("cambia con las dimensiones de pieza", () => {
    expect(fromPiece(0, { width: 701 })).not.toBe(exactFingerprint(base));
    expect(fromPiece(0, { height: 451 })).not.toBe(exactFingerprint(base));
  });

  it("cambia con el panel", () => {
    expect(fromInput({ board: { ...baseInput.board, width: 2600 } })).not.toBe(exactFingerprint(base));
    expect(fromInput({ board: { ...baseInput.board, height: 1820 } })).not.toBe(exactFingerprint(base));
  });

  it("cambia con el espesor del panel", () => {
    expect(fromInput({ board: { ...baseInput.board, thickness: 15 } })).not.toBe(exactFingerprint(base));
  });

  it("cambia con el espesor del material", () => {
    expect(fromInput({ material: { ...baseInput.material, thickness: 15 } })).not.toBe(exactFingerprint(base));
  });

  it("cambia con el kerf", () => {
    expect(fromInput({ kerf: 4.4 })).not.toBe(exactFingerprint(base));
  });

  it("cambia con el refilado", () => {
    expect(fromInput({ trim: { x: 10, y: 0 } })).not.toBe(exactFingerprint(base));
    expect(fromInput({ trim: { x: 0, y: 10 } })).not.toBe(exactFingerprint(base));
  });

  it("cambia con el material", () => {
    expect(fromInput({ material: { ...baseInput.material, description: "MDF Roble 18mm" } })).not.toBe(
      exactFingerprint(base)
    );
    expect(fromInput({ material: { ...baseInput.material, code: "MDF18B" } })).not.toBe(exactFingerprint(base));
  });

  it("cambia con la veta del material", () => {
    expect(fromInput({ material: { ...baseInput.material, hasGrain: true } })).not.toBe(exactFingerprint(base));
  });

  it("cambia con las restricciones", () => {
    expect(fromInput({ constraints: { ...baseInput.constraints, stages: 3 } })).not.toBe(exactFingerprint(base));
    expect(fromInput({ constraints: { ...baseInput.constraints, minRemnant: 300 } })).not.toBe(exactFingerprint(base));
    expect(fromInput({ constraints: { ...baseInput.constraints, minCommercialRemnantLongSide: 500 } })).not.toBe(
      exactFingerprint(base)
    );
  });

  it("cambia con los cantos y el tipo de canto", () => {
    expect(fromPiece(0, { edges: { top: true, bottom: true } })).not.toBe(exactFingerprint(base));
    expect(fromPiece(0, { edgeType: "both" })).not.toBe(exactFingerprint(base));
  });

  it("cambia con la rotacion permitida", () => {
    expect(fromPiece(0, { canRotate: false })).not.toBe(exactFingerprint(base));
  });

  it("cambia con la veta de la pieza", () => {
    expect(fromPiece(0, { grain: true })).not.toBe(exactFingerprint(base));
  });
});

describe("exactFingerprint / tres estados de veta y rotacion", () => {
  const withGrain = (grain: boolean | null, rotationAllowed: boolean | null): CanonicalOptimizationCase => ({
    ...base,
    pieces: base.pieces.map((piece, index) =>
      index === 0 ? { ...piece, grain, rotationAllowed } : piece
    )
  });

  it("veta true, false y unknown dan tres fingerprints distintos", () => {
    const yes = exactFingerprint(withGrain(true, true));
    const no = exactFingerprint(withGrain(false, true));
    const unknown = exactFingerprint(withGrain(null, true));

    expect(new Set([yes, no, unknown]).size).toBe(3);
  });

  it("unknown nunca equivale a false en la veta", () => {
    expect(exactFingerprint(withGrain(null, true))).not.toBe(exactFingerprint(withGrain(false, true)));
  });

  it("rotacion true, false y unknown dan tres fingerprints distintos", () => {
    const yes = exactFingerprint(withGrain(false, true));
    const no = exactFingerprint(withGrain(false, false));
    const unknown = exactFingerprint(withGrain(false, null));

    expect(new Set([yes, no, unknown]).size).toBe(3);
  });

  it("unknown nunca equivale a false en la rotacion", () => {
    expect(exactFingerprint(withGrain(false, null))).not.toBe(exactFingerprint(withGrain(false, false)));
  });

  it("la veta del material tambien distingue unknown de false", () => {
    const unknown: CanonicalOptimizationCase = { ...base, material: { ...base.material, hasGrain: null } };
    const no: CanonicalOptimizationCase = { ...base, material: { ...base.material, hasGrain: false } };

    expect(exactFingerprint(unknown)).not.toBe(exactFingerprint(no));
  });
});

describe("exactFingerprint / identidad del problema", () => {
  it("ignora etiquetas que no cambian el problema de optimizacion", () => {
    const relabeled = canonicalizeOptimizationInput({
      ...baseInput,
      pieces: baseInput.pieces.map((piece, index) => ({
        ...piece,
        reference: `X${index}`,
        description: "otra descripcion",
        metadata: { family: "otra-familia" }
      }))
    });

    expect(relabeled.pieces.map((piece) => piece.reference)).not.toEqual(base.pieces.map((piece) => piece.reference));
    expect(exactFingerprint(relabeled)).toBe(exactFingerprint(base));
  });

  it("ignora el id interno del material pero no su descripcion", () => {
    expect(fromInput({ material: { ...baseInput.material, id: "mat-999" } })).toBe(exactFingerprint(base));
  });

  it("ignora la procedencia de la veta cuando el valor es el mismo", () => {
    const otherSource: CanonicalOptimizationCase = {
      ...base,
      material: { ...base.material, grainSource: "xml", grainConfidence: 0.5, rawGrain: "1" },
      pieces: base.pieces.map((piece) => ({ ...piece, grainSource: "xml", rotationSource: "xml" }))
    };

    expect(exactFingerprint(otherSource)).toBe(exactFingerprint(base));
  });

  it("suma cantidades de lineas identicas en todos los campos relevantes", () => {
    const split = canonicalizeOptimizationInput({
      ...baseInput,
      pieces: [
        { ...baseInput.pieces[2], reference: "C1", quantity: 1 },
        { ...baseInput.pieces[2], reference: "C2", quantity: 2 },
        baseInput.pieces[0],
        baseInput.pieces[1]
      ] as OptimizationInput["pieces"]
    });

    expect(split.pieces).toHaveLength(4);
    expect(exactFingerprint(split)).toBe(exactFingerprint(base));
  });

  it("no suma lineas que difieren en una restriccion relevante", () => {
    const split = canonicalizeOptimizationInput({
      ...baseInput,
      pieces: [
        { ...baseInput.pieces[2], reference: "C1", quantity: 1 },
        { ...baseInput.pieces[2], reference: "C2", quantity: 2, canRotate: false },
        baseInput.pieces[0],
        baseInput.pieces[1]
      ] as OptimizationInput["pieces"]
    });

    expect(exactFingerprint(split)).not.toBe(exactFingerprint(base));
  });
});

describe("exactFingerprint / casos XML", () => {
  const projectCase = parseCanonicalXml(fixture("project-directional.xml")).case;
  const orderCase = parseCanonicalXml(fixture("order-minimal.xml")).case;

  it("es estable sobre casos project y Order reales", () => {
    expect(exactFingerprint(projectCase)).toMatch(/^[0-9a-f]{64}$/);
    expect(exactFingerprint(projectCase)).toBe(exactFingerprint(parseCanonicalXml(fixture("project-directional.xml")).case));
    expect(exactFingerprint(orderCase)).toBe(exactFingerprint(parseCanonicalXml(fixture("order-minimal.xml")).case));
  });

  it("un project y un Order distintos no colisionan", () => {
    expect(exactFingerprint(projectCase)).not.toBe(exactFingerprint(orderCase));
  });

  it("no depende del orden de los nodos del XML project", () => {
    const xml = fixture("project-minimal.xml");
    const lines = xml.split(/\r?\n/);
    const a = lines.findIndex((line) => line.trimStart().startsWith("<no.2 "));
    const b = lines.findIndex((line) => line.trimStart().startsWith("<no.3 "));
    const swapped = [...lines];
    swapped[a] = lines[b] as string;
    swapped[b] = lines[a] as string;

    expect(exactFingerprint(parseCanonicalXml(swapped.join("\n")).case)).toBe(
      exactFingerprint(parseCanonicalXml(xml).case)
    );
  });

  it("un project con veta unknown no colisiona con el mismo problema con veta false", () => {
    const asFalse: CanonicalOptimizationCase = {
      ...projectCase,
      material: { ...projectCase.material, hasGrain: false },
      pieces: projectCase.pieces.map((piece) => ({ ...piece, grain: false }))
    };

    expect(exactFingerprint(asFalse)).not.toBe(exactFingerprint(projectCase));
  });

  it("cambiar el kerf de un XML project cambia el fingerprint", () => {
    const changed = parseCanonicalXml(fixture("project-directional.xml").replace(/saw="5"/g, 'saw="4.4"')).case;

    expect(exactFingerprint(changed)).not.toBe(exactFingerprint(projectCase));
  });

  it("cambiar la cantidad de un XML Order cambia el fingerprint", () => {
    const changed = parseCanonicalXml(fixture("order-minimal.xml").replace("qMin='4'", "qMin='5'")).case;

    expect(exactFingerprint(changed)).not.toBe(exactFingerprint(orderCase));
  });
});

function fromInput(patch: Partial<OptimizationInput>): string {
  return exactFingerprint(canonicalizeOptimizationInput({ ...baseInput, ...patch }));
}

function fromPiece(index: number, patch: Record<string, unknown>): string {
  const pieces = baseInput.pieces.map((piece, current) => (current === index ? { ...piece, ...patch } : piece));
  return exactFingerprint(canonicalizeOptimizationInput({ ...baseInput, pieces } as OptimizationInput));
}

function fixture(name: string): string {
  return readFileSync(join(process.cwd(), "tests", "fixtures", "optimizer", "xml", name), "utf8");
}

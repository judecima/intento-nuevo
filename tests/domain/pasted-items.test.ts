import { describe, expect, it } from "vitest";
import { parsePastedProjectItems } from "@/lib/domain/projects";

describe("parsePastedProjectItems", () => {
  it("reads quantity, measures and description from a workshop list", () => {
    const { items, invalidLines } = parsePastedProjectItems(
      ["4  629x570  Estantes", "2 500x582 Cajon base", "6  70x482   Soporte espejo"].join("\n")
    );

    expect(invalidLines).toHaveLength(0);
    expect(items).toEqual([
      { quantity: 4, width: 629, height: 570, description: "Estantes" },
      { quantity: 2, width: 500, height: 582, description: "Cajon base" },
      { quantity: 6, width: 70, height: 482, description: "Soporte espejo" }
    ]);
  });

  it("accepts space separated measures, decimal commas and a missing quantity", () => {
    const { items } = parsePastedProjectItems(["3 629 570 Estante", "629,5*570 Tapa", "800x600"].join("\n"));

    expect(items).toEqual([
      { quantity: 3, width: 629, height: 570, description: "Estante" },
      { quantity: 1, width: 629.5, height: 570, description: "Tapa" },
      { quantity: 1, width: 800, height: 600, description: "" }
    ]);
  });

  it("accepts bulleted Spanish quantity lines", () => {
    const { items, invalidLines } = parsePastedProjectItems(
      ["-4 piezas de 629.0 x 570.0", "-1 pieza de 500,0 x 562,0 Frente"].join("\n")
    );

    expect(invalidLines).toHaveLength(0);
    expect(items).toEqual([
      { quantity: 4, width: 629, height: 570, description: "" },
      { quantity: 1, width: 500, height: 562, description: "Frente" }
    ]);
  });

  it("accepts the full furniture workshop list with dash bullets", () => {
    const pasted = [
      "-4 piezas de 629.0 x 570.0",
      "-4 piezas de 610.0 x 570.0",
      "-6 piezas de 500.0 x 178.0",
      "-2 piezas de 500.0 x 582.0",
      "-1 piezas de 500.0 x 562.0",
      "-4 piezas de 582.0 x 150.0",
      "-3 piezas de 463.0 x 150.0",
      "-2 piezas de 562.0 x 150.0",
      "-2 piezas de 622.0 x 245.0",
      "-1 piezas de 602.0 x 245.0",
      "-6 piezas de 70.0 x 482.0",
      "-2 piezas de 470.0 x 490.0",
      "-1 piezas de 495.0 x 490.0",
      "-1 piezas de 577.0 x 453.0",
      "-2 piezas de 578.0 x 470.0",
      "-1 piezas de 234.0 x 606.0",
      "-1 piezas de 248.0 x 606.0",
      "-1 piezas de 100.0 x 490.0",
      "-2 piezas de 530.0 x 400.0",
      "-2 piezas de 145.0 x 400.0",
      "-1 piezas de 530.0 x 117.0",
      "-2 piezas de 382.0 x 117.0",
      "-1 piezas de 193.0 x 117.0",
      "-1 piezas de 177.0 x 117.0",
      "-1 piezas de 124.0 x 117.0",
      "-2 piezas de 400.0 x 128.0",
      "-1 piezas de 530.0 x 100.0",
      "-1 piezas de 250.0 x 100.0",
      "-1 piezas de 315.0 x 100.0",
      "-1 piezas de 382.0 x 100.0",
      "-1 piezas de 197.0 x 100.0"
    ].join("\n");

    const { items, invalidLines } = parsePastedProjectItems(pasted);

    expect(invalidLines).toHaveLength(0);
    expect(items).toHaveLength(31);
    expect(items.reduce((total, item) => total + item.quantity, 0)).toBe(61);
    expect(items[0]).toEqual({ quantity: 4, width: 629, height: 570, description: "" });
    expect(items[30]).toEqual({ quantity: 1, width: 197, height: 100, description: "" });
  });

  it("collects unreadable lines instead of failing and ignores blanks", () => {
    const { items, invalidLines } = parsePastedProjectItems(["", "medidas por confirmar", "2 400x300 Base", "   "].join("\n"));

    expect(items).toHaveLength(1);
    expect(invalidLines).toEqual(["medidas por confirmar"]);
  });

  it("rejects non positive measures", () => {
    const { items, invalidLines } = parsePastedProjectItems("2 0x300 Base");

    expect(items).toHaveLength(0);
    expect(invalidLines).toEqual(["2 0x300 Base"]);
  });
});

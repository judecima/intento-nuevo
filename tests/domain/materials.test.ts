import { describe, expect, it } from "vitest";
import {
  classifyLegacyMaterial,
  inferThicknessFromDescription,
  materialFilterSchema,
  normalizeLegacyThickness,
  positiveThicknessOrUndefined,
  textureThumbnailUrl
} from "@/lib/domain/materials";

describe("materials domain", () => {
  it("builds Optionline texture thumbnail URLs only for valid texture ids", () => {
    expect(textureThumbnailUrl(1020)).toBe("https://optionline-prod-files.s3.amazonaws.com/6-1020-thumbnail.jpg");
    expect(textureThumbnailUrl(-1)).toBeNull();
    expect(textureThumbnailUrl(null)).toBeNull();
  });

  it("infers millimeters from material descriptions", () => {
    expect(inferThicknessFromDescription("MDF 18MM GRIS TAPIR")).toBe(18);
    expect(inferThicknessFromDescription("FENOLICO 12,5 MM")).toBe(12.5);
    expect(inferThicknessFromDescription("SIN ESPESOR")).toBeNull();
  });

  it("normalizes legacy centimeter-like thickness values when description is clear", () => {
    expect(normalizeLegacyThickness({ description: "FENOLICO 18MM CDX", thickness: 1.8 })).toMatchObject({
      thickness: 18,
      normalized: true,
      rawThickness: 1.8
    });

    expect(normalizeLegacyThickness({ description: "AGL 18MM BLANCO", thickness: 18 })).toMatchObject({
      thickness: 18,
      normalized: false
    });
  });

  it("derives positive thickness when catalog rows have zero thickness", () => {
    expect(positiveThicknessOrUndefined({ description: "AGL 18MM BLANCO", thickness: 0 })).toBe(18);
    expect(positiveThicknessOrUndefined({ description: "MDF 15,5MM", thickness: null })).toBe(15.5);
    expect(positiveThicknessOrUndefined({ description: "TABLERO SIN ESPESOR", thickness: 0 })).toBeUndefined();
  });

  it("treats empty query-string filters as no filter", () => {
    // El selector manda `?thickness=` al elegir "Todos": no debe romper.
    const filters = materialFilterSchema.parse({ q: "", kind: "", thickness: "", size: "", grain: "" });

    expect(filters).toEqual({ q: "", kind: "board", thickness: undefined, size: "", grain: "all" });
  });

  it("keeps explicit filter values", () => {
    const filters = materialFilterSchema.parse({ kind: "edge_band", thickness: "18", grain: "yes", q: " mdf ", size: "2750x1830" });

    expect(filters).toMatchObject({ kind: "edge_band", thickness: 18, grain: "yes", q: "mdf", size: "2750x1830" });
  });

  it("rejects invalid filter values instead of coercing them", () => {
    expect(materialFilterSchema.safeParse({ thickness: "abc" }).success).toBe(false);
    expect(materialFilterSchema.safeParse({ thickness: "0" }).success).toBe(false);
    expect(materialFilterSchema.safeParse({ kind: "inexistente" }).success).toBe(false);
  });

  it("classifies legacy catalog rows by product kind", () => {
    expect(classifyLegacyMaterial({ description: "AGL 18MM BLANCO", width: 2750, height: 1830 })).toBe("board");
    expect(classifyLegacyMaterial({ description: "TAPACANTO PVC BLANCO", width: 22, height: 50 })).toBe("edge_band");
    expect(classifyLegacyMaterial({ description: "ACCESORIO METALICO", width: 100, height: 80 })).toBe("other");
  });
});

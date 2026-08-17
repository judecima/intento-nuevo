import { describe, expect, it } from "vitest";

import { optimizeProject } from "@/lib/optimizer";
import {
  buildProductionFilePath,
  extractMachineXmlDataFromSnapshot,
  machineProfileToXmlInput,
  sha256Hex
} from "@/lib/production/xml";
import type { Json } from "@/lib/supabase/database.types";

describe("production XML helpers", () => {
  it("extracts approved optimization data from an immutable order snapshot", () => {
    const result = optimizeProject({
      board: { width: 1000, height: 800, thickness: 18 },
      material: { description: "MDF TEST 18MM", hasGrain: false, thickness: 18 },
      kerf: 5,
      trim: { x: 0, y: 0 },
      constraints: { minRemnant: 100 },
      pieces: [{ reference: "A", quantity: 2, width: 300, height: 200 }]
    });
    const snapshot: Json = {
      material: {
        description: "MDF TEST 18MM",
        thickness: 18
      },
      optimization_result: {
        result_json: result
      }
    } as unknown as Json;

    const extracted = extractMachineXmlDataFromSnapshot(snapshot);

    expect(extracted?.material).toBe("MDF TEST 18MM");
    expect(extracted?.thickness).toBe(18);
    expect(extracted?.optimizationResult.algorithmVersion).toBe(result.algorithmVersion);
  });

  it("builds stable private storage paths and checksums", () => {
    expect(
      buildProductionFilePath({
        organizationId: "org-1",
        orderId: "order-1",
        createdAt: new Date("2026-08-13T12:34:56.789Z")
      }),
    ).toBe("org-1/orders/order-1/machine_xml/20260813T123456789Z.xml");

    expect(sha256Hex("xml")).toBe("bf92a04e60b4b2362d45490e5142e47b687c2ebb5898da6bc71b697602016e6e");
  });

  it("maps machine profiles to XML exporter input", () => {
    expect(
      machineProfileToXmlInput({
        name: "Seccionadora 1",
        manufacturer: "Fabricante",
        model: "Modelo",
        xml_format: "legacy_project_xml",
        kerf: 4.5,
        configuration: { station: "A" }
      }),
    ).toEqual({
      name: "Seccionadora 1",
      manufacturer: "Fabricante",
      model: "Modelo",
      xmlFormat: "legacy_project_xml",
      kerf: 4.5,
      configuration: { station: "A" }
    });
  });
});

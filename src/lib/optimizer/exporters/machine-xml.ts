import { createRequire } from "node:module";

import type { MachineXmlInput, OptimizationResult } from "../types";

const require = createRequire(import.meta.url);

interface LegacyXmlExporterModule {
  exportarProjectXml(result: unknown, metadata?: Record<string, unknown>): string;
  espesorDesdeMaterial(material: string, fallback?: number): number;
}

const legacyXmlExporter = require("../legacy/xml-exporter.cjs") as LegacyXmlExporterModule;

export function generateMachineXml(result: OptimizationResult, input: MachineXmlInput = {}): string {
  const rawMaterial = result.raw?.opts?.material;
  const material = input.material || (typeof rawMaterial === "string" ? rawMaterial : "MATERIAL");
  const thickness =
    input.thickness ??
    (typeof result.raw?.opts?.thickness === "number" ? result.raw.opts.thickness : undefined) ??
    legacyXmlExporter.espesorDesdeMaterial(material, 18);

  return legacyXmlExporter.exportarProjectXml(result.raw, {
    material,
    thickness,
    machineProfile: input.machineProfile
  });
}

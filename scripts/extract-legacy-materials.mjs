import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(rootDir, "Optimizador_V10_Interactivo_Selector_Materiales_v3.html");
const outputPath = path.join(rootDir, "data", "legacy-materials.json");
const textureBaseUrl = "https://optionline-prod-files.s3.amazonaws.com";
const boardKeywords = /AGL|CHAPADUR|FENOLICO|MDF|MDP|MELAMINA|PLAC|TERCIADO/i;
const edgeBandKeywords = /TAPACANTO|TAPA\s*CANTO|CANTO\s*(ABS|PVC)?|FILO|BORDE/i;

function requireLegacyMaterial(raw) {
  const required = ["id", "code", "description", "width", "height", "thickness", "hasGrain"];
  for (const key of required) {
    if (raw[key] === undefined || raw[key] === null) {
      throw new Error(`Material legado invalido: falta ${key}`);
    }
  }
  return raw;
}

function textureThumbnailUrl(textureId) {
  if (!textureId || textureId <= 0) return null;
  return `${textureBaseUrl}/6-${textureId}-thumbnail.jpg`;
}

function inferThicknessFromDescription(description) {
  const matches = [...String(description).matchAll(/(\d+(?:[.,]\d+)?)\s*MM\b/gi)];
  if (!matches.length) return null;
  const lastMatch = matches[matches.length - 1]?.[1];
  if (!lastMatch) return null;
  return Number(lastMatch.replace(",", "."));
}

function normalizeLegacyThickness(material) {
  const inferred = inferThicknessFromDescription(material.description);

  if (inferred && material.thickness > 0 && material.thickness < 6 && inferred >= 6) {
    return {
      thickness: inferred,
      normalized: true,
      inferredFromDescription: inferred
    };
  }

  return {
    thickness: material.thickness,
    normalized: false,
    inferredFromDescription: inferred
  };
}

function classifyLegacyMaterial(material) {
  if (edgeBandKeywords.test(material.description)) return "edge_band";
  if (Math.min(material.width, material.height) < 500 && !boardKeywords.test(material.description)) return "other";
  return "board";
}

const html = fs.readFileSync(sourcePath, "utf8");
const match = html.match(/const MATERIALES_TABLERO=(\[[\s\S]*?\]);/);

if (!match) {
  throw new Error("No se encontro MATERIALES_TABLERO en el HTML legado.");
}

const parsed = JSON.parse(match[1]);

if (!Array.isArray(parsed)) {
  throw new Error("MATERIALES_TABLERO no es un array.");
}

const materials = parsed.map((raw) => {
  const material = requireLegacyMaterial(raw);
  const normalizedThickness = normalizeLegacyThickness(material);
  const textureId = material.idTextura && material.idTextura > 0 ? material.idTextura : null;
  const kind = classifyLegacyMaterial(material);

  return {
    external_id: String(material.id),
    code: material.code,
    code_ext: material.codeExt || null,
    description: material.description.trim().replace(/\s+/g, " "),
    texture_id: textureId,
    type: kind,
    width: material.width,
    height: material.height,
    thickness: normalizedThickness.thickness,
    has_grain: material.hasGrain,
    price_m2: material.priceM2,
    ref_x: material.refX,
    ref_y: material.refY,
    min_cut: material.min_corte,
    enabled: kind === "board",
    image_url: textureThumbnailUrl(textureId),
    metadata: {
      source: "Optimizador_V10_Interactivo_Selector_Materiales_v3.html",
      raw,
      normalized_thickness: normalizedThickness.normalized,
      inferred_thickness_from_description: normalizedThickness.inferredFromDescription
    }
  };
});

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(materials, null, 2)}\n`);

const counts = materials.reduce(
  (acc, material) => {
    acc.total += 1;
    acc[material.type] += 1;
    if (material.metadata.normalized_thickness) acc.normalized_thickness += 1;
    return acc;
  },
  { total: 0, board: 0, edge_band: 0, other: 0, normalized_thickness: 0 }
);

console.log(JSON.stringify({ output: path.relative(rootDir, outputPath), counts }, null, 2));

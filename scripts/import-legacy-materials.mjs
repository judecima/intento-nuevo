import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(rootDir, ".env.local");
const dataPath = path.join(rootDir, "data", "legacy-materials.json");
const organizationSlug = process.env.IMPORT_ORGANIZATION_SLUG || "demo-corte";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;

    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) process.env[key] = value;
  }
}

function requiredEnv(key) {
  const value = process.env[key];
  if (!value) throw new Error(`${key} no esta definido.`);
  return value;
}

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

loadEnvFile(envPath);

const supabase = createClient(
  requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const materials = JSON.parse(fs.readFileSync(dataPath, "utf8"));

const { data: organization, error: organizationError } = await supabase
  .from("organizations")
  .select("id, slug")
  .eq("slug", organizationSlug)
  .single();

if (organizationError || !organization) {
  throw new Error(`No se encontro la organizacion ${organizationSlug}: ${organizationError?.message || ""}`);
}

let importedMaterials = 0;
let importedFormats = 0;

for (const batch of chunks(materials, 100)) {
  const rows = batch.map((material) => ({
    organization_id: organization.id,
    external_id: material.external_id,
    code: material.code,
    code_ext: material.code_ext,
    description: material.description,
    texture_id: material.texture_id,
    type: material.type,
    width: material.width,
    height: material.height,
    thickness: material.thickness,
    has_grain: material.has_grain,
    price_m2: material.price_m2,
    ref_x: material.ref_x,
    ref_y: material.ref_y,
    min_cut: material.min_cut,
    enabled: material.enabled,
    image_url: material.image_url,
    metadata: material.metadata
  }));

  const { data: upsertedMaterials, error: materialError } = await supabase
    .from("materials")
    .upsert(rows, { onConflict: "organization_id,external_id" })
    .select("id, external_id, type, width, height, thickness, enabled");

  if (materialError) {
    throw new Error(`Fallo importando materiales: ${materialError.message}`);
  }

  importedMaterials += upsertedMaterials?.length || 0;

  const formatRows = (upsertedMaterials || [])
    .filter((material) => material.type === "board")
    .map((material) => ({
      organization_id: organization.id,
      material_id: material.id,
      label: `${material.width} x ${material.height} x ${material.thickness} mm`,
      width: material.width,
      height: material.height,
      thickness: material.thickness,
      enabled: material.enabled,
      metadata: {
        source: "legacy-materials",
        external_id: material.external_id
      }
    }));

  if (formatRows.length > 0) {
    const { data: upsertedFormats, error: formatError } = await supabase
      .from("board_formats")
      .upsert(formatRows, { onConflict: "material_id,width,height,thickness" })
      .select("id");

    if (formatError) {
      throw new Error(`Fallo importando formatos: ${formatError.message}`);
    }

    importedFormats += upsertedFormats?.length || 0;
  }
}

const counts = materials.reduce(
  (acc, material) => {
    acc[material.type] += 1;
    return acc;
  },
  { board: 0, edge_band: 0, other: 0 }
);

console.log(
  JSON.stringify(
    {
      organization: organization.slug,
      imported_materials: importedMaterials,
      imported_board_formats: importedFormats,
      source_counts: counts
    },
    null,
    2
  )
);

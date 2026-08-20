export type ManualRemnantClass = "auto" | "usable" | "waste";

const FAMILY_COLORS = [
  "#b8d8f0",
  "#c9e4c5",
  "#f5d0a9",
  "#d7c4ea",
  "#f2b8b5",
  "#bfe3dd",
  "#f2e6a7",
  "#d5d8dc",
  "#b9c7ea",
  "#d6e8b5",
  "#e7c4a9",
  "#c8dde8",
  "#ebc5d4",
  "#c9e6d4",
  "#e9d5aa",
  "#cdd0ea"
] as const;

const FAMILY_DASHES = ["", "10 4", "3 3", "12 4 2 4", "1 3", "15 3 3 3", "7 3 1 3"] as const;

const FAMILY_RULES: Array<[RegExp, string]> = [
  [/estant/, "Estantes"],
  [/\bbase\b/, "Bases"],
  [/lateral/, "Laterales"],
  [/frente/, "Frentes"],
  [/puerta/, "Puertas"],
  [/tapa|techo|superior/, "Tapas"],
  [/piso|fondo/, "Fondos / pisos"],
  [/zocal/, "Zocalos"],
  [/refuerzo|traves/, "Refuerzos"],
  [/cajon/, "Cajones"],
  [/soporte/, "Soportes"],
  [/cierre/, "Cierres"],
  [/divisi/, "Divisiones"]
];

export function inferPieceFamily(description: string): string {
  const value = description.trim();
  if (!value) return "Sin familia";

  const normalized = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  for (const [rule, family] of FAMILY_RULES) {
    if (rule.test(normalized)) return family;
  }

  return value.split(/\s+/).slice(0, 2).join(" ");
}

export function familyVisual(family: string) {
  const normalized = family.trim() || "Sin familia";
  let hash = 2166136261;

  for (const character of normalized) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  const unsignedHash = hash >>> 0;
  return {
    name: normalized,
    color: FAMILY_COLORS[unsignedHash % FAMILY_COLORS.length],
    dash: FAMILY_DASHES[(unsignedHash >>> 4) % FAMILY_DASHES.length]
  };
}

export function pieceFamilyKey(piece: {
  description: string;
  sourceWidth: number;
  sourceHeight: number;
  edges: { top: boolean; bottom: boolean; left: boolean; right: boolean };
}): string {
  const edges = `${piece.edges.top ? "A" : "-"}${piece.edges.bottom ? "B" : "-"}${piece.edges.left ? "I" : "-"}${
    piece.edges.right ? "D" : "-"
  }`;
  return `${piece.description}|${piece.sourceWidth}|${piece.sourceHeight}|${edges}`;
}


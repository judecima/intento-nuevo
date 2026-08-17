import { z } from "zod";
import type { OrganizationRole } from "@/lib/domain/roles";

export const projectStatuses = [
  "draft",
  "optimizing",
  "optimized",
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "in_production",
  "completed",
  "cancelled"
] as const;

export type ProjectStatus = (typeof projectStatuses)[number];

export const projectStatusLabels: Record<ProjectStatus, string> = {
  draft: "Borrador",
  optimizing: "Optimizando",
  optimized: "Optimizado",
  submitted: "Enviado",
  under_review: "En revision",
  approved: "Aprobado",
  rejected: "Rechazado",
  in_production: "En produccion",
  completed: "Completado",
  cancelled: "Cancelado"
};

export const projectDomainErrors = {
  forbidden: "FORBIDDEN",
  invalidStatus: "PROJECT_INVALID_STATUS",
  materialNotFound: "MATERIAL_NOT_FOUND",
  versionConflict: "PROJECT_VERSION_CONFLICT",
  projectNotFound: "PROJECT_NOT_FOUND"
} as const;

export type ProjectDomainError = (typeof projectDomainErrors)[keyof typeof projectDomainErrors];

export const editableProjectStatuses = ["draft", "optimized"] as const satisfies ProjectStatus[];

export function isProjectEditableStatus(status: ProjectStatus): boolean {
  return editableProjectStatuses.includes(status as (typeof editableProjectStatuses)[number]);
}

export function canCreateProject(
  role: OrganizationRole | null,
  options: { platformAdmin?: boolean } = {}
): boolean {
  return Boolean(options.platformAdmin) || role === "customer" || role === "admin";
}

export function canEditProject(
  role: OrganizationRole | null,
  status: ProjectStatus,
  options: { platformAdmin?: boolean } = {}
): boolean {
  if (!isProjectEditableStatus(status)) return false;
  return Boolean(options.platformAdmin) || role === "customer" || role === "admin";
}

export const createProjectSchema = z.object({
  materialId: z.string().uuid(),
  /** Solo lo usa el super usuario para crear en una organizacion ajena. */
  organizationId: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional().default(""),
  kerf: z.coerce.number().min(0).max(20).default(4.5),
  trimX: z.coerce.number().min(0).max(200).default(0),
  trimY: z.coerce.number().min(0).max(200).default(0),
  minRemnant: z.coerce.number().min(0).max(2000).default(250)
});

export const updateProjectSettingsSchema = createProjectSchema
  .omit({ materialId: true })
  .extend({
    projectId: z.string().uuid(),
    expectedVersion: z.coerce.number().int().positive()
  });

export const projectItemSchema = z.object({
  projectId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().positive(),
  reference: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional().default(""),
  quantity: z.coerce.number().int().min(1).max(999),
  width: z.coerce.number().positive().max(10000),
  height: z.coerce.number().positive().max(10000),
  grain: z.coerce.boolean().optional().default(false),
  canRotate: z.coerce.boolean().optional().default(true),
  edgeTop: z.coerce.boolean().optional().default(false),
  edgeBottom: z.coerce.boolean().optional().default(false),
  edgeLeft: z.coerce.boolean().optional().default(false),
  edgeRight: z.coerce.boolean().optional().default(false)
});

export const projectItemCommandSchema = z.object({
  projectId: z.string().uuid(),
  itemId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().positive()
});

export const updateProjectItemSchema = projectItemSchema.extend({
  itemId: z.string().uuid()
});

/**
 * Borrador editable del proyecto: lo que el usuario tiene en pantalla, guardado
 * o no. Se usa tanto para probar la optimizacion sin persistir como para
 * guardar todo junto y reoptimizar.
 */
export const projectDraftItemSchema = z.object({
  id: z.string().uuid().optional(),
  reference: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).default(""),
  quantity: z.coerce.number().int().min(1).max(999),
  width: z.coerce.number().positive().max(10000),
  height: z.coerce.number().positive().max(10000),
  grain: z.boolean().default(false),
  canRotate: z.boolean().default(true),
  edgeTop: z.boolean().default(false),
  edgeBottom: z.boolean().default(false),
  edgeLeft: z.boolean().default(false),
  edgeRight: z.boolean().default(false)
});

export const projectDraftSchema = z.object({
  projectId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().positive(),
  materialId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).default(""),
  kerf: z.coerce.number().min(0).max(20),
  trimX: z.coerce.number().min(0).max(200),
  trimY: z.coerce.number().min(0).max(200),
  minRemnant: z.coerce.number().min(0).max(2000),
  strategy: z.enum(["baseline", "v10"]).default("baseline"),
  profile: z.enum(["fast", "balanced", "deep"]).optional(),
  items: z.array(projectDraftItemSchema).max(600)
});

export type ProjectDraftItem = z.infer<typeof projectDraftItemSchema>;
export type ProjectDraft = z.infer<typeof projectDraftSchema>;

export type SaveProjectDraftOutcome =
  | { ok: true; version: number; optimization: { ok: boolean; error?: string } }
  | { ok: false; error: string; conflict?: boolean };

export const importProjectItemsSchema = z.object({
  projectId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().positive(),
  list: z.string().min(1).max(20000)
});

export type ParsedProjectItem = {
  quantity: number;
  width: number;
  height: number;
  description: string;
};

export type ParsedProjectItemList = {
  items: ParsedProjectItem[];
  invalidLines: string[];
};

const PASTED_LINE_PATTERNS = [
  // "4 piezas de 629.0 x 570.0" | "1 pieza de 629,0 x 570,0 Lateral"
  /^(\d+)\s+piezas?\s+de\s+(\d+(?:[.,]\d+)?)\s*[x*\u00d7]\s*(\d+(?:[.,]\d+)?)\s*(.*)$/i,
  // "4 629x570 Estante" | "629x570 Estante" | "4 629 x 570"
  /^(?:(\d+)\s*[x*]?\s+)?(\d+(?:[.,]\d+)?)\s*[x*×]\s*(\d+(?:[.,]\d+)?)\s*(.*)$/i,
  // "4 629 570 Estante"
  /^(\d+)\s+(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)\s*(.*)$/
];

/**
 * Lee un listado pegado del taller: una pieza por linea con cantidad, medidas y
 * nombre. Acepta separadores `x`, `*` o espacios y decimales con coma.
 */
export function parsePastedProjectItems(text: string): ParsedProjectItemList {
  const items: ParsedProjectItem[] = [];
  const invalidLines: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = normalizePastedLine(rawLine);
    if (!line) continue;

    const match = PASTED_LINE_PATTERNS.reduce<RegExpMatchArray | null>(
      (found, pattern) => found ?? line.match(pattern),
      null
    );

    if (!match) {
      invalidLines.push(line);
      continue;
    }

    const quantity = match[1] ? Number.parseInt(match[1], 10) : 1;
    const width = toNumber(match[2]);
    const height = toNumber(match[3]);

    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || quantity <= 0) {
      invalidLines.push(line);
      continue;
    }

    items.push({
      quantity: Math.min(quantity, 999),
      width,
      height,
      description: (match[4] ?? "").trim().slice(0, 500)
    });
  }

  return { items, invalidLines };
}

function toNumber(value: string): number {
  return Number.parseFloat(value.replace(",", "."));
}

function normalizePastedLine(value: string): string {
  return value.trim().replace(/^[-\u2022]\s*(?=\d)/, "");
}

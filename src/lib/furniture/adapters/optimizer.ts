import type {
  OptimizationEdgeBandType,
  OptimizationInput,
  OptimizationPieceInput,
  OptimizerProfile,
} from '@/lib/optimizer';

import { cutList, type CutListLine } from '../core/bom';
import type { EdgeBandType, FurnitureModel, MaterialRole } from '../core/types';

/** Material real que la maderera asigna a cada rol del mueble. */
export interface MaterialSpec {
  id: string;
  code?: string;
  description: string;
  hasGrain: boolean;
  thickness: number;
  board: { width: number; height: number };
}

export interface OptimizerAdapterOptions {
  materials: Partial<Record<MaterialRole, MaterialSpec>> & { body: MaterialSpec };
  kerf: number;
  trim: { x: number; y: number };
  minRemnant?: number;
  profile?: OptimizerProfile;
  stages?: number;
}

const edgeType = (edge: EdgeBandType): OptimizationEdgeBandType => edge;

function materialFor(role: MaterialRole, opts: OptimizerAdapterOptions): MaterialSpec {
  const material = opts.materials[role]
    ?? (role === 'front' || role === 'drawer' ? opts.materials.body : undefined)
    ?? (role === 'drawerBottom' ? opts.materials.back : undefined);

  if (!material) throw new Error(`Falta el material para el rol "${role}".`);
  return material;
}

function materialGroupKey(material: MaterialSpec, opts: OptimizerAdapterOptions): string {
  return [
    material.id,
    material.thickness,
    material.board.width,
    material.board.height,
    material.hasGrain ? 1 : 0,
    opts.kerf,
    opts.trim.x,
    opts.trim.y,
  ].join('|');
}

function toPiece(line: CutListLine, material: MaterialSpec, index: number): OptimizationPieceInput {
  const grain = material.hasGrain && line.grainMatters;
  return {
    reference: `${line.material}-${index + 1}`,
    description: line.name,
    quantity: line.quantity,
    width: line.cutLargo,
    height: line.cutAncho,
    grain,
    canRotate: !grain,
    edges: {
      top: line.edges.top !== 'none',
      bottom: line.edges.bottom !== 'none',
      left: line.edges.left !== 'none',
      right: line.edges.right !== 'none',
    },
    edgeTypes: {
      top: edgeType(line.edges.top),
      bottom: edgeType(line.edges.bottom),
      left: edgeType(line.edges.left),
      right: edgeType(line.edges.right),
    },
    metadata: {
      partIds: line.partIds,
      materialRole: line.material,
      cutThickness: line.cutEspesor,
    },
  };
}

/**
 * Convierte uno o varios muebles en entradas canónicas del optimizador, una por
 * material físico. Roles que apuntan al mismo tablero real se optimizan juntos;
 * materiales con distinto espesor/formato/veta nunca se mezclan.
 */
export function toOptimizationInputs(
  models: FurnitureModel[],
  opts: OptimizerAdapterOptions,
): OptimizationInput[] {
  const byMaterial = new Map<string, { material: MaterialSpec; pieces: OptimizationPieceInput[] }>();

  cutList(models).forEach((line, index) => {
    const material = materialFor(line.material, opts);
    if (Math.abs(material.thickness - line.cutEspesor) > 0.5) {
      throw new Error(
        `"${line.name}" mide ${line.cutEspesor} mm pero el material "${material.description}" es de ${material.thickness} mm.`,
      );
    }

    const key = materialGroupKey(material, opts);
    const entry = byMaterial.get(key) ?? { material, pieces: [] };
    entry.pieces.push(toPiece(line, material, index));
    byMaterial.set(key, entry);
  });

  const minRemnant = opts.minRemnant ?? 0;
  return [...byMaterial.values()].map(({ material, pieces }) => ({
    board: {
      width: material.board.width,
      height: material.board.height,
      thickness: material.thickness,
    },
    material: {
      id: material.id,
      code: material.code,
      description: material.description,
      hasGrain: material.hasGrain,
      thickness: material.thickness,
    },
    kerf: opts.kerf,
    trim: opts.trim,
    constraints: {
      profile: opts.profile ?? 'balanced',
      stages: opts.stages ?? 4,
      minRemnant,
      minCommercialRemnantLongSide: Math.max(minRemnant, 400),
    },
    pieces,
    strategy: 'v10',
  }));
}

export type { OptimizationInput } from '@/lib/optimizer';

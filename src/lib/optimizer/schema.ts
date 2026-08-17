import { z } from "zod";

import type { OptimizationInput } from "./types";

const positiveMm = z.number().finite().positive();
const nonNegativeMm = z.number().finite().min(0);

const pieceEdgesSchema = z
  .object({
    top: z.boolean().optional(),
    bottom: z.boolean().optional(),
    left: z.boolean().optional(),
    right: z.boolean().optional()
  })
  .strict()
  .optional();

export const optimizationInputSchema: z.ZodType<OptimizationInput> = z
  .object({
    board: z
      .object({
        width: positiveMm,
        height: positiveMm,
        thickness: positiveMm.optional()
      })
      .strict(),
    material: z
      .object({
        id: z.string().min(1).optional(),
        code: z.string().min(1).optional(),
        description: z.string().min(1),
        hasGrain: z.boolean(),
        thickness: positiveMm.optional()
      })
      .strict(),
    kerf: nonNegativeMm,
    trim: z
      .object({
        x: nonNegativeMm,
        y: nonNegativeMm
      })
      .strict(),
    constraints: z
      .object({
        profile: z.enum(["fast", "balanced", "deep"]).optional(),
        stages: z.number().int().min(1).max(8).optional(),
        minRemnant: nonNegativeMm,
        minCommercialRemnantLongSide: nonNegativeMm.optional(),
        allowOneBoard: z.boolean().optional(),
        allowPatternMaster: z.boolean().optional(),
        allowMultiSlice: z.boolean().optional(),
        allowDeadStripCompaction: z.boolean().optional()
      })
      .strict(),
    pieces: z
      .array(
        z
          .object({
            id: z.string().min(1).optional(),
            reference: z.string().min(1),
            description: z.string().optional(),
            quantity: z.number().int().positive(),
            width: positiveMm,
            height: positiveMm,
            grain: z.boolean().optional(),
            canRotate: z.boolean().optional(),
            edges: pieceEdgesSchema,
            metadata: z.record(z.unknown()).optional()
          })
          .strict(),
      )
      .min(1),
    strategy: z.enum(["baseline", "v10"]).optional(),
    projectId: z.string().min(1).optional(),
    projectVersion: z.number().int().positive().optional()
  })
  .strict()
  .superRefine((input, ctx) => {
    const usableWidth = input.board.width - input.trim.x;
    const usableHeight = input.board.height - input.trim.y;

    if (usableWidth <= 0 || usableHeight <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Board dimensions must remain positive after trim.",
        path: ["trim"]
      });
      return;
    }

    for (const [index, piece] of input.pieces.entries()) {
      const fitsNormal = piece.width <= usableWidth && piece.height <= usableHeight;
      const fitsRotated =
        piece.canRotate !== false &&
        !piece.grain &&
        piece.height <= usableWidth &&
        piece.width <= usableHeight;

      if (!fitsNormal && !fitsRotated) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Piece does not fit in the selected board format.",
          path: ["pieces", index]
        });
      }
    }
  });

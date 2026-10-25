import { z } from 'zod';

/**
 * Runtime contract matching the existing Express API success envelope.
 * Keep optional fields optional: several existing endpoints omit data/meta.
 */
export const apiSuccessResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.unknown().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

/** Runtime contract matching apps/api/src/shared/errors/errorResponse.ts. */
export const apiErrorResponseSchema = z.object({
  success: z.literal(false),
  message: z.string(),
  statusCode: z.number().int().min(400).max(599),
  code: z.string().min(1),
  requestId: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  errors: z.record(z.string(), z.array(z.string())).optional(),
  errorMeta: z
    .record(
      z.string(),
      z.array(z.object({ code: z.string(), params: z.record(z.string(), z.unknown()).optional() }))
    )
    .optional(),
});

export type ApiSuccessResponse = z.infer<typeof apiSuccessResponseSchema>;
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

import { z } from 'zod';

/** Success envelope used by Express; message is optional for legacy endpoints. */
export const apiSuccessResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
  data: z.unknown().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

/** Error envelope matching apps/api/src/shared/errors/errorResponse.ts. */
export const apiErrorResponseSchema = z.object({
  success: z.literal(false),
  message: z.string(),
  statusCode: z.number().int().min(400).max(599),
  code: z.string().min(1),
  requestId: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  errors: z.record(z.string(), z.array(z.string())).optional(),
  errorMeta: z.record(
    z.string(),
    z.array(z.object({ code: z.string().min(1), params: z.record(z.string(), z.unknown()).optional() }).passthrough())
  ).optional(),
}).passthrough();

export type ApiSuccessResponse = z.infer<typeof apiSuccessResponseSchema>;
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

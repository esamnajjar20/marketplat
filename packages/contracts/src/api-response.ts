import { z } from 'zod';
import { paginationMetaSchema, type PaginationMeta } from './pagination';

export interface ApiMeta {
  pagination?: PaginationMeta;
  [key: string]: unknown;
}

/** Success envelope emitted by Express. `message` and `data` are optional on legacy/204-like endpoints. */
export interface ApiSuccessEnvelope<T = unknown, M extends ApiMeta = ApiMeta> {
  success: true;
  message?: string;
  data?: T;
  meta?: M;
  requestId?: string;
}

/** Error envelope emitted by the API error handler. */
export interface ApiErrorEnvelope {
  success: false;
  message: string;
  statusCode: number;
  code: string;
  requestId?: string;
  meta?: Record<string, unknown>;
  errors?: Record<string, string[]>;
  errorMeta?: Record<string, Array<{ code: string; params?: Record<string, unknown> }>>;
}

export type ApiEnvelope<T = unknown> = ApiSuccessEnvelope<T> | ApiErrorEnvelope;

/** Success envelope runtime validator. Callers can extend/omit `data` as required by endpoint. */
export const apiSuccessResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
  data: z.unknown().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  requestId: z.string().optional(),
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

export const apiEnvelopeSchema = z.union([apiSuccessResponseSchema, apiErrorResponseSchema]);
export const apiPaginationMetaSchema = paginationMetaSchema;

export type ApiSuccessResponse = z.infer<typeof apiSuccessResponseSchema>;
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

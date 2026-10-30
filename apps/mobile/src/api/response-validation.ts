import type { ZodType } from 'zod';

/** Validates untrusted JSON before a critical endpoint payload is exposed to typed callers. */
export type ApiResponseParseResult<T> =
  | { success: true; data: T }
  | { success: false };

export function parseApiResponse<T>(schema: ZodType<T>, payload: unknown): ApiResponseParseResult<T> {
  const parsed = schema.safeParse(payload);
  return parsed.success ? { success: true, data: parsed.data } : { success: false };
}

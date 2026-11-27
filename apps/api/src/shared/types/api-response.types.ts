import type { ApiSuccessEnvelope, ApiMeta } from '@marketplat/contracts';

/** Backend success response alias; error responses use ApiErrorEnvelope. */
export type ApiResponse<T = unknown> = ApiSuccessEnvelope<T>;

export const successResponse = <T>(
  message: string,
  data?: T,
  meta?: ApiMeta,
): ApiResponse<T> => ({ success: true, message, data, meta });

import type { Request, Response } from 'express';
import type { ErrorCodeValue } from './errorCodes';

export interface ApiErrorBody {
  success: false;
  message: string;
  statusCode: number;
  code: ErrorCodeValue | string;
  requestId?: string;
  meta?: Record<string, unknown>;
  errors?: Record<string, string[]>;
  errorMeta?: Record<string, { code: string; params?: Record<string, unknown> }[]>;
}

export function buildApiErrorBody(
  req: Request,
  statusCode: number,
  code: ErrorCodeValue | string,
  message: string,
  meta?: Record<string, unknown>,
  errors?: Record<string, string[]>,
  errorMeta?: Record<string, { code: string; params?: Record<string, unknown> }[]>,
): ApiErrorBody {
  return {
    success: false,
    message,
    statusCode,
    code,
    ...(req.requestId ? { requestId: req.requestId } : {}),
    ...(meta ? { meta } : {}),
    ...(errors ? { errors } : {}),
    ...(errorMeta ? { errorMeta } : {}),
  };
}

export function sendApiError(
  req: Request,
  res: Response,
  statusCode: number,
  code: ErrorCodeValue | string,
  message: string,
  meta?: Record<string, unknown>,
  errors?: Record<string, string[]>,
  errorMeta?: Record<string, { code: string; params?: Record<string, unknown> }[]>,
): void {
  const requestId = req.requestId;
  res.locals.errorCode = code;
  const retryAfterSeconds = meta?.retryAfterSeconds;
  if (typeof retryAfterSeconds === 'number' && Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    res.setHeader('Retry-After', String(Math.ceil(retryAfterSeconds)));
  }
  res.status(statusCode).json(buildApiErrorBody(req, statusCode, code, message, meta, errors, errorMeta));
}

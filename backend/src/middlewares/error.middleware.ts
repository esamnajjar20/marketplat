import { Request, Response, NextFunction } from 'express';
import { AppError } from '../shared/errors/AppError';
import { logger } from '../shared/utils/logger';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';

interface ErrorResponse {
  success: false;
  message: string;
  statusCode: number;
  // Stable, machine-readable code (see shared/errors/errorCodes.ts).
  // Additive: existing consumers reading `message`/`statusCode` are
  // unaffected. New frontend code should switch on `code` rather than
  // comparing the English `message` string, since messages may be
  // reworded without that being a breaking API change.
  code: string;
  requestId?: string;
  errors?: Record<string, string[]>;
  // Structured values (e.g. a numeric limit) for errors whose Arabic
  // translation needs to interpolate data. Lets the frontend build the
  // localized message from `meta` instead of parsing it out of the
  // English `message` text.
  meta?: Record<string, unknown>;
}

const buildErrorResponse = (
  message: string,
  statusCode: number,
  code: string,
  requestId?: string,
  errors?: Record<string, string[]>,
  meta?: Record<string, unknown>,
): ErrorResponse => ({
  success: false,
  message,
  statusCode,
  code,
  ...(requestId && { requestId }),
  ...(errors && { errors }),
  ...(meta && { meta }),
});

// Fallback codes for errors that don't carry an explicit AppError.code —
// e.g. a raw ZodError, an unmapped Prisma error, or a truly unexpected
// exception. Keeps `code` always present in the response body even when
// no call site set one explicitly.
const CODE_BY_STATUS: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'RESOURCE_NOT_FOUND',
  409: 'CONFLICT',
  429: 'RATE_LIMIT_EXCEEDED',
  503: 'SERVICE_UNAVAILABLE',
};

export const errorMiddleware = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const requestId = req.requestId;

  if (err instanceof ZodError) {
    const errors: Record<string, string[]> = {};
    err.errors.forEach(e => {
      const field = e.path.join('.') || 'general';
      if (!errors[field]) errors[field] = [];
      errors[field].push(e.message);
    });
    res.status(400).json(
      buildErrorResponse('Validation failed', 400, 'VALIDATION_ERROR', requestId, errors),
    );
    return;
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error('Operational error', {
        message: err.message,
        stack: err.stack,
        requestId,
      });
    }
    const code = err.code ?? CODE_BY_STATUS[err.statusCode] ?? 'INTERNAL_ERROR';
    res.status(err.statusCode).json(
      buildErrorResponse(err.message, err.statusCode, code, requestId, undefined, err.meta),
    );
    return;
  }

  // FIX D-09: safety net for any Prisma error that reaches here unhandled
  // by a service layer (e.g. a future endpoint that forgets to catch a
  // P2002/P2025 race the way favoritesService/reportsService already do).
  // Translating known Prisma error codes here means a missed catch in a
  // service degrades to a clear 409/404, not an opaque 500 that looks
  // like a real incident in monitoring during ordinary concurrent usage.
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    logger.warn('Unhandled Prisma error reached error middleware', {
      code: err.code,
      message: err.message,
      requestId,
      path: req.path,
      method: req.method,
    });

    if (err.code === 'P2002') {
      res.status(409).json(
        buildErrorResponse('A record with this value already exists', 409, 'CONFLICT', requestId),
      );
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json(
        buildErrorResponse('Record not found', 404, 'RESOURCE_NOT_FOUND', requestId),
      );
      return;
    }
    if (err.code === 'P2003') {
      res.status(409).json(
        buildErrorResponse('This action conflicts with related data', 409, 'CONFLICT', requestId),
      );
      return;
    }

    res.status(500).json(
      buildErrorResponse('Internal server error', 500, 'INTERNAL_ERROR', requestId),
    );
    return;
  }

  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    requestId,
    path: req.path,
    method: req.method,
  });

  res.status(500).json(
    buildErrorResponse('Internal server error', 500, 'INTERNAL_ERROR', requestId),
  );
};

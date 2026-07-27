import { Request, Response, NextFunction } from 'express';
import { AppError } from '../shared/errors/AppError';
import { logger } from '../shared/utils/logger';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';

interface ErrorResponse {
  success: false;
  message: string;
  statusCode: number;
  requestId?: string;
  errors?: Record<string, string[]>;
}

const buildErrorResponse = (
  message: string,
  statusCode: number,
  requestId?: string,
  errors?: Record<string, string[]>
): ErrorResponse => ({
  success: false,
  message,
  statusCode,
  ...(requestId && { requestId }),
  ...(errors && { errors }),
});

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
    res.status(400).json(buildErrorResponse('Validation failed', 400, requestId, errors));
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
    res.status(err.statusCode).json(buildErrorResponse(err.message, err.statusCode, requestId));
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
        buildErrorResponse('A record with this value already exists', 409, requestId),
      );
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json(buildErrorResponse('Record not found', 404, requestId));
      return;
    }
    if (err.code === 'P2003') {
      res.status(409).json(
        buildErrorResponse('This action conflicts with related data', 409, requestId),
      );
      return;
    }

    res.status(500).json(buildErrorResponse('Internal server error', 500, requestId));
    return;
  }

  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    requestId,
    path: req.path,
    method: req.method,
  });

  res.status(500).json(buildErrorResponse('Internal server error', 500, requestId));
};

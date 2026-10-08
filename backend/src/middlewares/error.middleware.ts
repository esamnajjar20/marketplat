import { Request, Response, NextFunction } from 'express';
import { AppError } from '../shared/errors/AppError';
import { buildApiErrorBody } from '../shared/errors/errorResponse';
import { ErrorCode } from '../shared/errors/errorCodes';
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
  // structured, per-field validation detail alongside the
  // English `errors` strings above. `errors` is kept exactly as before
  // (existing consumers, including the frontend test suite, depend on
  // its literal English text) — this is purely additive. Each entry
  // mirrors the corresponding Zod issue's own `code` (Zod's
  // ZodIssueCode, e.g. 'too_small' / 'too_big' / 'invalid_string' /
  // 'invalid_type' / 'custom' / 'invalid_enum_value') plus whatever
  // numeric/string params that issue carries (minimum/maximum/type/
  // validation/etc.), so a translator can build a real Arabic sentence
  // from structure instead of pattern-matching English prose — which
  // breaks the moment a message here is reworded, and can't handle a
  // field with no custom message at all (Zod's own default English).
  errorMeta?: Record<string, { code: string; params?: Record<string, unknown> }[]>;
  // Structured values (e.g. a numeric limit) for errors whose Arabic
  // translation needs to interpolate data. Lets the frontend build the
  // localized message from `meta` instead of parsing it out of the
  // English `message` text.
  meta?: Record<string, unknown>;
}

// Fallback codes for errors that don't carry an explicit AppError.code —
// e.g. a raw ZodError, an unmapped Prisma error, or a truly unexpected
// exception. Keeps `code` always present in the response body even when
// no call site set one explicitly.
const CODE_BY_STATUS: Record<number, string> = {
  400: ErrorCode.VALIDATION_ERROR,
  401: ErrorCode.UNAUTHORIZED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.RESOURCE_NOT_FOUND,
  409: ErrorCode.CONFLICT,
  // the frontend's errorParser.ts already has a
  // dedicated `case 422` branch expecting a `code`, but nothing here
  // populated CODE_BY_STATUS for it — any AppError thrown with
  // statusCode 422 and no explicit `.code` would silently fall through
  // to the generic ErrorCode.INTERNAL_ERROR code below instead of a stable,
  // translatable one. Filling this in now (rather than only when a
  // 422-throwing call site is added) means `code` is always present
  // for every status this API defines, closing the gap the frontend's
  // ErrorResponse contract already assumes.
  422: ErrorCode.UNPROCESSABLE_ENTITY,
  429: ErrorCode.RATE_LIMIT_EXCEEDED,
  503: ErrorCode.SERVICE_UNAVAILABLE,
};

export const errorMiddleware = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const requestId = req.requestId;

  // express.json() throws SyntaxError with
  // err.status=400 / err.type='entity.parse.failed' on malformed JSON.
  // Before this, the middleware fell through to the generic 500 path,
  // which polluted Sentry with "Unhandled error" alerts for what is
  // actually a 400 client error. Respect err.status / err.statusCode
  // when present (this also covers any other middleware that assigns
  // a status to its thrown error).
  const rawStatus =
    typeof (err as unknown as { status?: unknown }).status === 'number'
      ? (err as unknown as { status: number }).status
      : typeof (err as unknown as { statusCode?: unknown }).statusCode === 'number'
        ? (err as unknown as { statusCode: number }).statusCode
        : undefined;
  if (rawStatus && rawStatus >= 400 && rawStatus < 600) {
    const code =
      CODE_BY_STATUS[rawStatus] ??
      (rawStatus === 400 ? ErrorCode.BAD_REQUEST : ErrorCode.INTERNAL_ERROR);
    const safeMessage =
      rawStatus >= 500
        ? rawStatus === 503
          ? 'Service temporarily unavailable, please try again shortly'
          : 'Internal server error'
        : rawStatus === 400
          ? 'Request could not be processed.'
          : rawStatus === 401
            ? 'Authentication required.'
            : rawStatus === 403
              ? 'Forbidden.'
              : rawStatus === 404
                ? 'Resource not found.'
                : rawStatus === 409
                  ? 'Request conflicts with the current resource state.'
                  : rawStatus === 422
                    ? 'Request could not be processed.'
                    : rawStatus === 429
                      ? 'Too many requests.'
                      : 'Request could not be processed.';
    res.locals.errorCode = code;
    res.status(rawStatus).json(buildApiErrorBody(req, rawStatus, code, safeMessage));
    return;
  }

  if (err instanceof ZodError) {
    const errors: Record<string, string[]> = {};
    // errorMeta carries the same per-field issues as
    // `errors` above, but as structured { code, params } instead of an
    // already-rendered English sentence — see the ErrorResponse
    // interface for why. Built in lockstep with `errors` (same field
    // key, same push order) so index i in one array always corresponds
    // to index i in the other for a given field.
    const errorMeta: Record<string, { code: string; params?: Record<string, unknown> }[]> = {};
    err.errors.forEach(e => {
      const field = e.path.join('.') || 'general';
      if (!errors[field]) errors[field] = [];
      errors[field].push(e.message);
      if (!errorMeta[field]) errorMeta[field] = [];
      // `e` (a ZodIssue) always has `.code`; the remaining fields vary
      // by issue type (minimum/maximum/type/expected/received/options/
      // validation/...). Spreading everything except the ones already
      // surfaced elsewhere (code, message, path) keeps this generic
      // across all ZodIssueCode variants without a per-type switch.
      const { code: issueCode, ...params } = e as unknown as Record<string, unknown>;
      errorMeta[field].push({
        code: String(issueCode),
        ...(Object.keys(params).length > 0 && {
          params: params as Record<string, unknown>,
        }),
      });
    });
    res.locals.errorCode = ErrorCode.VALIDATION_ERROR;
    res
      .status(400)
      .json(
        buildApiErrorBody(
          req,
          400,
          ErrorCode.VALIDATION_ERROR,
          'Validation failed',
          undefined,
          errors,
          errorMeta
        )
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
    const code = err.code ?? CODE_BY_STATUS[err.statusCode] ?? ErrorCode.INTERNAL_ERROR;
    const clientMessage = err.statusCode >= 500
      ? (err.statusCode === 503
          ? 'Service temporarily unavailable, please try again shortly'
          : 'Internal server error')
      : err.message;
    res.locals.errorCode = code;
    res
      .status(err.statusCode)
      .json(buildApiErrorBody(req, err.statusCode, code, clientMessage, err.meta));
    return;
  }

  // safety net for any Prisma error that reaches here unhandled
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
      res.locals.errorCode = ErrorCode.CONFLICT;
      res
        .status(409)
        .json(
          buildApiErrorBody(req, 409, ErrorCode.CONFLICT, 'A record with this value already exists')
        );
      return;
    }
    if (err.code === 'P2025') {
      res.locals.errorCode = ErrorCode.RESOURCE_NOT_FOUND;
      res
        .status(404)
        .json(buildApiErrorBody(req, 404, ErrorCode.RESOURCE_NOT_FOUND, 'Record not found'));
      return;
    }
    if (err.code === 'P2003') {
      res.locals.errorCode = ErrorCode.CONFLICT;
      res
        .status(409)
        .json(
          buildApiErrorBody(req, 409, ErrorCode.CONFLICT, 'This action conflicts with related data')
        );
      return;
    }
    res.locals.errorCode = ErrorCode.INTERNAL_ERROR;
    res
      .status(500)
      .json(buildApiErrorBody(req, 500, ErrorCode.INTERNAL_ERROR, 'Internal server error'));
    return;
  }

  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    requestId,
    path: req.path,
    method: req.method,
  });
  res.locals.errorCode = ErrorCode.INTERNAL_ERROR;
  res
    .status(500)
    .json(buildApiErrorBody(req, 500, ErrorCode.INTERNAL_ERROR, 'Internal server error'));
};

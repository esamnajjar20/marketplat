import { Request, Response, NextFunction } from 'express';
import { clientErrorSchema } from './observability.validation';
import { logger } from '../../shared/utils/logger';
import { getClientIp } from '../../shared/utils/getClientIp';
import { successResponse } from '../../shared/types/api-response.types';

const SENSITIVE_CONTEXT_KEY =
  /(?:password|passwd|secret|token|authorization|cookie|session|api[-_]?key|credential|refresh|access[-_]?token)/i;
const MAX_CONTEXT_DEPTH = 5;

/**
 * Client error reports are anonymous and therefore untrusted. Keep useful
 * diagnostic context, but remove credential-like fields before it reaches
 * Winston, files, webhook reporters, or Sentry. Bound recursion as a second
 * line of defense against pathological nested payloads.
 */
export const sanitizeClientErrorContext = (value: unknown, depth = 0): unknown => {
  if (depth >= MAX_CONTEXT_DEPTH) return '[truncated]';
  if (Array.isArray(value)) {
    return value.slice(0, 50).map(item => sanitizeClientErrorContext(item, depth + 1));
  }
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 100)) {
      if (SENSITIVE_CONTEXT_KEY.test(key)) {
        output[key] = '[redacted]';
      } else {
        output[key] = sanitizeClientErrorContext(item, depth + 1);
      }
    }
    return output;
  }
  // Credential-like substrings can hide inside values (URLs, headers), not only keys.
  if (typeof value === 'string') return sanitizeDiagnosticText(value, 2_000);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  return String(value).slice(0, 200);
};

export const sanitizeDiagnosticText = (
  value: string | undefined,
  maxLength: number
): string | undefined => {
  if (value === undefined) return undefined;
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [redacted]')
    .replace(
      /(^|[?&\s])((?:access_token|refresh_token|token|api_key|password|secret)=)([^&#\s]*)/gi,
      (_match, prefix: string, key: string) => `${prefix}${key}[redacted]`
    )
    .slice(0, maxLength);
};

export const sanitizeClientUrl = (value?: string): string | undefined => {
  if (!value) return value;
  try {
    const parsed = new URL(value);
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().slice(0, 2_000);
  } catch {
    // Relative URLs are common in SPA error reports; remove query/hash without
    // trying to interpret or trust the supplied origin.
    return value.split(/[?#]/, 1)[0].slice(0, 2_000);
  }
};

/**
 * receives error reports from the
 * frontend (see apps/web/lib/errorReporter.ts) and forwards them to
 * the same logger pipeline the backend already uses for its own
 * errors — which means they reach Sentry via the existing
 * SentryErrorReporterTransport (see logger.ts) without the frontend
 * needing a Sentry SDK at all. This is the "Backend Proxy" pattern
 * chosen specifically for this project's Cloudflare Workers +
 * Render topology, where adding @sentry/nextjs to the frontend would
 * fight Cloudflare's 1MB Worker bundle limit and OpenNext's build
 * constraints.
 *
 * Always returns 202 (accepted), never 4xx/5xx on report content —
 * except for the validation error path that Zod + errorMiddleware
 * handle. The frontend treats the response as fire-and-forget anyway
 * (it never inspects the body), so returning an error status would
 * only add noise; what matters is that the report reaches the logger
 * before we respond.
 *
 * Rate limiting: uses analyticsEventsRateLimit (120/min) — the same
 * generous public-write budget the analytics beacon uses, for the
 * same reason. Client errors happen in bursts during outages; a
 * tighter limit would drop exactly the reports we most need.
 */
export const observabilityController = {
  clientError: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { body } = clientErrorSchema.parse({ body: req.body });

      // Reconstruct a real Error so Sentry's stack-processing (if the
      // transport calls captureException) sees the original client
      // stack, not the HTTP handler's own. If Sentry isn't configured,
      // logger.error still writes to Winston's console/file
      // transports — the endpoint remains useful either way.
      const clientError = new Error(sanitizeDiagnosticText(body.message, 2_000));
      if (body.name) clientError.name = body.name.slice(0, 200);
      const sanitizedStack = sanitizeDiagnosticText(body.stack, 10_000);
      if (sanitizedStack) clientError.stack = sanitizedStack;

      logger.error('client_error', {
        // The err field is what logger's Sentry transport looks for —
        // see logger.ts's SentryErrorReporterTransport for the exact
        // extraction. Without it, Sentry would just record the string
        // 'client_error' with no stack.
        err: clientError,
        // Context is namespaced under `clientContext` so it can't
        // collide with the backend's own request metadata that logger
        // may attach (service, environment, ...).
        clientContext:
          body.context === undefined ? undefined : sanitizeClientErrorContext(body.context),
        clientUrl: sanitizeClientUrl(body.url),
        clientUserAgent: body.userAgent,
        clientTimestamp: body.timestamp,
        service: body.service ?? 'marketplace-frontend',
        // Server-observed request metadata — authoritative, unlike the
        // client-supplied values above.
        ip: getClientIp(req),
        receivedAt: new Date().toISOString(),
      });

      res.status(202).json(successResponse('Client error recorded'));
    } catch (error) {
      next(error);
    }
  },
};

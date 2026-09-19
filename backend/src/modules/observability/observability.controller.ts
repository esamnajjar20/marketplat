import { Request, Response, NextFunction } from 'express';
import { clientErrorSchema } from './observability.validation';
import { logger } from '../../shared/utils/logger';
import { getClientIp } from '../../shared/utils/getClientIp';
import { successResponse } from '../../shared/types/api-response.types';

/**
 * FIX OBSERVABILITY-CLIENT-ERROR-01: receives error reports from the
 * frontend (see frontend/lib/errorReporter.ts) and forwards them to
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
      const clientError = new Error(body.message);
      if (body.name) clientError.name = body.name;
      if (body.stack) clientError.stack = body.stack;

      logger.error('client_error', {
        // The err field is what logger's Sentry transport looks for —
        // see logger.ts's SentryErrorReporterTransport for the exact
        // extraction. Without it, Sentry would just record the string
        // 'client_error' with no stack.
        err: clientError,
        // Context is namespaced under `clientContext` so it can't
        // collide with the backend's own request metadata that logger
        // may attach (service, environment, ...).
        clientContext: body.context,
        clientUrl: body.url,
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

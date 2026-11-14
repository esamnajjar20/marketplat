import { timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import { getGoWorkerToken } from '../shared/go-worker/goWorkerConfig';

/**
 * Shared bearer-token guard for every `/internal/go-worker/*` endpoint.
 *
 * Previously this exact block was copy-pasted into each of the five inline
 * handlers in app.ts. The behaviour is unchanged:
 *   - the expected token is read from GO_WORKER_TOKEN on every request;
 *   - comparison is constant-time and length-checked;
 *   - responses are always `Cache-Control: no-store`;
 *   - 503 when no token is configured, 401 when it is configured but wrong.
 *
 * `unauthorizedBody: 'ready'` keeps the readiness probe's historic
 * `{ ready: false }` body instead of `{ error: ... }`.
 */
export interface GoWorkerAuthOptions {
  unauthorizedBody?: 'error' | 'ready';
}

function extractBearerToken(req: Request): string {
  const authorization = req.get('authorization') ?? '';
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
}

export function requireGoWorkerToken(options: GoWorkerAuthOptions = {}): RequestHandler {
  const unauthorizedBody = options.unauthorizedBody ?? 'error';

  return (req, res, next) => {
    const expectedToken = getGoWorkerToken() ?? '';
    const expected = Buffer.from(expectedToken);
    const supplied = Buffer.from(extractBearerToken(req));
    const authorized =
      expected.length > 0 &&
      expected.length === supplied.length &&
      timingSafeEqual(expected, supplied);

    res.setHeader('Cache-Control', 'no-store');
    if (authorized) {
      next();
      return;
    }

    const status = expectedToken ? 401 : 503;
    if (unauthorizedBody === 'ready') {
      res.status(status).json({ ready: false });
      return;
    }
    res.status(status).json({
      error: expectedToken ? 'unauthorized' : 'internal worker token is not configured',
    });
  };
}

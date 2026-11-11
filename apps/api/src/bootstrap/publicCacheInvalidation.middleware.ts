import type { NextFunction, Request, Response } from 'express';
import { sendApiError } from '../shared/errors/errorResponse';
import { ErrorCode } from '../shared/errors/errorCodes';
import { logger } from '../shared/observability/logger';
import { publicMutationCacheTags } from '../shared/cache/publicMutationTags';
import { activateEdgePurgeIntent, createEdgePurgeIntent } from '../shared/cache/edgePurge';

/**
 * Invalidates public Next Data Cache entries only after a successful write.
 * Public writes persist a purge intent before entering their route handler;
 * private routes never enter the allowlist (see publicMutationCacheTags).
 */
export async function publicCacheInvalidation(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const tags = publicMutationCacheTags(req.method, req.originalUrl);
  if (tags.length === 0) {
    next();
    return;
  }

  let purgeIntentId: string | null = null;
  try {
    // Record a durable intent BEFORE allowing a public mutation to execute.
    // If the API process dies after the database commit, the delayed outbox
    // event still purges the edge. When purging is not configured this is a no-op.
    purgeIntentId = await createEdgePurgeIntent(tags);
  } catch (error) {
    logger.error('Could not persist required public-cache invalidation intent; mutation was not started', {
      method: req.method,
      path: req.path,
      tags,
      error,
    });
    sendApiError(
      req,
      res,
      503,
      ErrorCode.SERVICE_UNAVAILABLE,
      'Public cache invalidation is temporarily unavailable. Please retry.',
      { retryAfterSeconds: 5 }
    );
    return;
  }

  if (purgeIntentId) {
    const intentId = purgeIntentId;
    res.once('finish', () => {
      // A 5xx can happen after a mutation transaction committed, so retain and
      // activate its purge intent. A 4xx is treated as a rejected mutation.
      const shouldPurge = res.statusCode < 400 || res.statusCode >= 500;
      void activateEdgePurgeIntent(intentId, shouldPurge);
    });
  }
  next();
}

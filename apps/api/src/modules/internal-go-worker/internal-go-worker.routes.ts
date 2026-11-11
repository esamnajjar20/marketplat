import { Router } from 'express';
import { requireGoWorkerToken } from '../../middlewares/goWorkerAuth.middleware';
import { internalGoWorkerController } from './internal-go-worker.controller';

/**
 * Mounted at `/internal/go-worker` directly on the Express app (NOT under
 * `/api/v1`), after the JSON body parser and before the public API router, so
 * it bypasses the API rate limit, CSRF and public-cache-invalidation layers
 * exactly as the previous inline handlers did.
 */
export const internalGoWorkerRouter = Router();

const requireToken = requireGoWorkerToken();

internalGoWorkerRouter.post('/run-scheduled-job', requireToken, internalGoWorkerController.runScheduledJob);
internalGoWorkerRouter.post(
  '/publish-outbox-notifications',
  requireToken,
  internalGoWorkerController.publishOutboxNotifications
);
internalGoWorkerRouter.post(
  '/publish-durable-notifications',
  requireToken,
  internalGoWorkerController.publishDurableNotifications
);
internalGoWorkerRouter.get(
  '/push-adapter/health',
  requireGoWorkerToken({ unauthorizedBody: 'ready' }),
  internalGoWorkerController.pushAdapterHealth
);
internalGoWorkerRouter.post('/send-push-target', requireToken, internalGoWorkerController.sendPushTarget);

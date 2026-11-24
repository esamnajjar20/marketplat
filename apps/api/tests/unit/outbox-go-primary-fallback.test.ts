import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Go-owned background workers with Express fallback', () => {
  const worker = readFileSync(join(__dirname, '../../src/shared/outbox/outbox.worker.ts'), 'utf8');
  const app = readFileSync(join(__dirname, '../../src/app.ts'), 'utf8');
  const marketplaceOrders = readFileSync(join(__dirname, '../../src/modules/commerce/marketplace-orders/marketplace-orders.service.ts'), 'utf8');

  it('uses an authenticated, bounded status probe and falls back when Go is unavailable', () => {
    expect(worker).toContain('/internal/outbox/worker-status');
    expect(worker).toContain('GO_WORKER_OUTBOX_PRIMARY_ENABLED');
    expect(worker).toContain("process.env.GO_WORKER_OUTBOX_PRIMARY_ENABLED?.trim().toLowerCase() !== 'true'");
    expect(worker).toContain('AbortSignal.timeout(2_000)');
    expect(worker).toContain('goOutboxPrimaryCached = false');
    expect(worker).toContain('const count = goPrimaryActive ? 0 : await processOutboxBatch(undefined, allowGoExecution)');
    expect(worker).toContain('const allowGoExecution = !primaryConfigured');
  });

  it('keeps Express Push Dispatch as fallback until Go confirms its own worker is active', () => {
    expect(worker).toContain('GO_WORKER_PUSH_DISPATCH_PRIMARY_ENABLED');
    expect(worker).toContain('/internal/push/dispatch/worker-status');
    expect(worker).toContain('const pushDispatchCount = goPushDispatchPrimaryActive');
    expect(worker).toContain(': await processPushDispatchBatch()');
    expect(worker).toContain('if (!goPrimaryActive)');
    expect(worker).toContain('pruneProcessedOutboxEvents()');
  });

  it('keeps future unsupported event types, including marketplace orders, on the Express consumer', () => {
    expect(worker).toContain('async function claimBatch(workerId: string, expressOnly = false)');
    expect(worker).toContain("${expressOnly} = false");
    expect(worker).toContain("'CACHE_GENERATION_BUMP'\n          )");
    expect(worker).toContain("event.eventType === 'MARKETPLACE_ORDER_NOTIFICATION'");
    expect(worker).toContain('processOutboxBatch(undefined, false, true)');
    expect(app).toContain('publish-outbox-notifications');
  });

  it('persists marketplace-order notification intent in the order transaction', () => {
    expect(marketplaceOrders).toContain('await tx.outboxEvent.create');
    expect(marketplaceOrders).toContain("eventType: 'MARKETPLACE_ORDER_NOTIFICATION'");
    expect(marketplaceOrders).toContain('marketplace-order-created:${order.id}');
    expect(marketplaceOrders).toContain('marketplace-order-status:${updatedOrder.id}:${updatedOrder.status}');
    expect(marketplaceOrders).not.toContain('notificationEvents.onMarketplaceOrderCreated');
  });

  it('authenticates and bounds the Go-to-Express post-commit callback', () => {
    expect(app).toContain('timingSafeEqual(expected, supplied)');
    expect(app).toContain("body.notifications.length > 50");
    expect(app).toContain('unreadNotificationsCache.invalidate(userId)');
    expect(app).toContain('publishNotificationEventsToMany');
  });
});


describe('Go-owned Notification Push Dispatch provider adapter', () => {
  const app = readFileSync(join(__dirname, '../../src/app.ts'), 'utf8');
  const worker = readFileSync(join(__dirname, '../../src/shared/outbox/outbox.worker.ts'), 'utf8');

  it('protects the provider adapter with the shared timing-safe worker token', () => {
    expect(app).toContain("'/internal/go-worker/push-adapter/health'");
    expect(app).toContain("'/internal/go-worker/send-push-target'");
    expect(app).toContain('timingSafeEqual(expected, supplied)');
    expect(app).toContain('pushService.sendToSubscriptionForOutbox');
    expect(app).toContain('fcmPushService.sendToToken');
  });

  it('moves the push-dispatch consumer to Go only after a positive status response', () => {
    expect(worker).toContain('isGoPushDispatchPrimaryActive');
    expect(worker).toContain('GO_WORKER_PUSH_DISPATCH_PRIMARY_ENABLED');
    expect(worker).toContain('AbortSignal.timeout(2_000)');
    expect(worker).toContain('goPushDispatchPrimaryActive ? 0');
    expect(worker).toContain('processPushDispatchBatch()');
  });
});

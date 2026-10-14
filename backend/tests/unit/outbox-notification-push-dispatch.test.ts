import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('durable notification push dispatch handoff', () => {
  const source = readFileSync(join(__dirname, '../../src/shared/outbox/outbox.worker.ts'), 'utf8');
  const schema = readFileSync(join(__dirname, '../../prisma/schema.prisma'), 'utf8');
  const migration = readFileSync(join(__dirname, '../../prisma/migrations/20261011150000_notification_push_dispatch_outbox/migration.sql'), 'utf8');
  const pushService = readFileSync(join(__dirname, '../../src/shared/utils/pushService.ts'), 'utf8');
  const targetMigration = readFileSync(join(__dirname, '../../prisma/migrations/20261011160000_notification_push_delivery_targets/migration.sql'), 'utf8');
  const targetLeaseMigration = readFileSync(join(__dirname, '../../prisma/migrations/20261011170000_notification_push_target_leases/migration.sql'), 'utf8');

  it('persists push dispatch intents in the same transaction as outbox-created notification rows', () => {
    expect(source).toContain('tx.notificationPushDispatch.createMany');
    expect(source).toContain('idempotencyKey: `notification-push:${row.id}`');
    expect(source).toContain('processPushDispatchBatch');
    expect(source).toContain('await processPushDispatchBatch()');
  });

  it('claims dispatch intents with a lease and bounded retry/dead-letter handling', () => {
    expect(source).toContain('FROM "notification_push_dispatches"');
    expect(source).toContain('FOR UPDATE SKIP LOCKED');
    expect(source).toContain('PUSH_DISPATCH_MAX_ATTEMPTS = 25');
    expect(source).toContain('SET "deadLetterAt" = NOW()');
    expect(source).toContain("SET \"availableAt\" = NOW() + (${delayMs} * INTERVAL '1 millisecond')");
  });

  it('keeps a unique dispatch per durable notification and cascades cleanup with the notification', () => {
    expect(schema).toContain('model NotificationPushDispatch');
    expect(schema).toContain('notificationId String        @unique');
    expect(schema).toContain('notification   Notification  @relation(fields: [notificationId], references: [id], onDelete: Cascade)');
    expect(migration).toContain('FOREIGN KEY ("notificationId") REFERENCES "notifications"("id")');
    expect(migration).toContain('ON DELETE CASCADE');
    expect(migration).not.toMatch(/INSERT\s+INTO\s+"notification_push_dispatches"/i);
  });

  it('does not acknowledge a durable dispatch while individual targets remain pending', () => {
    expect(source).toContain("where: { dispatchId: dispatch.id, status: 'PENDING' }");
    expect(source).toContain("SET \"status\" = ${outcome === 'sent' ? 'SENT' : 'GONE'}, \"processedAt\" = NOW()");
    expect(source).toContain('completedPushDispatchesWithPermanentFailure: permanentPushFailures');
    expect(source).toContain('attempts: { decrement: 1 }');
    expect(source).not.toContain('pushService.deliverForOutbox(dispatch.userId, payload)');
  });

  it('tracks outcomes per device so retrying one target does not fan out to successful devices', () => {
    expect(schema).toContain('model NotificationPushDeliveryTarget');
    expect(schema).toContain('@@unique([dispatchId, channel, targetId])');
    expect(targetMigration).toContain('notification_push_delivery_targets_dispatchId_channel_targetId_key');
    expect(source).toContain('seedPushDeliveryTargets(dispatch, workerId)');
    expect(source).toContain('AND "availableAt" <= NOW()');
    expect(source).toContain("SET \"status\" = ${outcome === 'sent' ? 'SENT' : 'GONE'}, \"processedAt\" = NOW()");
    expect(source).toContain('PUSH_TARGET_MAX_ATTEMPTS = 12');
    expect(pushService).toContain('sendToSubscriptionForOutbox');
    expect(source).toContain('fcmPushService.sendToToken(token, payload)');
    expect(targetMigration).not.toMatch(/\"(endpoint|p256dh|auth|token)\"/i);
  });

  it('reports stale, exhausted, and terminal per-target delivery states in queue health', () => {
    expect(source).toContain('stalePushTargetLeases');
    expect(source).toContain('exhaustedPendingPushTargets');
    expect(source).toContain('failedPushTargets');
    expect(source).toContain('stalePushTargetLeaseCount: stalePushTargetLeases');
    expect(source).toContain('exhaustedPendingPushTargetCount: exhaustedPendingPushTargets');
    expect(source).toContain('failedPushTargetCount: failedPushTargets');
    expect(source).toContain('PUSH_TARGET_MAX_ATTEMPTS');
  });

  it('logs when lease-conditional target outcome writes lose ownership instead of silently implying persistence', () => {
    expect(source).toContain('Push target outcome was not persisted because target lease ownership was lost');
    expect(source).toContain('Push target retry was not persisted because target lease ownership was lost');
    expect(source).toContain('Push target failure was not persisted because target lease ownership was lost');
    expect(source).toContain('persisted.length !== 1');
  });

  it('renews the dispatch lease separately from per-target leases during slow delivery work', () => {
    expect(source).toContain('function startPushDispatchLeaseHeartbeat(dispatchId: string, workerId: string)');
    expect(source).toContain('const stopDispatchHeartbeat = startPushDispatchLeaseHeartbeat(dispatch.id, workerId)');
    expect(source).toContain('where: { id: dispatchId, lockedBy: workerId, processedAt: null, deadLetterAt: null }');
    expect(source).toContain('Push dispatch lease heartbeat found that dispatch ownership was lost');
    expect(source).toContain('Push dispatch lease heartbeat failed');
    expect(source).toContain('} finally {\n      stopDispatchHeartbeat();');
    expect(source).toContain('function withPushTargetLeaseHeartbeat');
  });

  it('claims delivery targets atomically and renews per-target leases during slow provider calls', () => {
    expect(schema).toContain('lockedAt    DateTime?');
    expect(schema).toContain('lockedBy    String?  @db.VarChar(120)');
    expect(targetLeaseMigration).toContain('ADD COLUMN "lockedAt" TIMESTAMP(3)');
    expect(targetLeaseMigration).toContain('ADD COLUMN "lockedBy" VARCHAR(120)');
    expect(targetLeaseMigration).toContain('notification_push_delivery_targets_status_lockedAt_idx');
    expect(source).toContain('FOR UPDATE SKIP LOCKED');
    expect(source).toContain('claimPushDeliveryTargets(dispatch.id, workerId)');
    expect(source).toContain('withPushTargetLeaseHeartbeat(dispatch.id, workerId');
    expect(source).toContain('"lockedAt" < NOW() -');
    expect(source).toContain('lockedBy: workerId');
    expect(source).toContain('MIN(GREATEST(target."availableAt"');
    expect(source).toContain('Target retry limit reached after abandoned attempts');
    expect(source).toContain('AND "attempts" >= ${PUSH_TARGET_MAX_ATTEMPTS}');
  });

  it('renews target leases only while the same worker still owns a live parent dispatch lease', () => {
    expect(source).toContain('UPDATE "notification_push_delivery_targets" AS target');
    expect(source).toContain('target."lockedBy" = ${workerId}');
    expect(source).toContain('SELECT 1 FROM "notification_push_dispatches" AS dispatch');
    expect(source).toContain('dispatch."lockedBy" = ${workerId}');
    expect(source).toContain("dispatch.\"lockedAt\" >= NOW() - (${LEASE_SECONDS} * INTERVAL '1 second')");
    expect(source).toContain('Push target lease heartbeat stopped because target or parent dispatch ownership was lost');
  });

  it('renews dispatch and target leases using PostgreSQL time to avoid host clock skew', () => {
    expect(source).toContain('UPDATE "notification_push_dispatches"\n      SET "lockedAt" = NOW()');
    expect(source).toContain('UPDATE "notification_push_delivery_targets" AS target\n      SET "lockedAt" = NOW()');
    expect(source).toContain('RETURNING "id"');
    expect(source).toContain('lease expiry is evaluated with NOW() in claimPushDispatch');
  });

  it('uses the database clock for stale-target terminalization and target lease health metrics', () => {
    expect(source).toContain('Target retry limit reached after abandoned attempts');
    expect(source).toContain('await prisma.$executeRaw`');
    expect(source).toContain("AND \"lockedAt\" < NOW() - (${LEASE_SECONDS} * INTERVAL '1 second')");
    expect(source).toContain('COUNT(*) FILTER (');
    expect(source).toContain('AS "stalePushTargetLeases"');
    expect(source).toContain('AS "exhaustedPendingPushTargets"');
    expect(source).not.toContain('lockedAt: { lt: new Date(Date.now() - LEASE_SECONDS * 1_000) }');
  });



  it('guards final dispatch acknowledgement against pending targets in the same SQL update', () => {
    expect(source).toContain('AND NOT EXISTS (');
    expect(source).toContain("WHERE target.\"dispatchId\" = dispatch.\"id\" AND target.\"status\" = 'PENDING'");
    expect(source).toContain('Push dispatch was not acknowledged because lease ownership was lost or pending targets remain');
    expect(source).toContain('SET "processedAt" = NOW(), "lockedAt" = NULL, "lockedBy" = NULL');
  });

  it('persists per-target terminal timestamps with PostgreSQL time and lease ownership', () => {
    expect(source).toContain("SET \"status\" = ${outcome === 'sent' ? 'SENT' : 'GONE'}, \"processedAt\" = NOW()");
    expect(source).toContain("SET \"status\" = 'FAILED', \"processedAt\" = NOW(), \"lastError\" = ${message.slice(0, 1000)}");
    expect(source).toContain("AND \"status\" = 'PENDING' AND \"lockedBy\" = ${workerId}");
  });


  it('does not dead-letter a dispatch while a target lease is active and terminalizes abandoned targets atomically', () => {
    expect(source).toContain('WITH quarantined_dispatch AS (');
    expect(source).toContain('AND active_target."lockedAt" >= NOW() - (${LEASE_SECONDS} * INTERVAL \'1 second\')');
    expect(source).toContain('FROM quarantined_dispatch AS dispatch');
    expect(source).toContain(`SET "status" = 'FAILED', "processedAt" = NOW()`);
    expect(source).toContain("'Parent push dispatch quarantined after bounded retries'");
    expect(source).toContain('terminalizedTargetCount');
    expect(source).toContain(`SET "availableAt" = NOW() + INTERVAL '1 second'`);
    expect(source).toContain('Push dispatch quarantine deferred while target lease remains active');
  });

  it('schedules push quiet-hours deferrals and target retries with PostgreSQL time', () => {
    expect(source).toContain('const quietDelayMs = Math.max(1_000, quiet.resumeInMs ?? 60_000)');
    expect(source).toContain("SET \"availableAt\" = NOW() + (${quietDelayMs} * INTERVAL '1 millisecond')");
    expect(source).toContain('const retryDelayMs = Math.min(1_000 * 2 ** Math.min(attemptedCount, 12), MAX_BACKOFF_MS)');
    expect(source).toContain("SET \"availableAt\" = NOW() + (${retryDelayMs} * INTERVAL '1 millisecond')");
    expect(source).toContain('SELECT MIN(GREATEST(target."availableAt"');
    expect(source).not.toContain('const retryAt = new Date(Date.now()');
    expect(source).not.toContain('availableAt: new Date(Date.now() + Math.max(1_000, quiet.resumeInMs ?? 60_000))');
  });

  it('schedules generic outbox retry with the database clock and retains lease ownership checks', () => {
    expect(source).toContain('UPDATE "outbox_events"');
    expect(source).toContain('WHERE "id" = ${event.id} AND "lockedBy" = ${workerId} AND "processedAt" IS NULL');
    expect(source).toContain("\"availableAt\" = NOW() + (${delayMs} * INTERVAL '1 millisecond')");
    expect(source).toContain('if (updated.length !== 1)');
  });

});

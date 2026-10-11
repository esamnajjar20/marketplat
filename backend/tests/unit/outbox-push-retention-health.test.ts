import { readFileSync } from 'fs';
import { join } from 'path';

const worker = readFileSync(join(__dirname, '../../src/shared/outbox/outbox.worker.ts'), 'utf8');

describe('push dispatch retention and health window', () => {
  it('prunes only completed push dispatches, bounded and skip-locked', () => {
    const fn = worker.slice(worker.indexOf('async function pruneProcessedPushDispatches'), worker.indexOf('async function reportOutboxHealth'));
    expect(fn).toContain('"processedAt" IS NOT NULL');
    expect(fn).toContain('LIMIT ${OUTBOX_RETENTION_BATCH_SIZE}');
    expect(fn).toContain('FOR UPDATE SKIP LOCKED');
    expect(fn).not.toContain('deadLetterAt');
  });

  it('only counts recent permanent push failures in the health report', () => {
    expect(worker).toContain('const PUSH_FAILURE_HEALTH_WINDOW_MS');
    expect(worker).toContain("status: 'FAILED', processedAt: { gte: recentFailureSince }");
    expect(worker).toContain('processedAt: { gte: recentFailureSince }, lastError: { not: null }');
  });
});

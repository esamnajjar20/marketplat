import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('outbox health monitoring and retry truthfulness', () => {
  const source = readFileSync(join(__dirname, '../../src/shared/outbox/outbox.worker.ts'), 'utf8');

  it('only reports a retry as persisted after a conditional update confirms ownership', () => {
    expect(source).toContain('await prisma.outboxEvent.updateMany');
    expect(source).toContain('.count !== 1');
    expect(source).toContain('Outbox retry was not scheduled because this worker no longer owns the event lease');
    expect(source).toContain('Outbox event processing failed; retry persisted');
  });

  it('monitors stale ready events, repeated failures, and expired leases without dropping events', () => {
    expect(source).toContain('const HEALTH_REPORT_INTERVAL_MS = 60_000;');
    expect(source).toContain('const STALE_EVENT_AGE_MS = 5 * 60 * 1_000;');
    expect(source).toContain('const HIGH_ATTEMPT_THRESHOLD = 10;');
    expect(source).toContain('async function reportOutboxHealth()');
    expect(source).toContain('staleReadyCount: staleReady');
    expect(source).toContain('repeatedFailureCount: repeatedFailures');
    expect(source).toContain('expiredLeaseCount: expiredLeases');
    expect(source).toContain('Outbox queue health report failed');
    expect(source).not.toContain('deleteMany({ where: { processedAt: null');
  });

  it('keeps the worker alive if persisting retry metadata fails and leaves lease recovery possible', () => {
    expect(source).toContain('Outbox retry persistence failed; event remains eligible for lease recovery');
    expect(source).toContain('await reportOutboxHealth().catch');
  });
});

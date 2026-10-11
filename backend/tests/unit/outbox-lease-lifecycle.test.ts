import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('outbox lease lifecycle safeguards', () => {
  const source = readFileSync(join(__dirname, '../../src/shared/outbox/outbox.worker.ts'), 'utf8');

  it('claims one event at a time so queued events cannot lose their leases before processing', () => {
    expect(source).toContain('const BATCH_SIZE = 1;');
    expect(source).toContain('later events\' leases expire while they wait behind a slow high-fan-out event.');
  });

  it('renews the active lease conditionally and clears the heartbeat when processing ends', () => {
    expect(source).toContain('const LEASE_HEARTBEAT_INTERVAL_MS = 30_000;');
    expect(source).toContain('async function withLeaseHeartbeat<T>');
    expect(source).toContain('UPDATE "outbox_events" SET "lockedAt" = NOW()');
    expect(source).toContain('"lockedBy" = ${workerId} AND "processedAt" IS NULL');
    expect(source).toContain('return await work();');
    expect(source).toContain('clearInterval(timer);');
  });

  it('keeps acknowledgement ownership checks and bounded exponential retry', () => {
    expect(source).toContain('Outbox lease lost before acknowledgement');
    expect(source).toContain('Outbox lease lost before notification acknowledgement');
    expect(source).toContain('Outbox lease lost before cache-generation acknowledgement');
    expect(source).toContain('Math.min(1_000 * (2 ** exponent), MAX_BACKOFF_MS)');
  });
});

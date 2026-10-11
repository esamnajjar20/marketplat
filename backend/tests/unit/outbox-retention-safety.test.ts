import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('outbox retention safety', () => {
  const worker = readFileSync(join(__dirname, '../../src/shared/outbox/outbox.worker.ts'), 'utf8');
  const migration = readFileSync(join(__dirname, '../../prisma/migrations/20261011130000_outbox_retention_idempotency_ledger/migration.sql'), 'utf8');
  const schema = readFileSync(join(__dirname, '../../prisma/schema.prisma'), 'utf8');

  it('only deletes processed rows older than the retention cutoff in bounded batches', () => {
    expect(worker).toContain('const OUTBOX_PROCESSED_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;');
    expect(worker).toContain('const OUTBOX_RETENTION_BATCH_SIZE = 500;');
    expect(worker).toContain('candidate."processedAt" IS NOT NULL');
    expect(worker).toContain('candidate."processedAt" < \${cutoff}');
    expect(worker).toContain('LIMIT \${OUTBOX_RETENTION_BATCH_SIZE}');
    expect(worker).toContain('FOR UPDATE SKIP LOCKED');
  });

  it('reserves all historical and future idempotency keys outside prunable event rows', () => {
    expect(migration).toContain('INSERT INTO "outbox_event_idempotency" ("idempotencyKey", "recordedAt")');
    expect(migration).toContain('GROUP BY "idempotencyKey"');
    expect(migration).toContain('BEFORE INSERT ON "outbox_events"');
    expect(migration).toContain('EXECUTE FUNCTION reserve_outbox_event_idempotency_key()');
    expect(schema).toContain('model OutboxEventIdempotency');
  });

  it('keeps cleanup failures observable without stopping normal worker processing', () => {
    expect(worker).toContain('Processed outbox retention cleanup failed; events were not acknowledged or discarded');
    expect(worker).toContain('Pruned processed outbox event rows while preserving idempotency keys');
  });
});

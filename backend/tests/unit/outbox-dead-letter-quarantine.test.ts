import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('outbox bounded retry quarantine', () => {
  const source = readFileSync(join(__dirname, '../../src/shared/outbox/outbox.worker.ts'), 'utf8');
  const schema = readFileSync(join(__dirname, '../../prisma/schema.prisma'), 'utf8');
  const migration = readFileSync(join(__dirname, '../../prisma/migrations/20261011140000_outbox_dead_letter_quarantine/migration.sql'), 'utf8');

  it('quarantines repeatedly failing events only while the worker still owns the lease', () => {
    expect(source).toContain('const MAX_PROCESSING_ATTEMPTS = 25;');
    expect(source).toContain('if (event.attempts >= MAX_PROCESSING_ATTEMPTS)');
    expect(source).toContain('lockedBy: workerId, processedAt: null, deadLetterAt: null');
    expect(source).toContain('deadLetterAt: new Date()');
    expect(source).toContain('payload retained for recovery');
  });

  it('excludes quarantined events from automatic claims and active queue metrics', () => {
    expect(source).toContain('AND "deadLetterAt" IS NULL');
    expect(source).toContain('deadLetterCount');
    expect(source).toContain('deadLetterAt: { not: null }');
  });

  it('preserves the event payload and adds the quarantine timestamp to the schema', () => {
    expect(schema).toContain('deadLetterAt   DateTime?');
    expect(migration).toContain('ADD COLUMN "deadLetterAt" TIMESTAMP(3)');
    expect(migration).not.toMatch(/DELETE\s+FROM\s+"outbox_events"/i);
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('durable cache-generation retry wiring', () => {
  const swrSource = readFileSync(join(__dirname, '../../src/shared/utils/swrCache.ts'), 'utf8');
  const workerSource = readFileSync(join(__dirname, '../../src/shared/outbox/outbox.worker.ts'), 'utf8');

  it('persists a failed generation bump as an outbox event after Redis retries fail', () => {
    expect(swrSource).toContain("eventType: 'CACHE_GENERATION_BUMP'");
    expect(swrSource).toContain('await enqueueGenerationRetry(');
    expect(swrSource).toContain('persistRetry?: boolean');
  });

  it('retries cache-generation events through the existing lease/backoff worker', () => {
    expect(workerSource).toContain("event.eventType === 'CACHE_GENERATION_BUMP'");
    expect(workerSource).toContain("bumpGeneration(genKey, { persistRetry: false })");
    expect(workerSource).toContain('Outbox lease lost before cache-generation acknowledgement');
  });
});

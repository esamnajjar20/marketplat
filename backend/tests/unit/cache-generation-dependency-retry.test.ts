import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('durable cache invalidation dependency chain', () => {
  const swrSource = readFileSync(join(__dirname, '../../src/shared/utils/swrCache.ts'), 'utf8');
  const workerSource = readFileSync(join(__dirname, '../../src/shared/outbox/outbox.worker.ts'), 'utf8');
  const publicListSource = readFileSync(join(__dirname, '../../src/shared/utils/publicListCache.ts'), 'utf8');
  const adsSource = readFileSync(join(__dirname, '../../src/modules/ads/ads.cache.keys.ts'), 'utf8');

  it('persists dependent generation keys with a failed source invalidation', () => {
    expect(swrSource).toContain('retryRequiredGenKeys?: readonly string[]');
    expect(swrSource).toContain('retryDependentGenKeys?: readonly string[]');
    expect(swrSource).toMatch(/retryRequiredGenKeys:\s*\[\.\.\.new Set\(retryRequiredGenKeys\.filter\(key\s*=>\s*key !== genKey\)\)\]/);
    expect(swrSource).toContain('retryDependentGenKeys: [...new Set(retryDependentGenKeys)]');
  });

  it('retries source generation before dependent generations and retries the same event if either fails', () => {
    expect(workerSource).toContain('invalid required generation keys');
    expect(workerSource).toContain('invalid dependent generation keys');
    expect(workerSource).toContain('for (const requiredGenKey of (requiredValue as string[] | undefined) ?? [])');
    expect(workerSource).toContain('for (const dependentGenKey of (dependentValue as string[] | undefined) ?? [])');
    expect(workerSource).toMatch(/no event may\s+\/\/ invalidate the homepage while a sibling namespace can still be stale/);
    expect(workerSource).toContain('Redis dependent generation bump failed');
  });

  it('records homepage as a dependent of hard public-list and ads invalidation', () => {
    expect(publicListSource).toMatch(/retryRequiredGenKeys:\s*namespaces\.map\(hardGenKey\)\.filter\(key\s*=>\s*key !== hardGenKey\(ns\)\)/);
    expect(publicListSource).toContain("retryDependentGenKeys: [HOME_GEN_KEY]");
    expect(adsSource).toContain("retryDependentGenKeys: [HOME_GEN_KEY]");
  });
});

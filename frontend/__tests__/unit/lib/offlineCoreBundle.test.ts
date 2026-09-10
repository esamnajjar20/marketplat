/**
 * __tests__/unit/lib/offlineCoreBundle.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  CORE_CACHE,
  buildCoreUrls,
  getWarmupProgress,
  onWarmupProgress,
} from '@/lib/offlineCoreBundle';

vi.mock('@/lib/constants', () => ({
  API_BASE_URL: 'https://api.example.com',
}));

describe('offlineCoreBundle', () => {
  it('exports CORE_CACHE versioned name', () => {
    expect(CORE_CACHE).toMatch(/^market-core-v/);
  });

  it('buildCoreUrls returns API list endpoints', () => {
    const urls = buildCoreUrls();
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((u) => u.key && u.url)).toBe(true);
    // Should include core browsing endpoints
    const joined = urls.map((u) => u.url).join(' ');
    expect(joined).toMatch(/categories|products|stores/i);
  });

  it('getWarmupProgress returns a progress object', () => {
    const p = getWarmupProgress();
    expect(p).toBeTruthy();
    expect(typeof p).toBe('object');
  });

  it('onWarmupProgress registers and unregisters listener', () => {
    const listener = vi.fn();
    const off = onWarmupProgress(listener);
    expect(typeof off).toBe('function');
    off();
  });
});

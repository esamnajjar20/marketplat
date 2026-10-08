import { describe, expect, it } from 'vitest';
import { classifyStoragePressure, getBackgroundWarmingBudget } from '@/lib/offlineStoragePressure';
describe('cache storage pressure policy', () => {
  it('uses normal/warning/critical boundaries', () => {
    expect(classifyStoragePressure(0.79)).toBe('normal'); expect(classifyStoragePressure(0.8)).toBe('warning');
    expect(classifyStoragePressure(0.899)).toBe('warning'); expect(classifyStoragePressure(0.9)).toBe('critical');
  });
  it('treats unavailable estimates as unknown', () => { expect(classifyStoragePressure(null)).toBe('unknown'); expect(classifyStoragePressure(Number.NaN)).toBe('unknown'); });
  it('keeps unknown quota fail-open for warming', async () => { expect(await getBackgroundWarmingBudget()).toBe('full'); });
});

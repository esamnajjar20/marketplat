import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAverageRequestMs: vi.fn(() => null as number | null),
  getConsecutiveFailures: vi.fn(() => 0),
  getConnectionQuality: vi.fn(() => 'unknown' as const),
}));

vi.mock('@/lib/connectionQuality', () => mocks);

import { getAdaptivePageSize, getNetworkPolicy, getStablePageSize } from '@/lib/networkPolicy';

describe('networkPolicy', () => {
  beforeEach(() => {
    mocks.getAverageRequestMs.mockReturnValue(null);
    mocks.getConsecutiveFailures.mockReturnValue(0);
    mocks.getConnectionQuality.mockReturnValue('unknown');
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: undefined,
    });
  });

  it('treats 2g as very-slow and disables prefetch', () => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { effectiveType: '2g', downlink: 0.1, saveData: false },
    });

    const policy = getNetworkPolicy();

    expect(policy.tier).toBe('very-slow');
    expect(policy.allowPrefetch).toBe(false);
    expect(policy.queueConcurrency).toBe(1);
    expect(policy.maxPrefetchDistancePx).toBe(100);
    expect(policy.maxPrefetchConcurrency).toBe(0);
  });

  it('reduces upload pressure on very-slow networks', () => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { effectiveType: '2g', downlink: 0.1, saveData: false },
    });

    const policy = getNetworkPolicy();

    expect(policy.uploadConcurrency).toBe(1);
    expect(policy.uploadTimeoutMs).toBe(45_000);
    expect(policy.uploadRetryDelaysMs).toEqual([2500]);
  });

  it('treats 3g as slow and keeps background work constrained', () => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { effectiveType: '3g', downlink: 0.8, saveData: false },
    });

    const policy = getNetworkPolicy();

    expect(policy.tier).toBe('slow');
    expect(policy.allowPrefetch).toBe(false);
    expect(policy.pageSizeMultiplier).toBe(0.65);
  });

  it('treats 4g as fast when saveData is off', () => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { effectiveType: '4g', downlink: 10, saveData: false },
    });
    mocks.getConnectionQuality.mockReturnValue('fast');

    const policy = getNetworkPolicy();

    expect(policy.tier).toBe('fast');
    expect(policy.allowPrefetch).toBe(true);
    expect(policy.allowOriginalImages).toBe(true);
    expect(policy.maxPrefetchConcurrency).toBe(3);
  });

  it('respects saveData even on a fast connection', () => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { effectiveType: '4g', downlink: 10, saveData: true },
    });
    mocks.getConnectionQuality.mockReturnValue('fast');

    const policy = getNetworkPolicy();

    expect(policy.tier).toBe('fast');
    expect(policy.allowPrefetch).toBe(false);
    expect(policy.allowBackgroundWarming).toBe(false);
    expect(policy.allowOriginalImages).toBe(false);
    expect(policy.maxPrefetchConcurrency).toBe(0);
  });

  it('stops network work when offline', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    // getTier only returns 'offline' when connectionQuality reports offline
    mocks.getConnectionQuality.mockReturnValue('offline');

    const policy = getNetworkPolicy();

    expect(policy.tier).toBe('offline');
    expect(policy.allowPrefetch).toBe(false);
    expect(policy.allowBackgroundWarming).toBe(false);
    expect(policy.queueConcurrency).toBe(0);
  });

  it('scales list page size down on slow connections', () => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { effectiveType: '2g', downlink: 0.1, saveData: false },
    });

    expect(getAdaptivePageSize(12, getNetworkPolicy())).toBe(5);
  });

  it('keeps fast page size at the endpoint base', () => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { effectiveType: '4g', downlink: 10, saveData: false },
    });
    mocks.getConnectionQuality.mockReturnValue('fast');

    expect(getAdaptivePageSize(12, getNetworkPolicy())).toBe(12);
  });

  it('falls back to very-slow policy after repeated flaky failures', () => {
    mocks.getConnectionQuality.mockReturnValue('slow');
    mocks.getAverageRequestMs.mockReturnValue(4200);
    mocks.getConsecutiveFailures.mockReturnValue(4);

    const policy = getNetworkPolicy();

    expect(policy.tier).toBe('very-slow');
    expect(policy.allowPrefetch).toBe(false);
    expect(policy.allowBackgroundWarming).toBe(false);
    expect(policy.uploadConcurrency).toBe(1);
    expect(policy.requestTimeoutMs).toBe(25_000);
  });

  it('uses measured RTT when Network Information API is unavailable', () => {
    mocks.getAverageRequestMs.mockReturnValue(4500);

    const policy = getNetworkPolicy();

    expect(policy.tier).toBe('very-slow');
    expect(policy.requestTimeoutMs).toBe(25_000);
  });
  // REGRESSION (FIX OFFLINE-PAGESIZE-KEY-01): pageSize is part of the persisted
  // query key, and getAdaptivePageSize() returns 4 offline — so the offline key
  // never matched the key the data was saved under while online.
  describe('getStablePageSize', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it('matches getAdaptivePageSize while online and remembers the size', () => {
      Object.defineProperty(navigator, 'connection', {
        configurable: true,
        value: { effectiveType: '3g', downlink: 1, saveData: false },
      });
      const online = getStablePageSize(12, getNetworkPolicy());
      expect(online).toBe(getAdaptivePageSize(12, getNetworkPolicy()));
      expect(localStorage.getItem('marketplat:last-online-page-size:12')).toBe(String(online));
    });

    it('reuses the last online size while offline instead of the offline minimum', () => {
      Object.defineProperty(navigator, 'connection', {
        configurable: true,
        value: { effectiveType: '4g', downlink: 10, saveData: false },
      });
      mocks.getConnectionQuality.mockReturnValue('fast');
      const onlineSize = getStablePageSize(12, getNetworkPolicy());
      expect(onlineSize).toBe(12);

      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
      mocks.getConnectionQuality.mockReturnValue('offline');
      const offlinePolicy = getNetworkPolicy();
      expect(offlinePolicy.tier).toBe('offline');
      expect(getAdaptivePageSize(12, offlinePolicy)).toBe(4);
      expect(getStablePageSize(12, offlinePolicy)).toBe(12);
    });

    it('falls back to the adaptive size when nothing was remembered or storage is invalid', () => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
      mocks.getConnectionQuality.mockReturnValue('offline');
      const offlinePolicy = getNetworkPolicy();
      expect(getStablePageSize(12, offlinePolicy)).toBe(4);
      localStorage.setItem('marketplat:last-online-page-size:12', '999');
      expect(getStablePageSize(12, offlinePolicy)).toBe(4);
    });
  });
});

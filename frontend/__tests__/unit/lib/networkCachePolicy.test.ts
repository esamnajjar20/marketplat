import { describe, expect, it } from 'vitest';
import { calculateNetworkAwareStaleTime } from '@/lib/networkCachePolicy';

describe('network-aware public cache freshness', () => {
  it('keeps normal and fast network freshness unchanged', () => {
    expect(calculateNetworkAwareStaleTime(30_000, 'normal', false)).toBe(30_000);
    expect(calculateNetworkAwareStaleTime(30_000, 'fast', false)).toBe(30_000);
    expect(calculateNetworkAwareStaleTime(30_000, 'unknown', false)).toBe(30_000);
  });

  it('extends public list freshness moderately on slow connections', () => {
    expect(calculateNetworkAwareStaleTime(30_000, 'slow', false)).toBe(45_000);
  });

  it('extends public list freshness on very slow links or Save-Data', () => {
    expect(calculateNetworkAwareStaleTime(30_000, 'very-slow', false)).toBe(60_000);
    expect(calculateNetworkAwareStaleTime(30_000, 'normal', true)).toBe(60_000);
  });

  it('does not turn invalid or zero base freshness into a positive cache window', () => {
    expect(calculateNetworkAwareStaleTime(0, 'slow', false)).toBe(0);
    expect(calculateNetworkAwareStaleTime(-1, 'slow', false)).toBe(0);
  });
});

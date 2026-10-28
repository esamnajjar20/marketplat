import { afterEach, describe, expect, it, vi } from 'vitest';
import { estimateLocalUsageBytes, localGet, localRemove, localSet } from '@/lib/localStore';

describe('localStore', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('round-trips JSON values and returns fallback for malformed JSON', () => {
    expect(localSet('test-value', { id: 7 })).toBe(true);
    expect(localGet('test-value', { id: 0 })).toEqual({ id: 7 });
    localStorage.setItem('marketplat:broken-value', '{broken');
    expect(localGet('broken-value', 'fallback')).toBe('fallback');
  });

  it('rejects values that cannot be serialized', () => {
    expect(localSet('undefined-value', undefined)).toBe(false);
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(localSet('cyclic-value', cyclic)).toBe(false);
  });

  it('reports storage write failure rather than claiming persistence succeeded', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    });
    expect(localSet('quota-value', { ok: true })).toBe(false);
  });

  it('removes a value and estimates only namespaced localStore entries', () => {
    localSet('remove-me', 1);
    localStorage.setItem('unrelated-key', 'large unrelated value');
    expect(estimateLocalUsageBytes()).toBeGreaterThan(0);
    localRemove('remove-me');
    expect(localGet('remove-me', null)).toBeNull();
  });
});

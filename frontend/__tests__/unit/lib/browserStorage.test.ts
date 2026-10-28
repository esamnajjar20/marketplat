import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getBrowserStorage,
  safeStorageGet,
  safeStorageRemove,
  safeStorageSet,
  serializeStorageValue,
} from '@/lib/browserStorage';

describe('browserStorage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('reads, writes, and removes values through the shared adapter', () => {
    expect(safeStorageSet('offline-test', 'value')).toBe(true);
    expect(safeStorageGet('offline-test')).toBe('value');
    expect(safeStorageRemove('offline-test')).toBe(true);
    expect(safeStorageGet('offline-test')).toBeNull();
  });

  it('supports session storage without mixing it with local storage', () => {
    expect(safeStorageSet('offline-test', 'session', 'session')).toBe(true);
    expect(safeStorageGet('offline-test', 'session')).toBe('session');
    expect(safeStorageGet('offline-test')).toBeNull();
  });

  it('fails closed when browser storage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    });
    expect(safeStorageSet('offline-test', 'value')).toBe(false);
  });

  it('does not accept values JSON cannot serialize', () => {
    expect(serializeStorageValue(undefined)).toBeNull();
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(serializeStorageValue(cyclic)).toBeNull();
    expect(serializeStorageValue({ ok: true })).toBe('{"ok":true}');
  });

  it('returns the requested storage kind when available', () => {
    expect(getBrowserStorage('local')).toBe(localStorage);
    expect(getBrowserStorage('session')).toBe(sessionStorage);
  });
});

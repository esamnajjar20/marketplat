/**
 * __tests__/unit/lib/recentSearches.test.ts
 *
 * / P1: recentSearches was ~77% covered only via SearchBox.
 * Direct unit coverage for storage edge cases (quota, short queries,
 * dedupe, max items, corrupt JSON).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getRecentSearches,
  addRecentSearch,
  clearRecentSearches,
} from '@/lib/recentSearches';

const STORAGE_KEY = 'marketplat:recent-searches';

describe('recentSearches', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('getRecentSearches', () => {
    it('returns [] when nothing is stored', () => {
      expect(getRecentSearches()).toEqual([]);
    });

    it('returns stored string queries', () => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(['لابتوب', 'هاتف']));
      expect(getRecentSearches()).toEqual(['لابتوب', 'هاتف']);
    });

    it('filters out non-strings and empty/whitespace entries', () => {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(['ok', '', '  ', 42, null, 'هاتف']),
      );
      expect(getRecentSearches()).toEqual(['ok', 'هاتف']);
    });

    it('returns [] for corrupt JSON', () => {
      window.localStorage.setItem(STORAGE_KEY, '{not-json');
      expect(getRecentSearches()).toEqual([]);
    });

    it('returns [] when stored value is not an array', () => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ q: 'x' }));
      expect(getRecentSearches()).toEqual([]);
    });

    it('caps results at 8 items', () => {
      const many = Array.from({ length: 12 }, (_, i) => `q${i}`);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(many));
      expect(getRecentSearches()).toHaveLength(8);
    });
  });

  describe('addRecentSearch', () => {
    it('ignores queries shorter than 2 characters after trim', () => {
      addRecentSearch('a');
      addRecentSearch('  ');
      addRecentSearch('');
      expect(getRecentSearches()).toEqual([]);
    });

    it('prepends a new query and trims whitespace', () => {
      addRecentSearch('  لابتوب  ');
      expect(getRecentSearches()).toEqual(['لابتوب']);
    });

    it('dedupes case-insensitively and moves the match to the front', () => {
      addRecentSearch('Phone');
      addRecentSearch('لابتوب');
      addRecentSearch('phone');
      expect(getRecentSearches()[0]).toBe('phone');
      expect(getRecentSearches().filter((q) => q.toLowerCase() === 'phone')).toHaveLength(1);
    });

    it('keeps at most 8 entries', () => {
      for (let i = 0; i < 12; i++) addRecentSearch(`query-${i}`);
      expect(getRecentSearches()).toHaveLength(8);
      expect(getRecentSearches()[0]).toBe('query-11');
    });

    it('swallows quota / storage errors', () => {
      const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      expect(() => addRecentSearch('لابتوب')).not.toThrow();
      spy.mockRestore();
    });
  });

  describe('clearRecentSearches', () => {
    it('removes the storage key', () => {
      addRecentSearch('لابتوب');
      clearRecentSearches();
      expect(getRecentSearches()).toEqual([]);
      expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('swallows removeItem errors', () => {
      const spy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('denied');
      });
      expect(() => clearRecentSearches()).not.toThrow();
      spy.mockRestore();
    });
  });
});

/**
 * __tests__/unit/lib/storeStatus.test.ts
 *
 * FIX UX-13: MyStoreCard and AdminStoresTable each defined a local
 * status→color map for the same StoreStatus field, coincidentally
 * identical in value but with nothing tying them together. This locks
 * in the single shared mapping.
 */
import { describe, it, expect } from 'vitest';
import { STORE_STATUS_LABELS, STORE_STATUS_VARIANT } from '@/lib/storeStatus';
import type { StoreStatus } from '@/types/store.types';

const ALL_STATUSES: StoreStatus[] = ['PENDING', 'ACTIVE', 'BLOCKED'];

describe('storeStatus', () => {
  it('has a non-empty Arabic label for every status', () => {
    for (const status of ALL_STATUSES) {
      expect(STORE_STATUS_LABELS[status]).toBeTruthy();
      expect(typeof STORE_STATUS_LABELS[status]).toBe('string');
    }
  });

  it('has a badge variant for every status', () => {
    for (const status of ALL_STATUSES) {
      expect(STORE_STATUS_VARIANT[status]).toBeTruthy();
    }
  });

  it('marks ACTIVE as success', () => {
    expect(STORE_STATUS_VARIANT.ACTIVE).toBe('success');
  });

  it('marks BLOCKED as destructive', () => {
    expect(STORE_STATUS_VARIANT.BLOCKED).toBe('destructive');
  });

  it('marks PENDING as warning (needs review, not yet resolved)', () => {
    expect(STORE_STATUS_VARIANT.PENDING).toBe('warning');
  });

  it('only defines the three known statuses (no stale/extra keys)', () => {
    expect(Object.keys(STORE_STATUS_LABELS).sort()).toEqual([...ALL_STATUSES].sort());
    expect(Object.keys(STORE_STATUS_VARIANT).sort()).toEqual([...ALL_STATUSES].sort());
  });
});

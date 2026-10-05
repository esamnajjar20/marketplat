/**
 * __tests__/unit/lib/adStatus.test.ts
 *
 * FIX UX-13: MyAdsList/AdminAdsTable/AdDetail each hand-rolled their
 * own status→color mapping for the same AdStatus field and disagreed
 * with each other. This locks in the single shared mapping so any
 * future drift shows up here instead of as a silent inconsistency
 * between pages.
 */
import { describe, it, expect } from 'vitest';
import { AD_STATUS_VARIANT } from '@/lib/adStatus';
import { STATUS_LABELS } from '@/lib/constants';
import type { AdStatus } from '@/types/ad.types';

const ALL_STATUSES: AdStatus[] = ['ACTIVE', 'SOLD', 'DELETED', 'EXPIRED'];

describe('adStatus', () => {
  it('has a badge variant for every status', () => {
    for (const status of ALL_STATUSES) {
      expect(AD_STATUS_VARIANT[status]).toBeTruthy();
    }
  });

  it('has a non-empty Arabic label for every status (via shared STATUS_LABELS)', () => {
    for (const status of ALL_STATUSES) {
      expect(STATUS_LABELS[status]).toBeTruthy();
      expect(typeof STATUS_LABELS[status]).toBe('string');
    }
  });

  it('marks ACTIVE as success (healthy, normal state)', () => {
    expect(AD_STATUS_VARIANT.ACTIVE).toBe('success');
  });

  it('marks DELETED as destructive', () => {
    expect(AD_STATUS_VARIANT.DELETED).toBe('destructive');
  });

  it('marks SOLD as secondary (neutral, not an error)', () => {
    expect(AD_STATUS_VARIANT.SOLD).toBe('secondary');
  });

  it('marks EXPIRED as secondary (closed but recoverable)', () => {
    expect(AD_STATUS_VARIANT.EXPIRED).toBe('secondary');
  });

  it('labels EXPIRED as منتهي', () => {
    expect(STATUS_LABELS.EXPIRED).toBe('منتهي');
  });

  it('only defines the known statuses (no stale/extra keys)', () => {
    expect(Object.keys(AD_STATUS_VARIANT).sort()).toEqual([...ALL_STATUSES].sort());
  });
});

/**
 * __tests__/unit/lib/serviceAvailability.test.ts
 *
 * Availability labels/colours used to be copied into five components with
 * three different colour schemes. This locks the shared maps: every status
 * is covered in every map and only semantic tokens are used.
 */
import { describe, expect, it } from 'vitest';
import {
  AVAILABILITY_DOT,
  AVAILABILITY_LABEL,
  AVAILABILITY_PILL,
  AVAILABILITY_TEXT,
} from '@/lib/serviceAvailability';

const STATUSES = ['AVAILABLE', 'BUSY', 'UNAVAILABLE'] as const;

describe('serviceAvailability', () => {
  it.each(STATUSES)('%s is defined in every map', (status) => {
    expect(AVAILABILITY_LABEL[status]).toBeTruthy();
    expect(AVAILABILITY_DOT[status]).toBeTruthy();
    expect(AVAILABILITY_TEXT[status]).toBeTruthy();
    expect(AVAILABILITY_PILL[status]).toBeTruthy();
  });

  it('keeps the Arabic labels', () => {
    expect(AVAILABILITY_LABEL).toEqual({
      AVAILABLE: 'متاح الآن',
      BUSY: 'مشغول',
      UNAVAILABLE: 'غير متاح',
    });
  });

  it('uses semantic tokens only (no hard-coded palette or legacy vars)', () => {
    const all = [
      ...Object.values(AVAILABILITY_DOT),
      ...Object.values(AVAILABILITY_TEXT),
      ...Object.values(AVAILABILITY_PILL),
    ].join(' ');
    expect(all).not.toMatch(/(amber|emerald|green|red|yellow)-\d/);
    expect(all).not.toMatch(/legacy-/);
  });
});

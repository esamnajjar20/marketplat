/**
 * Pure badge computation (Phase 3 / P2).
 * No I/O — thresholds from badges.constants.ts.
 */
import { BADGE_THRESHOLDS } from '../../src/modules/badges/badges.constants';
import {
  computeBadges,
  computeProviderBadges,
  BadgeInput,
  ProviderBadgeInput,
} from '../../src/modules/badges/badges.types';

const baseStore = (overrides: Partial<BadgeInput> = {}): BadgeInput => ({
  createdAt: new Date('2020-01-01T00:00:00Z'),
  views: 0,
  followerCount: 0,
  sellerVerified: false,
  avgRating: null,
  reviewCount: 0,
  ...overrides,
});

const baseProvider = (overrides: Partial<ProviderBadgeInput> = {}): ProviderBadgeInput => ({
  createdAt: new Date('2020-01-01T00:00:00Z'),
  totalViews: 0,
  completedRequestsCount: 0,
  sellerVerified: false,
  avgRating: null,
  reviewCount: 0,
  ...overrides,
});

describe('computeBadges (store)', () => {
  const now = new Date('2024-06-15T12:00:00Z');

  it('returns no badges for a plain inactive-looking store', () => {
    expect(computeBadges(baseStore(), now)).toEqual([]);
  });

  it('adds VERIFIED when sellerVerified is true', () => {
    const badges = computeBadges(baseStore({ sellerVerified: true }), now);
    expect(badges.map((b) => b.type)).toContain('VERIFIED');
    expect(badges.find((b) => b.type === 'VERIFIED')?.label).toBe('متجر موثّق');
  });

  it('adds HIGHLY_RATED only when avg and review count both meet thresholds', () => {
    expect(
      computeBadges(
        baseStore({
          avgRating: BADGE_THRESHOLDS.HIGHLY_RATED_MIN_AVG,
          reviewCount: BADGE_THRESHOLDS.HIGHLY_RATED_MIN_REVIEWS - 1,
        }),
        now,
      ),
    ).toEqual([]);

    const badges = computeBadges(
      baseStore({
        avgRating: BADGE_THRESHOLDS.HIGHLY_RATED_MIN_AVG,
        reviewCount: BADGE_THRESHOLDS.HIGHLY_RATED_MIN_REVIEWS,
      }),
      now,
    );
    expect(badges.map((b) => b.type)).toContain('HIGHLY_RATED');
  });

  it('adds POPULAR from views OR followers', () => {
    expect(
      computeBadges(baseStore({ views: BADGE_THRESHOLDS.POPULAR_MIN_VIEWS }), now).map(
        (b) => b.type,
      ),
    ).toContain('POPULAR');

    expect(
      computeBadges(
        baseStore({ followerCount: BADGE_THRESHOLDS.POPULAR_MIN_FOLLOWERS }),
        now,
      ).map((b) => b.type),
    ).toContain('POPULAR');
  });

  it('adds NEW_STORE when created within the age window', () => {
    const recent = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    expect(computeBadges(baseStore({ createdAt: recent }), now).map((b) => b.type)).toContain(
      'NEW_STORE',
    );

    const old = new Date(
      now.getTime() - (BADGE_THRESHOLDS.NEW_STORE_MAX_AGE_DAYS + 1) * 24 * 60 * 60 * 1000,
    );
    expect(computeBadges(baseStore({ createdAt: old }), now).map((b) => b.type)).not.toContain(
      'NEW_STORE',
    );
  });

  it('can stack multiple badges', () => {
    const types = computeBadges(
      baseStore({
        sellerVerified: true,
        views: BADGE_THRESHOLDS.POPULAR_MIN_VIEWS,
        avgRating: 4.8,
        reviewCount: 25,
        createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      }),
      now,
    ).map((b) => b.type);

    expect(types).toEqual(
      expect.arrayContaining(['VERIFIED', 'HIGHLY_RATED', 'POPULAR', 'NEW_STORE']),
    );
  });
});

describe('computeProviderBadges', () => {
  const now = new Date('2024-06-15T12:00:00Z');

  it('returns empty for a brand-new unadorned provider outside the new window', () => {
    expect(computeProviderBadges(baseProvider(), now)).toEqual([]);
  });

  it('adds POPULAR from totalViews OR completedRequestsCount', () => {
    expect(
      computeProviderBadges(
        baseProvider({ totalViews: BADGE_THRESHOLDS.POPULAR_MIN_VIEWS }),
        now,
      ).map((b) => b.type),
    ).toContain('POPULAR');

    expect(
      computeProviderBadges(
        baseProvider({ completedRequestsCount: BADGE_THRESHOLDS.POPULAR_MIN_FOLLOWERS }),
        now,
      ).map((b) => b.type),
    ).toContain('POPULAR');
  });

  it('uses NEW_PROVIDER (not NEW_STORE) for young providers', () => {
    const recent = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const badges = computeProviderBadges(baseProvider({ createdAt: recent }), now);
    expect(badges.map((b) => b.type)).toContain('NEW_PROVIDER');
    expect(badges.map((b) => b.type)).not.toContain('NEW_STORE');
    expect(badges.find((b) => b.type === 'NEW_PROVIDER')?.label).toBe('مقدم خدمة جديد');
  });

  it('adds VERIFIED and HIGHLY_RATED with the same thresholds as stores', () => {
    const badges = computeProviderBadges(
      baseProvider({
        sellerVerified: true,
        avgRating: 4.5,
        reviewCount: 20,
      }),
      now,
    );
    expect(badges.map((b) => b.type)).toEqual(
      expect.arrayContaining(['VERIFIED', 'HIGHLY_RATED']),
    );
  });
});

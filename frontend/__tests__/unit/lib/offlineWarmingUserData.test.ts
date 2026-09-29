/**
 * __tests__/unit/lib/offlineWarmingUserData.test.ts
 *
 * FIX WARM-USERDATA-TTL-01 — pure freshness selection.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/constants', () => ({ API_BASE_URL: 'https://api.example.com' }));
vi.mock('@/store/auth.store', () => ({
  useAuthStore: { getState: () => ({ accessToken: null, isAuthenticated: false, user: null }) },
}));
vi.mock('@/lib/offlineRouteShells', () => ({ isWarmingCancelled: () => false }));
vi.mock('@/lib/offlineWarmingPlanner', () => ({
  getWarmingPlan: () => ({ tier: 'core' }),
  isWarmingDisabled: () => false,
}));

import {
  pickDueEndpoints,
  USER_DATA_ENDPOINTS,
  USER_DATA_TTL_MS,
} from '@/lib/offlineWarmingUserData';

const NOW = 1_000_000_000_000;
const allPresent = () => true;

function freshMapFor(ageMs: number, status = 200) {
  return Object.fromEntries(
    USER_DATA_ENDPOINTS.map(({ path }) => [path, { t: NOW - ageMs, s: status }]),
  );
}

describe('pickDueEndpoints', () => {
  it('everything is due on a first run (no markers)', () => {
    const due = pickDueEndpoints({}, { now: NOW, force: false, critical: false, hasCachedBody: allPresent });
    expect(due).toHaveLength(USER_DATA_ENDPOINTS.length);
  });

  it('nothing is due when every marker is fresh and its body is cached', () => {
    const due = pickDueEndpoints(freshMapFor(1000), {
      now: NOW, force: false, critical: false, hasCachedBody: allPresent,
    });
    expect(due).toHaveLength(0);
  });

  it('volatile endpoints expire before stable ones', () => {
    const age = USER_DATA_TTL_MS.volatile + 1;
    const due = pickDueEndpoints(freshMapFor(age), {
      now: NOW, force: false, critical: false, hasCachedBody: allPresent,
    });
    expect(due.length).toBeGreaterThan(0);
    expect(due.every((d) => d.group === 'volatile')).toBe(true);
    expect(due.some((d) => d.path.startsWith('/notifications'))).toBe(true);
  });

  it('a fresh marker whose body vanished (logout wiped the cache) is due again', () => {
    const due = pickDueEndpoints(freshMapFor(1000), {
      now: NOW, force: false, critical: false, hasCachedBody: (p) => p !== '/users/me',
    });
    expect(due.map((d) => d.path)).toEqual(['/users/me']);
  });

  it('a remembered 404 needs no cached body and is not re-fetched while fresh', () => {
    const due = pickDueEndpoints(freshMapFor(1000, 404), {
      now: NOW, force: false, critical: false, hasCachedBody: () => false,
    });
    expect(due).toHaveLength(0);
  });

  it('a remembered 404 re-checks on the SHORT window (user may create a store any time)', () => {
    const due = pickDueEndpoints(freshMapFor(USER_DATA_TTL_MS.volatile + 1, 404), {
      now: NOW, force: false, critical: false, hasCachedBody: () => false,
    });
    expect(due).toHaveLength(USER_DATA_ENDPOINTS.length);
  });

  it('critical (very slow) links triple the windows', () => {
    const age = USER_DATA_TTL_MS.volatile * 2;
    const normal = pickDueEndpoints(freshMapFor(age), {
      now: NOW, force: false, critical: false, hasCachedBody: allPresent,
    });
    const critical = pickDueEndpoints(freshMapFor(age), {
      now: NOW, force: false, critical: true, hasCachedBody: allPresent,
    });
    expect(normal.length).toBeGreaterThan(0);
    expect(critical).toHaveLength(0);
  });

  it('force ignores every freshness window', () => {
    const due = pickDueEndpoints(freshMapFor(1), {
      now: NOW, force: true, critical: false, hasCachedBody: allPresent,
    });
    expect(due).toHaveLength(USER_DATA_ENDPOINTS.length);
  });
});

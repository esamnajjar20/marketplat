/**
 * __tests__/unit/lib/offlineWarmingUserData.test.ts
 *
 * pure freshness selection.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/constants', () => ({ API_BASE_URL: 'https://api.example.com' }));
vi.mock('@/store/auth.store', () => ({
  useAuthStore: { getState: () => ({ accessToken: null, isAuthenticated: false, user: null }) },
  selectHasAccessToken: (s: any) => Boolean(s?.accessToken ?? s?.hasAccessToken),
  selectHydratedUser: (s: any) => (s?.isHydrated ? s.user : null),
  selectHydratedIsAuthenticated: (s: any) => (s?.isHydrated ? Boolean(s?.isAuthenticated ?? s?.user) : false),
  selectIsAuthResolving: (s: any) => Boolean(s?.isAuthResolving),
  selectIsHydrated: (s: any) => Boolean(s?.isHydrated),
  selectAccessToken: (s: any) => s?.accessToken,
  selectUser: (s: any) => s?.user,
  selectIsAuthenticated: (s: any) => Boolean(s?.isAuthenticated ?? s?.user),
  selectIsAdmin: (s: any) => Boolean(s?.isAdmin ?? (s?.user?.role === 'ADMIN' || s?.user?.role === 'MODERATOR')),
}));
vi.mock('@/lib/offlineRouteShells', () => ({ isWarmingCancelled: () => false }));
vi.mock('@/lib/offlineWarmingPlanner', () => ({
  getWarmingPlan: () => ({ tier: 'core' }),
  isWarmingDisabled: () => false,
}));

import {
  buildWarmedSnapshotHeaders,
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

  it('uses a bounded 30-minute freshness window for private business and sales snapshots', () => {
    const sales = USER_DATA_ENDPOINTS.find((entry) => entry.path === '/sales?page=1&limit=12');
    expect(sales?.group).toBe('medium');
    const due = pickDueEndpoints(freshMapFor(USER_DATA_TTL_MS.medium + 1), {
      now: NOW, force: false, critical: false, hasCachedBody: allPresent,
    });
    expect(due.some((entry) => entry.path === '/sales?page=1&limit=12')).toBe(true);
  });

  it('force ignores every freshness window', () => {
    const due = pickDueEndpoints(freshMapFor(1), {
      now: NOW, force: true, critical: false, hasCachedBody: allPresent,
    });
    expect(due).toHaveLength(USER_DATA_ENDPOINTS.length);
  });
});

describe('buildWarmedSnapshotHeaders', () => {
  const backendHeaders = () => new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'private, no-cache, no-transform',
    Vary: 'Authorization, Cookie',
    Pragma: 'no-cache',
    Expires: '0',
  });

  it('drops validation directives so the SW will serve the snapshot offline', () => {
    const h = buildWarmedSnapshotHeaders(backendHeaders(), 123);
    expect(h.get('Cache-Control')).toBe('private');
    expect(h.has('Vary')).toBe(false);
    expect(h.has('Pragma')).toBe(false);
    expect(h.has('Expires')).toBe(false);
  });

  it('also normalises no-store responses (CACHE.NONE endpoints)', () => {
    const h = buildWarmedSnapshotHeaders(new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }), 1);
    expect(h.get('Cache-Control')).toBe('private');
  });

  it('keeps content-type and stamps cache time + warmed marker', () => {
    const h = buildWarmedSnapshotHeaders(backendHeaders(), 456);
    expect(h.get('Content-Type')).toBe('application/json');
    expect(h.get('X-SW-Cached-At')).toBe('456');
    expect(h.get('X-SW-Warmed')).toBe('1');
  });

  it('does not mutate the source headers', () => {
    const src = backendHeaders();
    buildWarmedSnapshotHeaders(src, 1);
    expect(src.get('Cache-Control')).toBe('private, no-cache, no-transform');
  });
});

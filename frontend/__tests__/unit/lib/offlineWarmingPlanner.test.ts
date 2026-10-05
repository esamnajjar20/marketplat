import { describe, it, expect, vi, beforeEach } from 'vitest';

let mode: 'off' | 'fast' | 'full' = 'fast';
vi.mock('@/lib/warmingPreferences', () => ({ getWarmingMode: () => mode }));
vi.mock('@/lib/connectionQuality', () => ({ getAverageRequestMs: () => null, shouldPauseWarming: () => false }));
vi.mock('../../../lib/warmingPreferences', () => ({ getWarmingMode: () => mode }));
vi.mock('../../../lib/connectionQuality', () => ({ getAverageRequestMs: () => null, shouldPauseWarming: () => false }));

import {
  getWarmingPlan,
  selectRoutesByPlan,
  ROUTE_BUDGETS,
  PINNED_OFFLINE_ROUTES,
} from '../../../lib/offlineWarmingPlanner';
import { CORE_ROUTES, PERSONAL_SHELL_ROUTES_ESSENTIAL } from '../../../lib/offlineRouteShells';

describe('offline warming route budgets (FIX WARM-LIGHT-01)', () => {
  beforeEach(() => {
    mode = 'fast';
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: true },
      configurable: true,
    });
  });

  it("'fast' warms a bounded number of routes per list, not the whole app", () => {
    const plan = getWarmingPlan();
    const pub = selectRoutesByPlan(plan, [...CORE_ROUTES], 'public');
    const per = selectRoutesByPlan(plan, [...PERSONAL_SHELL_ROUTES_ESSENTIAL], 'personal');
    // WARM-PINNED-OFFLINE-01: pinned offline/sync/storage routes are extra to the budget.
    const pinnedPub = PINNED_OFFLINE_ROUTES.filter((r) => CORE_ROUTES.includes(r as never)).length;
    const pinnedPer = PINNED_OFFLINE_ROUTES.filter((r) =>
      PERSONAL_SHELL_ROUTES_ESSENTIAL.includes(r as never),
    ).length;
    expect(pub).toHaveLength(ROUTE_BUDGETS.core.public + pinnedPub);
    expect(per).toHaveLength(ROUTE_BUDGETS.core.personal + pinnedPer);
    expect(pub.length + per.length).toBeLessThanOrEqual(30);
    // essentials survive the cut
    expect(pub).toEqual(expect.arrayContaining(['/offline', '/', '/ads', '/shared']));
    expect(per).toEqual(expect.arrayContaining(['/messages', '/ads/create']));
  });

  it("the merged offline hub ('/offline') is always selected, first, on every tier", () => {
    for (const m of ['fast', 'full'] as const) {
      mode = m;
      for (const conn of [undefined, { effectiveType: '2g' }, { effectiveType: '3g' }]) {
        Object.defineProperty(globalThis, 'navigator', {
          value: { onLine: true, connection: conn },
          configurable: true,
        });
        const pub = selectRoutesByPlan(getWarmingPlan(), [...CORE_ROUTES], 'public');
        expect(pub[0]).toBe('/offline');
      }
    }
  });

  it('routes that now redirect into the hub are never warmed (they would fail atomically)', () => {
    const redirecting = ['/saved-ads', '/downloads', '/settings/sync', '/settings/storage', '/settings/offline', '/settings/drafts'];
    for (const r of redirecting) {
      expect(CORE_ROUTES).not.toContain(r);
      expect(PERSONAL_SHELL_ROUTES_ESSENTIAL).not.toContain(r);
    }
  });

  it("'full' (explicit user choice) still warms every known route", () => {
    mode = 'full';
    const plan = getWarmingPlan();
    expect(selectRoutesByPlan(plan, [...CORE_ROUTES], 'public')).toHaveLength(CORE_ROUTES.length);
    expect(selectRoutesByPlan(plan, [...PERSONAL_SHELL_ROUTES_ESSENTIAL], 'personal')).toHaveLength(
      PERSONAL_SHELL_ROUTES_ESSENTIAL.length,
    );
  });

  it("'off' selects nothing", () => {
    mode = 'off';
    expect(selectRoutesByPlan(getWarmingPlan(), [...CORE_ROUTES])).toEqual([]);
  });

  it("on a normal link, the plan follows the user's mode (4g / no connection API)", () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: true, connection: { effectiveType: '4g', downlink: 10 } },
      configurable: true,
    });
    mode = 'fast';
    expect(getWarmingPlan()).toMatchObject({ tier: 'core', reason: 'user-fast', concurrency: 1 });
    mode = 'full';
    expect(getWarmingPlan()).toMatchObject({ tier: 'full', reason: 'user-full' });
  });

  // FIX WARM-ADAPTIVE-01: 2g / slow-2g / very low downlink throttle to critical
  it("2g throttles 'fast' but keeps explicit 'full' scope", () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: true, connection: { effectiveType: '2g', downlink: 0.05 } },
      configurable: true,
    });
    mode = 'fast';
    expect(getWarmingPlan()).toMatchObject({
      tier: 'critical',
      reason: 'user-fast-2g',
      concurrency: 1,
      minRoutes: ROUTE_BUDGETS.critical.public + ROUTE_BUDGETS.critical.personal,
    });
    mode = 'full';
    expect(getWarmingPlan()).toMatchObject({
      tier: 'full',
      reason: 'user-full-2g-paced',
      concurrency: 1,
      interRouteDelayMs: 2500,
      requestTimeoutMs: 25_000,
    });
  });

  it("slow-2g and downlink < 0.4 also force critical", () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: true, connection: { effectiveType: 'slow-2g' } },
      configurable: true,
    });
    mode = 'fast';
    expect(getWarmingPlan().tier).toBe('critical');

    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: true, connection: { effectiveType: '3g', downlink: 0.3 } },
      configurable: true,
    });
    expect(getWarmingPlan().tier).toBe('critical');
  });

  it('saveData and being offline still disable warming, whatever the mode', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: true, connection: { saveData: true } },
      configurable: true,
    });
    mode = 'full';
    expect(getWarmingPlan().tier).toBe('none');
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: false },
      configurable: true,
    });
    expect(getWarmingPlan().tier).toBe('none');
  });
});

  it("3g throttles 'fast' to critical while preserving full scope (FIX WARM-ADAPTIVE-3G-01)", () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: true, connection: { effectiveType: '3g', downlink: 0.8 } },
      configurable: true,
    });
    mode = 'fast';
    expect(getWarmingPlan()).toMatchObject({ tier: 'critical', reason: 'user-fast-3g' });
    mode = 'full';
    expect(getWarmingPlan()).toMatchObject({ tier: 'full', reason: 'user-full-3g-paced', concurrency: 1 });
  });

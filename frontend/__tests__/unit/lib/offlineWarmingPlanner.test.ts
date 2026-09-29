import { describe, it, expect, vi, beforeEach } from 'vitest';

let mode: 'off' | 'fast' | 'full' = 'fast';
vi.mock('@/lib/warmingPreferences', () => ({ getWarmingMode: () => mode }));
vi.mock('@/lib/connectionQuality', () => ({ getAverageRequestMs: () => null }));
vi.mock('../../../lib/warmingPreferences', () => ({ getWarmingMode: () => mode }));
vi.mock('../../../lib/connectionQuality', () => ({ getAverageRequestMs: () => null }));

import {
  getWarmingPlan,
  selectRoutesByPlan,
  ROUTE_BUDGETS,
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
    expect(pub).toHaveLength(ROUTE_BUDGETS.core.public);
    expect(per).toHaveLength(ROUTE_BUDGETS.core.personal);
    expect(pub.length + per.length).toBeLessThanOrEqual(20);
    // essentials survive the cut
    expect(pub).toEqual(expect.arrayContaining(['/offline', '/', '/ads', '/shared']));
    expect(per).toEqual(expect.arrayContaining(['/messages', '/ads/create']));
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

  it("the plan follows the user's mode, not the measured/reported network (FIX WARM-DEADCODE-01)", () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: true, connection: { effectiveType: '2g', downlink: 0.05 } },
      configurable: true,
    });
    mode = 'fast';
    expect(getWarmingPlan()).toMatchObject({ tier: 'core', reason: 'user-fast', concurrency: 1 });
    mode = 'full';
    expect(getWarmingPlan()).toMatchObject({ tier: 'full', reason: 'user-full' });
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

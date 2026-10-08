import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getNetworkPolicy: vi.fn(),
  getWarmingMode: vi.fn(),
  getWarmingPlan: vi.fn(),
  getWarmingBudget: vi.fn(),
  core: vi.fn(),
  publicRoutes: vi.fn(),
  personalRoutes: vi.fn(),
  userData: vi.fn(),
}));

vi.mock('../../../lib/networkPolicy', () => ({ getNetworkPolicy: mocks.getNetworkPolicy }));
vi.mock('../../../lib/warmingPreferences', () => ({ getWarmingMode: mocks.getWarmingMode }));
vi.mock('../../../lib/offlineWarmingPlanner', () => ({ getWarmingPlan: mocks.getWarmingPlan }));
vi.mock('../../../lib/warmingBudget', () => ({ getWarmingBudget: mocks.getWarmingBudget }));
vi.mock('../../../lib/offlineCoreBundle', () => ({ warmCoreBundle: mocks.core }));
vi.mock('../../../lib/offlineRouteShells', () => ({
  warmRouteShellsAtomic: mocks.publicRoutes,
  warmPersonalShellsAtomic: mocks.personalRoutes,
}));
vi.mock('../../../lib/offlineWarmingUserData', () => ({ warmUserData: mocks.userData }));

import { runWarmingEngine } from '../../../lib/warmingEngine';

describe('warming engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getNetworkPolicy.mockReturnValue({ tier: 'fast', saveData: false, consecutiveFailures: 0 });
    mocks.getWarmingMode.mockReturnValue('fast');
    mocks.getWarmingPlan.mockReturnValue({ tier: 'core' });
    mocks.getWarmingBudget.mockReturnValue({
      maxRequests: 40,
      maxBytes: 5_000_000,
      maxDurationMs: 60_000,
      maxConcurrency: 2,
      maxRouteCount: 20,
      maxPersonalRouteCount: 6,
      allowImages: false,
    });
    mocks.core.mockResolvedValue(undefined);
    mocks.publicRoutes.mockResolvedValue(undefined);
    mocks.personalRoutes.mockResolvedValue(undefined);
    mocks.userData.mockResolvedValue(undefined);
  });

  it('runs jobs by registry priority and includes authenticated workloads', async () => {
    const order: string[] = [];
    mocks.core.mockImplementation(async () => order.push('core'));
    mocks.publicRoutes.mockImplementation(async () => order.push('public'));
    mocks.personalRoutes.mockImplementation(async () => order.push('personal'));
    mocks.userData.mockImplementation(async () => order.push('user'));

    const result = await runWarmingEngine({ authenticated: true });

    expect(order).toEqual(['core', 'public', 'personal', 'user']);
    expect(result.completed).toEqual(['core-data', 'public-routes', 'personal-routes', 'user-data']);
    expect(result.skipped).toEqual([]);
  });

  it('does not spend budget on lower-priority jobs that do not fit', async () => {
    mocks.getWarmingBudget.mockReturnValue({
      maxRequests: 16,
      maxBytes: 2_000_000,
      maxDurationMs: 30_000,
      maxConcurrency: 1,
      maxRouteCount: 8,
      maxPersonalRouteCount: 2,
      allowImages: false,
    });

    const result = await runWarmingEngine({ authenticated: true });

    expect(result.completed).toEqual(['core-data', 'public-routes']);
    expect(result.skipped).toEqual(['personal-routes', 'user-data']);
    expect(mocks.personalRoutes).not.toHaveBeenCalled();
    expect(mocks.userData).not.toHaveBeenCalled();
  });

  it('does not run on a disabled plan', async () => {
    mocks.getWarmingPlan.mockReturnValue({ tier: 'none' });
    mocks.getWarmingBudget.mockReturnValue({
      maxRequests: 0,
      maxBytes: 0,
      maxDurationMs: 0,
      maxConcurrency: 0,
      maxRouteCount: 0,
      maxPersonalRouteCount: 0,
      allowImages: false,
    });

    const result = await runWarmingEngine({ authenticated: true });

    expect(result.ran).toBe(false);
    expect(mocks.core).not.toHaveBeenCalled();
  });
});

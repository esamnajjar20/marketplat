import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  runtimeUsage: { requests: 0, bytes: 0 },
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
vi.mock('../../../lib/warmingRegistry', () => ({
  getWarmingJob: (id: string) => ({
    id,
    // Higher priority number = run first (matches WARMING_REGISTRY)
    priority: id === 'core-data' ? 100 : id === 'public-routes' ? 90 : id === 'personal-routes' ? 80 : 70,
    requiresAuth: id === 'personal-routes' || id === 'user-data',
    order: id === 'core-data' ? 0 : id === 'public-routes' ? 1 : id === 'personal-routes' ? 2 : 3,
    cost: { requests: 1, bytes: 10_000, durationMs: 1_000 },
  }),
}));
vi.mock('../../../lib/offlineStoragePressure', () => ({
  shouldPauseBackgroundWarming: vi.fn().mockResolvedValue(false),
  getBackgroundWarmingBudget: vi.fn().mockResolvedValue('full'),
}));
vi.mock('../../../lib/warmingRuntimeBudget', () => ({
  beginWarmingRuntimeBudget: () => () => undefined,
  getWarmingRuntimeBudgetState: () => ({ ...mocks.runtimeUsage }),
  noteWarmingRuntimeUsage: vi.fn(),
}));
vi.mock('../../../lib/warmingTelemetry', () => ({
  recordWarmingJob: vi.fn(),
}));

import { runWarmingEngine } from '../../../lib/warmingEngine';

describe('warming engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runtimeUsage.requests = 0;
    mocks.runtimeUsage.bytes = 0;
    mocks.getNetworkPolicy.mockReturnValue({
      tier: 'fast',
      saveData: false,
      consecutiveFailures: 0,
      allowBackgroundWarming: true,
    });
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
    // cost.requests is 1 per job in the mock; budget of 2 admits only the
    // two highest-priority jobs (core-data + public-routes).
    mocks.getWarmingBudget.mockReturnValue({
      maxRequests: 2,
      maxBytes: 2_000_000,
      maxDurationMs: 30_000,
      maxConcurrency: 1,
      maxRouteCount: 8,
      maxPersonalRouteCount: 2,
      allowImages: false,
    });

    // Model the two admitted jobs consuming their estimated runtime budget.
    mocks.core.mockImplementation(async () => { mocks.runtimeUsage.requests += 1; mocks.runtimeUsage.bytes += 10_000; });
    mocks.publicRoutes.mockImplementation(async () => { mocks.runtimeUsage.requests += 1; mocks.runtimeUsage.bytes += 10_000; });
    mocks.personalRoutes.mockImplementation(async () => { mocks.runtimeUsage.requests += 1; mocks.runtimeUsage.bytes += 10_000; });
    mocks.userData.mockImplementation(async () => { mocks.runtimeUsage.requests += 1; mocks.runtimeUsage.bytes += 10_000; });

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

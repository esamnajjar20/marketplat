import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  runtimeUsage: { requests: 0, bytes: 0 },
  getNetworkPolicy: vi.fn(),
  getWarmingMode: vi.fn(),
  getWarmingPlan: vi.fn(),
  getWarmingBudget: vi.fn(),
  publicRoutes: vi.fn(),
  personalRoutes: vi.fn(),
}));

vi.mock('../../../lib/networkPolicy', () => ({ getNetworkPolicy: mocks.getNetworkPolicy }));
vi.mock('../../../lib/warmingPreferences', () => ({ getWarmingMode: mocks.getWarmingMode }));
vi.mock('../../../lib/offlineWarmingPlanner', () => ({ getWarmingPlan: mocks.getWarmingPlan }));
vi.mock('../../../lib/warmingBudget', () => ({ getWarmingBudget: mocks.getWarmingBudget }));
vi.mock('../../../lib/offlineRouteShells', () => ({
  warmRouteShellsAtomic: mocks.publicRoutes,
  warmPersonalShellsAtomic: mocks.personalRoutes,
}));
vi.mock('../../../lib/warmingRegistry', () => ({
  getWarmingJob: (id: string) => ({
    id,
    // Higher priority number = run first (matches WARMING_REGISTRY)
    priority: id === 'public-routes' ? 90 : 80,
    requiresAuth: id === 'personal-routes',
    order: id === 'public-routes' ? 0 : 1,
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
    mocks.publicRoutes.mockResolvedValue(undefined);
    mocks.personalRoutes.mockResolvedValue(undefined);
  });

  it('runs jobs by registry priority and includes authenticated workloads', async () => {
    const order: string[] = [];
    mocks.publicRoutes.mockImplementation(async () => order.push('public'));
    mocks.personalRoutes.mockImplementation(async () => order.push('personal'));

    const result = await runWarmingEngine({ authenticated: true });

    expect(order).toEqual(['public', 'personal']);
    expect(result.completed).toEqual(['public-routes', 'personal-routes']);
    expect(result.skipped).toEqual([]);
  });

  it('does not spend budget on lower-priority jobs that do not fit', async () => {
    // cost.requests is 1 per job in the mock; a budget of 1 admits only the
    // highest-priority job (public-routes).
    mocks.getWarmingBudget.mockReturnValue({
      maxRequests: 1,
      maxBytes: 2_000_000,
      maxDurationMs: 30_000,
      maxConcurrency: 1,
      maxRouteCount: 8,
      maxPersonalRouteCount: 2,
      allowImages: false,
    });

    // Model the admitted job consuming their estimated runtime budget.
    mocks.publicRoutes.mockImplementation(async () => { mocks.runtimeUsage.requests += 1; mocks.runtimeUsage.bytes += 10_000; });
    mocks.personalRoutes.mockImplementation(async () => { mocks.runtimeUsage.requests += 1; mocks.runtimeUsage.bytes += 10_000; });

    const result = await runWarmingEngine({ authenticated: true });

    expect(result.completed).toEqual(['public-routes']);
    expect(result.skipped).toEqual(['personal-routes']);
    expect(mocks.personalRoutes).not.toHaveBeenCalled();
  });

  it('never pre-fetches data: only page-shell jobs exist', async () => {
    const result = await runWarmingEngine({ authenticated: true });
    expect(result.completed.every((id) => id === 'public-routes' || id === 'personal-routes')).toBe(true);
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
    expect(mocks.publicRoutes).not.toHaveBeenCalled();
    expect(mocks.personalRoutes).not.toHaveBeenCalled();
  });
});

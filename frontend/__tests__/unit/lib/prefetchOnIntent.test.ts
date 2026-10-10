import { beforeEach, describe, expect, it, vi } from 'vitest';

const getNetworkPolicy = vi.hoisted(() => vi.fn(() => ({
  allowPrefetch: true,
  maxPrefetchConcurrency: 1,
})));

vi.mock('@/lib/networkPolicy', () => ({ getNetworkPolicy }));
vi.mock('@/lib/queryClient', () => ({
  getQueryClient: () => ({
    prefetchQuery: vi.fn().mockResolvedValue(undefined),
  }),
}));

import { onIntentPrefetch } from '@/lib/prefetchOnIntent';

function installFinePointer() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: query.includes('hover: hover') || query.includes('pointer: fine'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

describe('prefetchOnIntent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    getNetworkPolicy.mockReturnValue({ allowPrefetch: true, maxPrefetchConcurrency: 1 });
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    installFinePointer();
  });

  it('skips prefetch on touch-only devices', () => {
    window.matchMedia = vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as typeof window.matchMedia;

    const work = vi.fn();
    onIntentPrefetch('touch-card', work);
    vi.advanceTimersByTime(2000);

    expect(work).not.toHaveBeenCalled();
  });

  it('re-checks the network policy after idle scheduling', async () => {
    const work = vi.fn().mockResolvedValue(undefined);
    onIntentPrefetch('network-change', work);
    getNetworkPolicy.mockReturnValue({ allowPrefetch: false, maxPrefetchConcurrency: 0 });

    await vi.advanceTimersByTimeAsync(2000);
    expect(work).not.toHaveBeenCalled();
  });

  it('releases a queued key when the network gate closes so it can retry immediately', async () => {
    const work = vi.fn().mockResolvedValue(undefined);
    onIntentPrefetch('retry-after-policy-change', work);
    getNetworkPolicy.mockReturnValue({ allowPrefetch: false, maxPrefetchConcurrency: 0 });

    await vi.advanceTimersByTimeAsync(2000);
    getNetworkPolicy.mockReturnValue({ allowPrefetch: true, maxPrefetchConcurrency: 1 });
    onIntentPrefetch('retry-after-policy-change', work);
    await vi.advanceTimersByTimeAsync(2000);

    expect(work).toHaveBeenCalledTimes(1);
  });

  it('limits concurrent prefetch work according to the network policy', async () => {
    getNetworkPolicy.mockReturnValue({ allowPrefetch: true, maxPrefetchConcurrency: 1 });
    let release!: () => void;
    const first = new Promise<void>((resolve) => { release = resolve; });
    const work1 = vi.fn(() => first);
    const work2 = vi.fn().mockResolvedValue(undefined);

    onIntentPrefetch('one', work1);
    onIntentPrefetch('two', work2);
    await vi.advanceTimersByTimeAsync(2000);

    expect(work1).toHaveBeenCalledTimes(1);
    expect(work2).not.toHaveBeenCalled();
    release();
  });

  it('allows the same key again after the short dedupe window', async () => {
    const work = vi.fn().mockResolvedValue(undefined);
    onIntentPrefetch('repeat', work);
    await vi.advanceTimersByTimeAsync(2000);
    expect(work).toHaveBeenCalledTimes(1);

    onIntentPrefetch('repeat', work);
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000 + 2000);
    expect(work).toHaveBeenCalledTimes(2);
  });
});

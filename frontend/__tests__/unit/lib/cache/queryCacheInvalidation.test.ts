import { describe, expect, it, vi } from 'vitest';
import { invalidateCacheDomains, invalidateReactQueryForMutation } from '@/lib/cache/queryCacheInvalidation';

describe('canonical React Query cache invalidation', () => {
  it('deduplicates canonical prefixes and only refetches active queries', async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    await invalidateCacheDomains({ invalidateQueries } as never, ['productList','productDetail','home']);
    expect(invalidateQueries).toHaveBeenCalledTimes(2);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['products'], refetchType: 'active' });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['home'], refetchType: 'active' });
  });
  it('does not invalidate unmapped mutation paths', async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    expect(await invalidateReactQueryForMutation({ invalidateQueries } as never, '/api/v1/unmapped-resource/123')).toBe(false);
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('resolves API versioned mutation paths', async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    expect(await invalidateReactQueryForMutation({ invalidateQueries } as never, '/api/v1/products/123')).toBe(true);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['products'], refetchType: 'active' });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['home'], refetchType: 'active' });
  });
});

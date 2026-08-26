import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useStoreBadges, useProviderBadges } from '@/hooks/queries/useBadges';
import { useMyPromotions, usePromotion } from '@/hooks/queries/usePromotions';
import { useMyCollections, useCollection, usePublicCollections, useCollectionProducts } from '@/hooks/queries/useCollections';
import { badgesApi } from '@/api/badges.api';
import { promotionsApi } from '@/api/promotions.api';
import { collectionsApi } from '@/api/collections.api';
vi.mock('@/api/badges.api', () => ({ badgesApi: { getStoreBadges: vi.fn(), getProviderBadges: vi.fn() } }));
vi.mock('@/api/promotions.api', () => ({ promotionsApi: { getMine: vi.fn(), getById: vi.fn() } }));
vi.mock('@/api/collections.api', () => ({ collectionsApi: { getMine: vi.fn(), getById: vi.fn(), getPublicCollections: vi.fn(), getPublicCollectionProducts: vi.fn() } }));
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => vi.clearAllMocks());
describe('badges/promotions/collections queries', () => {
  it('loads store badges and related queries', async () => {
    (badgesApi.getStoreBadges as any).mockResolvedValue({ data: { data: [{ id: 'b1' }] } });
    (badgesApi.getProviderBadges as any).mockResolvedValue({ data: { data: [] } });
    (promotionsApi.getMine as any).mockResolvedValue({ data: { data: [] } });
    (promotionsApi.getById as any).mockResolvedValue({ data: { data: { id: 'p1' } } });
    (collectionsApi.getMine as any).mockResolvedValue({ data: { data: [] } });
    (collectionsApi.getById as any).mockResolvedValue({ data: { data: { id: 'c1' } } });
    (collectionsApi.getPublicCollections as any).mockResolvedValue({ data: { data: [] } });
    (collectionsApi.getPublicCollectionProducts as any).mockResolvedValue({ data: { data: [] } });
    const a = renderHook(() => useStoreBadges('s1'), { wrapper });
    await waitFor(() => expect(a.result.current.isSuccess).toBe(true));
    const b = renderHook(() => useProviderBadges('pr1'), { wrapper });
    await waitFor(() => expect(b.result.current.isSuccess).toBe(true));
    const c = renderHook(() => useMyPromotions(), { wrapper });
    await waitFor(() => expect(c.result.current.isSuccess).toBe(true));
    const d = renderHook(() => usePromotion('p1'), { wrapper });
    await waitFor(() => expect(d.result.current.isSuccess).toBe(true));
    const e = renderHook(() => useMyCollections(), { wrapper });
    await waitFor(() => expect(e.result.current.isSuccess).toBe(true));
    const f = renderHook(() => useCollection('c1'), { wrapper });
    await waitFor(() => expect(f.result.current.isSuccess).toBe(true));
    const g = renderHook(() => usePublicCollections('s1'), { wrapper });
    await waitFor(() => expect(g.result.current.isSuccess).toBe(true));
    const h = renderHook(() => useCollectionProducts('c1'), { wrapper });
    await waitFor(() => expect(h.result.current.isSuccess).toBe(true));
  });
});

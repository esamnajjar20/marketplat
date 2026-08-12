/**
 * __tests__/unit/hooks/useCategoriesAndListings.test.tsx
 *
 * Previously uncovered (0%): useServiceCategories.ts, useServiceListings.ts,
 * useProductCategories.ts.
 *
 *  useServiceCategories / useProductCategories: always enabled.
 *  useServiceCategoryBySlug / useProductCategoryBySlug: gated on a
 *   non-empty slug.
 *  useServiceCategoriesForAdmin / useProductCategoriesForAdmin: always
 *   enabled, always live (staleTime: 0 — not asserted directly here
 *   since it's an implementation detail, but the fetch itself is).
 *  useServiceListings / useServiceListing / useMyServiceListings: public
 *   list/mine always enabled, detail gated on a non-empty id.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useServiceCategories,
  useServiceCategoryBySlug,
  useServiceCategoriesForAdmin,
} from '@/hooks/queries/useServiceCategories';
import {
  useProductCategories,
  useProductCategoryBySlug,
  useProductCategoriesForAdmin,
} from '@/hooks/queries/useProductCategories';
import {
  useServiceListings,
  useServiceListing,
  useMyServiceListings,
} from '@/hooks/queries/useServiceListings';
import { serviceCategoriesApi } from '@/api/service-categories.api';
import { productCategoriesApi } from '@/api/product-categories.api';
import { serviceListingsApi } from '@/api/service-listings.api';

vi.mock('@/api/service-categories.api', () => ({
  serviceCategoriesApi: { getAll: vi.fn(), getBySlug: vi.fn(), getAllForAdmin: vi.fn() },
}));
vi.mock('@/api/product-categories.api', () => ({
  productCategoriesApi: { getAll: vi.fn(), getBySlug: vi.fn(), getAllForAdmin: vi.fn() },
}));
vi.mock('@/api/service-listings.api', () => ({
  serviceListingsApi: { getAll: vi.fn(), getById: vi.fn(), getMine: vi.fn() },
}));

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe('useServiceCategories', () => {
  it('fires and unwraps r.data.data', async () => {
    (serviceCategoriesApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: [{ id: 'cat-1', slug: 'plumbing' }] },
    });

    const { result } = renderHook(() => useServiceCategories(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([{ id: 'cat-1', slug: 'plumbing' }]);
  });
});

describe('useServiceCategoryBySlug', () => {
  it('does not fire with an empty slug', async () => {
    renderHook(() => useServiceCategoryBySlug(''), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(serviceCategoriesApi.getBySlug).not.toHaveBeenCalled();
  });

  it('fires and unwraps r.data.data with a non-empty slug', async () => {
    (serviceCategoriesApi.getBySlug as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'cat-1', slug: 'plumbing' } },
    });

    const { result } = renderHook(() => useServiceCategoryBySlug('plumbing'), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(serviceCategoriesApi.getBySlug).toHaveBeenCalledWith('plumbing');
    expect(result.current.data).toEqual({ id: 'cat-1', slug: 'plumbing' });
  });
});

describe('useServiceCategoriesForAdmin', () => {
  it('fires and unwraps r.data.data', async () => {
    (serviceCategoriesApi.getAllForAdmin as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: [{ id: 'cat-1', active: false }] },
    });

    const { result } = renderHook(() => useServiceCategoriesForAdmin(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([{ id: 'cat-1', active: false }]);
  });
});

describe('useProductCategories', () => {
  it('fires and unwraps r.data.data', async () => {
    (productCategoriesApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: [{ id: 'pcat-1', slug: 'electronics' }] },
    });

    const { result } = renderHook(() => useProductCategories(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([{ id: 'pcat-1', slug: 'electronics' }]);
  });
});

describe('useProductCategoryBySlug', () => {
  it('does not fire with an empty slug', async () => {
    renderHook(() => useProductCategoryBySlug(''), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(productCategoriesApi.getBySlug).not.toHaveBeenCalled();
  });

  it('fires and unwraps r.data.data with a non-empty slug', async () => {
    (productCategoriesApi.getBySlug as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'pcat-1', slug: 'electronics' } },
    });

    const { result } = renderHook(() => useProductCategoryBySlug('electronics'), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(productCategoriesApi.getBySlug).toHaveBeenCalledWith('electronics');
    expect(result.current.data).toEqual({ id: 'pcat-1', slug: 'electronics' });
  });
});

describe('useProductCategoriesForAdmin', () => {
  it('fires and unwraps r.data.data', async () => {
    (productCategoriesApi.getAllForAdmin as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: [{ id: 'pcat-1', active: false }] },
    });

    const { result } = renderHook(() => useProductCategoriesForAdmin(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([{ id: 'pcat-1', active: false }]);
  });
});

describe('useServiceListings / useServiceListing / useMyServiceListings', () => {
  it('useServiceListings fires and unwraps r.data.data', async () => {
    (serviceListingsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [{ id: 'sl-1' }], meta: { total: 1 } } },
    });

    const { result } = renderHook(() => useServiceListings(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({ items: [{ id: 'sl-1' }], meta: { total: 1 } });
  });

  it('useServiceListing does not fire with an empty id', async () => {
    renderHook(() => useServiceListing(''), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(serviceListingsApi.getById).not.toHaveBeenCalled();
  });

  it('useServiceListing fires and unwraps r.data.data with a non-empty id', async () => {
    (serviceListingsApi.getById as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'sl-1', title: 'Plumbing service' } },
    });

    const { result } = renderHook(() => useServiceListing('sl-1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(serviceListingsApi.getById).toHaveBeenCalledWith('sl-1');
    expect(result.current.data).toEqual({ id: 'sl-1', title: 'Plumbing service' });
  });

  it('useMyServiceListings unwraps r.data.data', async () => {
    (serviceListingsApi.getMine as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [{ id: 'sl-2' }], meta: { total: 1 } } },
    });

    const { result } = renderHook(() => useMyServiceListings(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({ items: [{ id: 'sl-2' }], meta: { total: 1 } });
  });
});

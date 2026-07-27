/**
 * __tests__/components/SearchResults.test.tsx
 *
 * Coverage for components/ads/SearchResults.tsx, focused on FIX
 * PERF-04: useAds() and useSearchAds() are both called unconditionally
 * on every render (Hooks can't be called conditionally), with the
 * component picking whichever result applies via `isSearch`. Before
 * the fix, useAds had no `enabled` guard, so a real search (isSearch
 * === true) fired a fully wasted GET /ads in parallel with GET
 * /ads/search — the browse result was computed and simply thrown away.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SearchResults } from '@/components/ads/SearchResults';
import { adsApi } from '@/api/ads.api';

vi.mock('@/api/ads.api', () => ({
  adsApi: {
    getAll: vi.fn(),
    searchAds: vi.fn(),
  },
}));

let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const emptyPage = {
  items: [],
  meta: { total: 0, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false },
};

describe('SearchResults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    (adsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: emptyPage } });
    (adsApi.searchAds as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: emptyPage } });
  });

  it('calls only adsApi.getAll (browse) when there is no search query', async () => {
    mockSearchParams = new URLSearchParams({ page: '1' });
    renderWithClient(<SearchResults />);

    await waitFor(() => expect(adsApi.getAll).toHaveBeenCalled());

    // Give any (incorrectly) parallel search call a moment to have
    // fired if the bug were still present.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(adsApi.searchAds).not.toHaveBeenCalled();
  });

  // FIX PERF-04 — the core regression guard.
  it('calls only adsApi.searchAds (not adsApi.getAll) when a real search query is present', async () => {
    mockSearchParams = new URLSearchParams({ q: 'laptop' });
    renderWithClient(<SearchResults />);

    await waitFor(() => expect(adsApi.searchAds).toHaveBeenCalled());

    // The browse query must never have fired — it would have been
    // entirely wasted since isSearch selects searchQ's result.
    expect(adsApi.getAll).not.toHaveBeenCalled();
  });

  it('falls back to the browse query when q is present but shorter than 2 trimmed characters', async () => {
    mockSearchParams = new URLSearchParams({ q: 'a' });
    renderWithClient(<SearchResults />);

    await waitFor(() => expect(adsApi.getAll).toHaveBeenCalled());
    expect(adsApi.searchAds).not.toHaveBeenCalled();
  });
});

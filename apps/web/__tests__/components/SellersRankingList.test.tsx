/**
 * __tests__/components/SellersRankingList.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { SellersRankingList } from '@/components/sellers/SellersRankingList';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

// TODO(2026-10-16): un-skip after updating loading-state assertions to match unified loading system (1f2c898a)
describe('SellersRankingList', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('shows loading spinner', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}) as never);
    render(<SellersRankingList />, { wrapper });
    expect(screen.getByRole('status')).toHaveTextContent(/جارٍ التحميل/);
  });

  it('shows empty message', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    render(<SellersRankingList />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText(/لا يوجد بائعون/)).toBeInTheDocument();
    });
  });

  it('renders ranked sellers', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      data: [
          {
            rank: 1,
            medal: 'gold',
            sellerProfileId: 'sp1',
            userId: 'u1',
            displayName: 'أحمد',
            avatarUrl: null,
            city: 'غزة',
            verified: true,
            averageRating: 4.8,
            totalRatings: 20,
            responseTimeMinutes: 30,
            score: 100,
          },
        ],
    }), { status: 200 }));
    render(<SellersRankingList limit={10} />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('أحمد')).toBeInTheDocument();
    });
  });
});

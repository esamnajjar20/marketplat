/**
 * __tests__/components/SellersRankingList.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { SellersRankingList } from '@/components/sellers/SellersRankingList';
import { apiClient } from '@/api/client';

vi.mock('@/api/client', () => ({
  apiClient: { get: vi.fn() },
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe('SellersRankingList', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset();
  });

  it('shows loading spinner', () => {
    vi.mocked(apiClient.get).mockReturnValue(new Promise(() => {}) as never);
    render(<SellersRankingList />, { wrapper });
    expect(screen.getByLabelText(/جارٍ التحميل/)).toBeInTheDocument();
  });

  it('shows empty message', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: [] } } as never);
    render(<SellersRankingList />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText(/لا يوجد بائعون/)).toBeInTheDocument();
    });
  });

  it('renders ranked sellers', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
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
      },
    } as never);
    render(<SellersRankingList limit={10} />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('أحمد')).toBeInTheDocument();
    });
  });
});

/**
 * __tests__/components/SellerDailyBrief.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SellerDailyBrief } from '@/components/profile/SellerDailyBrief';
import { useMyAdStats } from '@/hooks/queries/useAds';
import { useMyConversations } from '@/hooks/queries/useConversations';

vi.mock('@/hooks/queries/useAds', () => ({
  useMyAdStats: vi.fn(),
}));
vi.mock('@/hooks/queries/useConversations', () => ({
  useMyConversations: vi.fn(),
}));
vi.mock('@/lib/formatters', () => ({
  formatNumber: (n: number) => String(n),
}));

describe('SellerDailyBrief', () => {
  beforeEach(() => {
    vi.mocked(useMyAdStats).mockReturnValue({
      data: { activeAds: 5, totalViews: 120, totalFavorites: 8 },
      isLoading: false,
      isError: false,
    } as never);
    vi.mocked(useMyConversations).mockReturnValue({
      data: { items: [{ id: 'c1', unreadCount: 2 }] },
      isLoading: false,
    } as never);
  });

  it('shows loading pulse', () => {
    vi.mocked(useMyAdStats).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as never);
    const { container } = render(<SellerDailyBrief />);
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renders stats chips', () => {
    render(<SellerDailyBrief />);
    expect(screen.getByText('إعلانات نشطة')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });
});

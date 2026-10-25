/**
 * __tests__/components/StorePendingBanner.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StorePendingBanner } from '@/components/stores/StorePendingBanner';
import { useMyStore } from '@/hooks/queries/useStores';

vi.mock('@/hooks/queries/useStores', () => ({
  useMyStore: vi.fn(),
}));

describe('StorePendingBanner', () => {
  beforeEach(() => {
    vi.mocked(useMyStore).mockReturnValue({
      data: {
        id: 's1',
        name: 'متجري',
        status: 'PENDING',
      },
      isSuccess: true,
    } as never);
  });

  it('renders pending review message and product/promo links', () => {
    render(<StorePendingBanner />);
    expect(screen.getByText(/قيد مراجعة الإدارة/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /المنتجات/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /العروض/ })).toBeInTheDocument();
  });

  it('returns null when store is ACTIVE', () => {
    vi.mocked(useMyStore).mockReturnValue({
      data: { id: 's1', status: 'ACTIVE' },
      isSuccess: true,
    } as never);
    const { container } = render(<StorePendingBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows blocked message when BLOCKED', () => {
    vi.mocked(useMyStore).mockReturnValue({
      data: { id: 's1', status: 'BLOCKED' },
      isSuccess: true,
    } as never);
    render(<StorePendingBanner />);
    expect(screen.getByText(/متجرك محظور/)).toBeInTheDocument();
  });
});

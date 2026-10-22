import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PromotedLoadMore } from '@/components/promoted/PromotedLoadMore';
import { productsApi } from '@/api/products.api';

vi.mock('@/api/products.api', () => ({
  productsApi: { getAll: vi.fn() },
}));

describe('PromotedLoadMore', () => {
  beforeEach(() => {
    vi.mocked(productsApi.getAll).mockReset();
  });

  it('loads the next promoted page only after an explicit click', async () => {
    vi.mocked(productsApi.getAll).mockResolvedValue({
      data: {
        data: {
          items: [],
          meta: { page: 2, hasNextPage: false },
        },
      },
    } as Awaited<ReturnType<typeof productsApi.getAll>>);

    render(<PromotedLoadMore initialPage={1} hasNextPage />);
    expect(productsApi.getAll).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'تحميل المزيد' }));

    await waitFor(() => {
      expect(productsApi.getAll).toHaveBeenCalledWith({
        hasPromotion: true,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        page: 2,
        limit: 16,
      });
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'تحميل المزيد' })).not.toBeInTheDocument();
    });
  });

  it('shows an error and offers retry when loading fails', async () => {
    vi.mocked(productsApi.getAll).mockRejectedValue(new Error('network error'));

    render(<PromotedLoadMore initialPage={1} hasNextPage />);
    fireEvent.click(screen.getByRole('button', { name: 'تحميل المزيد' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('تعذّر تحميل المزيد من العروض');
    expect(await screen.findByRole('button', { name: 'إعادة المحاولة' })).toBeInTheDocument();
  });
});

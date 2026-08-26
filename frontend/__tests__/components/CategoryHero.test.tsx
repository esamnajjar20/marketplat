/**
 * CategoryHero — category page header + analytics.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CategoryHero } from '@/components/home/CategoryHero';
import { useCategoryBySlug } from '@/hooks/queries/useCategories';
import { track } from '@/lib/analytics';

vi.mock('@/hooks/queries/useCategories', () => ({
  useCategoryBySlug: vi.fn(),
}));

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

describe('CategoryHero', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a pulse skeleton while loading', () => {
    vi.mocked(useCategoryBySlug).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as never);
    const { container } = render(<CategoryHero slug="cars" />);
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('shows error notice when fetch fails', () => {
    vi.mocked(useCategoryBySlug).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as never);
    render(<CategoryHero slug="bad" />);
    expect(screen.getByText('تعذّر تحميل بيانات هذا القسم')).toBeInTheDocument();
  });

  it('renders the Arabic category name and tracks CATEGORY_BROWSE', () => {
    vi.mocked(useCategoryBySlug).mockReturnValue({
      data: { id: 'cat-1', nameAr: 'سيارات' },
      isLoading: false,
      isError: false,
    } as never);
    render(<CategoryHero slug="cars" />);
    expect(screen.getByRole('heading', { name: 'سيارات' })).toBeInTheDocument();
    expect(track).toHaveBeenCalledWith('CATEGORY_BROWSE', {
      categoryId: 'cat-1',
      slug: 'cars',
    });
  });
});

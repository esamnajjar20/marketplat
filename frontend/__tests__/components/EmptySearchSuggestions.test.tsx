import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptySearchSuggestions } from '@/components/search/EmptySearchSuggestions';
import { useCategories } from '@/hooks/queries/useCategories';
vi.mock('@/hooks/queries/useCategories', () => ({ useCategories: vi.fn() }));
vi.mock('next/link', () => ({ default: ({ href, children }: any) => <a href={href}>{children}</a> }));
vi.mock('@/components/shared/ui/Skeleton', () => ({ Skeleton: () => <div data-testid="skeleton" /> }));
beforeEach(() => vi.clearAllMocks());
describe('EmptySearchSuggestions', () => {
  it('skeletons', () => {
    vi.mocked(useCategories).mockReturnValue({ data: undefined, isLoading: true } as any);
    render(<EmptySearchSuggestions />);
    expect(screen.getAllByTestId('skeleton').length).toBe(4);
  });
  it('top-level only', () => {
    vi.mocked(useCategories).mockReturnValue({ data: [{ id: 'c1', parentId: null, nameAr: 'مركبات', slug: 'v' }, { id: 'c2', parentId: 'c1', nameAr: 'فرعي', slug: 's' }], isLoading: false } as any);
    render(<EmptySearchSuggestions />);
    expect(screen.getByText('مركبات')).toBeInTheDocument();
    expect(screen.queryByText('فرعي')).not.toBeInTheDocument();
  });
});

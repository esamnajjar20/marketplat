import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptySearchSuggestions } from '@/components/search/EmptySearchSuggestions';
import { useCategories } from '@/hooks/queries/useCategories';

vi.mock('@/hooks/queries/useCategories', () => ({ useCategories: vi.fn() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('type=ads'),
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

beforeEach(() => {
  vi.mocked(useCategories).mockReturnValue({
    data: [{ id: 'c1', parentId: null, nameAr: 'مركبات', slug: 'vehicles' }],
    isLoading: false,
  } as any);
});

describe('EmptySearchSuggestions', () => {
  it('shows popular queries, type shortcuts, and categories', () => {
    render(<EmptySearchSuggestions />);
    expect(screen.getByText('سيارة')).toBeInTheDocument();
    expect(screen.getByText('إعلانات')).toBeInTheDocument();
    expect(screen.getByText('مركبات')).toBeInTheDocument();
  });
});

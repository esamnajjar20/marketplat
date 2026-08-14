/**
 * __tests__/components/ads/SearchSortBarWrapper.test.tsx
 *
 * Covers components/ads/SearchSortBarWrapper.tsx — the URL-binding
 * layer around the shared SearchSortBar for the ads category page.
 * Moved out of ads/SearchFilters (audit item #8, FIX P2-08). The one
 * thing specific to this wrapper (beyond what SearchSortBar's own
 * suite already covers) is FIX BUG-06's usePathname() convention: sort
 * changes must stay on the current category page, not redirect to a
 * hardcoded /search.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchSortBarWrapper } from '@/components/ads/SearchSortBarWrapper';
import { usePathname } from 'next/navigation';

const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
  usePathname: vi.fn(),
}));

const mockUsePathname = vi.mocked(usePathname);

describe('SearchSortBarWrapper (ads)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockUsePathname.mockReturnValue('/categories/electronics');
  });

  it('defaults to newest (createdAt_desc) when no sort params are set', () => {
    render(<SearchSortBarWrapper />);
    expect(screen.getByText('الأحدث')).toBeInTheDocument();
  });

  it('sets sortBy/sortOrder and drops page, staying on the current pathname (FIX BUG-06)', async () => {
    mockSearchParams = new URLSearchParams({ page: '2' });
    const user = userEvent.setup();
    render(<SearchSortBarWrapper />);

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'السعر (أقل)' }));

    const url = mockPush.mock.calls[0][0] as string;
    const [path] = url.split('?');
    expect(path).toBe('/categories/electronics');
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('sortBy')).toBe('price');
    expect(params.get('sortOrder')).toBe('asc');
    expect(params.has('page')).toBe(false);
  });

  it('pushes to a different pathname when rendered on a different category page', async () => {
    mockUsePathname.mockReturnValue('/categories/vehicles');
    const user = userEvent.setup();
    render(<SearchSortBarWrapper />);

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'الأكثر مشاهدة' }));

    const [path] = (mockPush.mock.calls[0][0] as string).split('?');
    expect(path).toBe('/categories/vehicles');
  });
});

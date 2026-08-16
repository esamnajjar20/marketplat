/**
 * __tests__/components/search/SearchSortBarWrapper.test.tsx
 *
 * Covers components/search/SearchSortBarWrapper.tsx — the URL-binding
 * layer around the shared SearchSortBar for the unified search page.
 * Moved out of SearchFilters (audit item #8, FIX P2-08); this covers
 * exactly what that component's own sort tests used to cover:
 *   - the four base sort options are offered, defaulting to relevance.
 *   - selecting a sort option sets ?sort and drops ?page, on
 *     ROUTES.search.
 *   - the 'distance' option only appears once lat/lng are both set
 *     (TRACK-NEARBY-SEARCH — matches the backend's .refine() gate).
 * SearchSortBar's own push/read mechanics have their own dedicated
 * suite (__tests__/components/shared/SearchSortBar.test.tsx) and
 * aren't re-verified here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { SearchSortBarWrapper } from '@/components/search/SearchSortBarWrapper';
import { ROUTES } from '@/lib/constants';

const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}));

describe('SearchSortBarWrapper (search)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it('defaults to relevance when no sort param is set', () => {
    render(<SearchSortBarWrapper />);
    expect(screen.getByText('الأكثر تطابقاً')).toBeInTheDocument();
  });

  it('sets the sort param and drops page when a sort option is picked', async () => {
    mockSearchParams = new URLSearchParams({ page: '2' });
    const user = setupUser();
    render(<SearchSortBarWrapper />);

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'الأحدث' }));

    const url = mockPush.mock.calls[0][0] as string;
    expect(url.startsWith(ROUTES.search)).toBe(true);
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('sort')).toBe('newest');
    expect(params.has('page')).toBe(false);
  });

  it('does not offer the distance option when lat/lng are not both set', async () => {
    mockSearchParams = new URLSearchParams({ lat: '31.9' });
    const user = setupUser();
    render(<SearchSortBarWrapper />);

    await user.click(screen.getByRole('combobox'));
    expect(screen.queryByRole('option', { name: 'الأقرب' })).not.toBeInTheDocument();
  });

  it('offers the distance option once lat and lng are both set', async () => {
    mockSearchParams = new URLSearchParams({ lat: '31.9', lng: '35.2' });
    const user = setupUser();
    render(<SearchSortBarWrapper />);

    await user.click(screen.getByRole('combobox'));
    expect(await screen.findByRole('option', { name: 'الأقرب' })).toBeInTheDocument();
  });
});

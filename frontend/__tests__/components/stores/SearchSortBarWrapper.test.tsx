/**
 * __tests__/components/stores/SearchSortBarWrapper.test.tsx
 *
 * Covers components/stores/SearchSortBarWrapper.tsx — the URL-binding
 * layer around the shared SearchSortBar for /stores. Moved out of
 * StoresFilters (audit item #8, FIX P2-08); replaces that component's
 * former "renders all sort options and applies sortBy/sortOrder
 * together" test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchSortBarWrapper } from '@/components/stores/SearchSortBarWrapper';
import { ROUTES } from '@/lib/constants';

const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}));

describe('SearchSortBarWrapper (stores)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it('defaults to newest (createdAt_desc) when no sort params are set', () => {
    render(<SearchSortBarWrapper />);
    expect(screen.getByText('الأحدث')).toBeInTheDocument();
  });

  it('sets sortBy/sortOrder and drops page on ROUTES.stores when a sort option is picked', async () => {
    mockSearchParams = new URLSearchParams({ page: '3' });
    const user = userEvent.setup();
    render(<SearchSortBarWrapper />);

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'الاسم (أ-ي)' }));

    const url = mockPush.mock.calls[0][0] as string;
    expect(url.startsWith(ROUTES.stores)).toBe(true);
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('sortBy')).toBe('name');
    expect(params.get('sortOrder')).toBe('asc');
    expect(params.has('page')).toBe(false);
  });

  it('preserves other existing params (e.g. search, city) when pushing', async () => {
    mockSearchParams = new URLSearchParams({ search: 'أثاث', city: 'غزة' });
    const user = userEvent.setup();
    render(<SearchSortBarWrapper />);

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'الاسم (أ-ي)' }));

    const params = new URLSearchParams((mockPush.mock.calls[0][0] as string).split('?')[1]);
    expect(params.get('search')).toBe('أثاث');
    expect(params.get('city')).toBe('غزة');
  });
});

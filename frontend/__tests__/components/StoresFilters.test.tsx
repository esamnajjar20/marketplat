/**
 * __tests__/components/StoresFilters.test.tsx
 *
 * Coverage gap: 0% prior coverage (FIX BUG-02: the filter UI was
 * previously entirely missing while the data layer already read
 * these params). Covers the search input's Enter-to-apply and
 * blur-to-apply paths, that changing a filter always clears `page`,
 * and the city select (including the ALL -> cleared-param case).
 *
 * Sort moved out to the shared SearchSortBar (audit item #8, FIX
 * P2-08) — its combined sortBy_sortOrder push logic is covered in
 * __tests__/components/shared/SearchSortBar.test.tsx instead.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { StoresFilters } from '@/components/stores/StoresFilters';

const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}));

describe('StoresFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it('applies the search term on Enter and clears the page param', async () => {
    const user = setupUser();
    render(<StoresFilters />);

    const input = screen.getByPlaceholderText('ابحث عن متجر…');
    await user.type(input, 'أثاث{Enter}');

    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('search=%D8%A3%D8%AB%D8%A7%D8%AB'));
    expect(mockPush).toHaveBeenCalledWith(expect.not.stringContaining('page='));
  });

  it('applies the search term on blur', async () => {
    const user = setupUser();
    render(<StoresFilters />);

    const input = screen.getByPlaceholderText('ابحث عن متجر…');
    await user.click(input);
    await user.type(input, 'كهرباء');
    await user.tab();

    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('search='));
  });

  it('pre-fills the search input from the URL', () => {
    mockSearchParams = new URLSearchParams('search=مواد');
    render(<StoresFilters />);

    expect(screen.getByPlaceholderText('ابحث عن متجر…')).toHaveValue('مواد');
  });

  it('shows "كل المدن" as the default city selection', () => {
    render(<StoresFilters />);

    expect(screen.getByText('كل المدن')).toBeInTheDocument();
  });

  it('selecting a city updates the URL with that city and clears page', async () => {
    const user = setupUser();
    render(<StoresFilters />);

    const triggers = screen.getAllByRole('combobox');
    await user.click(triggers[0]);
    await user.click(await screen.findByText('غزة'));

    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('city=%D8%BA%D8%B2%D8%A9'));
  });

  it('selecting "كل المدن" again clears the city param entirely', async () => {
    mockSearchParams = new URLSearchParams('city=غزة');
    const user = setupUser();
    render(<StoresFilters />);

    const triggers = screen.getAllByRole('combobox');
    await user.click(triggers[0]);
    await user.click((await screen.findAllByText('كل المدن'))[0]);

    expect(mockPush).toHaveBeenCalledWith(expect.not.stringContaining('city='));
  });
});

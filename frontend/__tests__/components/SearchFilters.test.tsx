/**
 * __tests__/components/SearchFilters.test.tsx
 *
 * Real logic under test:
 *  - FIX BUG-06: filter changes and the reset button stay on the
 *    current pathname (not hardcoded to /search), so this component
 *    works correctly both on /search and on a category page
 *  - selecting a category from the dropdown navigates to that
 *    category's own /categories/:slug page (not a ?categoryId= param)
 *    when the category is found in the tree, including subcategories
 *  - selecting "كل الفئات" clears the category (goes to /search from a
 *    category page, or the bare pathname otherwise)
 *  - city/condition updates set the param, clear ?page
 *  - FIX P2-5: price inputs debounce (500ms) before pushing, so
 *    rapid typing in both fields doesn't fire once per keystroke/blur
 *
 * Sort moved out to the shared SearchSortBar (audit item #8, FIX
 * P2-08) — its combined sortBy_sortOrder push logic is covered in
 * __tests__/components/shared/SearchSortBar.test.tsx instead, and its
 * usePathname()-based wiring in
 * __tests__/components/ads/SearchSortBarWrapper.test.tsx.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchFilters } from '@/components/ads/SearchFilters';
import { useCategories, useCategoryBySlug } from '@/hooks/queries/useCategories';

vi.mock('@/hooks/queries/useCategories', () => ({
  useCategories: vi.fn(),
  useCategoryBySlug: vi.fn(),
}));

let mockSearchParams = new URLSearchParams();
const mockPush = vi.fn();
let mockPathname = '/search';
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockPathname,
}));

const mockUseCategories = vi.mocked(useCategories);
const mockUseCategoryBySlug = vi.mocked(useCategoryBySlug);

// The three <Select>s (category, city, condition) sit under plain
// <label>s with no htmlFor, so getByLabelText can't reach them —
// select by their fixed document order instead. Sort no longer lives
// here (moved to SearchSortBar, FIX P2-08).
const COMBOBOX_ORDER = { category: 0, city: 1, condition: 2 } as const;
function getCombobox(which: keyof typeof COMBOBOX_ORDER) {
  return screen.getAllByRole('combobox')[COMBOBOX_ORDER[which]];
}

const categories = [
  {
    id: 'cat-1', nameAr: 'إلكترونيات', slug: 'electronics',
    children: [{ id: 'cat-1a', nameAr: 'هواتف', slug: 'phones' }],
  },
  { id: 'cat-2', nameAr: 'مركبات', slug: 'vehicles', children: [] },
];

describe('SearchFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockPathname = '/search';
    mockUseCategories.mockReturnValue({ data: categories } as never);
    mockUseCategoryBySlug.mockReturnValue({ data: undefined } as never);
  });

  it('navigates to the matched category\'s own page when a root category is selected', async () => {
    const user = userEvent.setup();
    render(<SearchFilters />);

    await user.click(getCombobox('category'));
    await user.click(await screen.findByRole('option', { name: 'إلكترونيات' }));

    expect(mockPush).toHaveBeenCalledWith('/categories/electronics');
  });

  it('navigates to a matched subcategory\'s own page when selected', async () => {
    const user = userEvent.setup();
    render(<SearchFilters />);

    await user.click(getCombobox('category'));
    await user.click(await screen.findByRole('option', { name: '— هواتف' }));

    expect(mockPush).toHaveBeenCalledWith('/categories/phones');
  });

  it('navigates to /search when "كل الفئات" is chosen while on a category page', async () => {
    // Radix Select only fires onValueChange on an actual value change, so
    // the category combobox must start on a real selection (not already
    // 'ALL') for clicking "كل الفئات" to register as a click at all.
    mockSearchParams = new URLSearchParams('categoryId=cat-1');
    mockPathname = '/categories/electronics';
    const user = userEvent.setup();
    render(<SearchFilters categorySlug="electronics" />);

    await user.click(getCombobox('category'));
    await user.click(await screen.findByRole('option', { name: 'كل الفئات' }));

    expect(mockPush).toHaveBeenCalledWith('/search');
  });

  it('navigates to the current pathname when "كل الفئات" is chosen without a categorySlug', async () => {
    mockSearchParams = new URLSearchParams('categoryId=cat-1');
    const user = userEvent.setup();
    render(<SearchFilters />);

    await user.click(getCombobox('category'));
    await user.click(await screen.findByRole('option', { name: 'كل الفئات' }));

    expect(mockPush).toHaveBeenCalledWith('/search');
  });

  it('sets ?city and clears ?page when a city is selected', async () => {
    const user = userEvent.setup();
    render(<SearchFilters />);

    await user.click(getCombobox('city'));
    await user.click(await screen.findByRole('option', { name: 'غزة' }));

    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('city=%D8%BA%D8%B2%D8%A9'));
    expect(mockPush).toHaveBeenCalledWith(expect.not.stringContaining('page='));
  });

  it('updates the current pathname (not a hardcoded /search) on a category page (FIX BUG-06)', async () => {
    mockPathname = '/categories/electronics';
    const user = userEvent.setup();
    render(<SearchFilters categorySlug="electronics" />);

    await user.click(getCombobox('city'));
    await user.click(await screen.findByRole('option', { name: 'غزة' }));

    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('/categories/electronics?'));
  });

  it('resets to the current pathname with no query string when the reset button is clicked', async () => {
    mockSearchParams = new URLSearchParams('city=غزة&minPrice=100');
    const user = userEvent.setup();
    render(<SearchFilters />);

    await user.click(screen.getByRole('button', { name: 'إعادة تعيين الفلاتر' }));

    expect(mockPush).toHaveBeenCalledWith('/search');
  });

  it('resets to the category page pathname (not /search) when on a category page', async () => {
    mockPathname = '/categories/electronics';
    const user = userEvent.setup();
    render(<SearchFilters categorySlug="electronics" />);

    await user.click(screen.getByRole('button', { name: 'إعادة تعيين الفلاتر' }));

    expect(mockPush).toHaveBeenCalledWith('/categories/electronics');
  });

  describe('price inputs (debounced, FIX P2-5)', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('does not push immediately on change', () => {
      render(<SearchFilters />);
      fireEvent.change(screen.getByPlaceholderText('من'), { target: { value: '100' } });
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('pushes once after the debounce window elapses', () => {
      render(<SearchFilters />);
      fireEvent.change(screen.getByPlaceholderText('من'), { target: { value: '100' } });
      vi.advanceTimersByTime(500);
      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('minPrice=100'));
    });

    it('debounces rapid successive changes into a single push using the latest value', () => {
      render(<SearchFilters />);
      const input = screen.getByPlaceholderText('من');
      fireEvent.change(input, { target: { value: '1' } });
      vi.advanceTimersByTime(200);
      fireEvent.change(input, { target: { value: '10' } });
      vi.advanceTimersByTime(200);
      fireEvent.change(input, { target: { value: '100' } });
      vi.advanceTimersByTime(500);

      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('minPrice=100'));
    });

    it('clears the param when the price field is emptied', () => {
      mockSearchParams = new URLSearchParams('minPrice=100');
      render(<SearchFilters />);
      fireEvent.change(screen.getByPlaceholderText('من'), { target: { value: '' } });
      vi.advanceTimersByTime(500);
      expect(mockPush).toHaveBeenCalledWith(expect.not.stringContaining('minPrice'));
    });
  });
});

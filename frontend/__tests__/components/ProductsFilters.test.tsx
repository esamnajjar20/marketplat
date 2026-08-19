/**
 * __tests__/components/ProductsFilters.test.tsx
 *
 * PROMO-1 (Phase 12, full scope): mirrors StoresFilters.test.tsx's
 * coverage for the shared search/city behavior, plus the new
 * hasPromotion checkbox — checked state pre-filled from the URL,
 * checking/unchecking sets/clears the param, and page is always
 * cleared on any filter change (same as every other field here).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { ProductsFilters } from '@/components/stores/ProductsFilters';

const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}));

describe('ProductsFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it('applies the search term on Enter and clears the page param', async () => {
    const user = setupUser();
    render(<ProductsFilters />);

    const input = screen.getByPlaceholderText('ابحث عن منتج…');
    await user.type(input, 'خلاط{Enter}');

    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('search='));
    expect(mockPush).toHaveBeenCalledWith(expect.not.stringContaining('page='));
  });

  it('applies the search term on blur', async () => {
    const user = setupUser();
    render(<ProductsFilters />);

    const input = screen.getByPlaceholderText('ابحث عن منتج…');
    await user.click(input);
    await user.type(input, 'سماعات');
    await user.tab();

    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('search='));
  });

  it('pre-fills the search input from the URL', () => {
    mockSearchParams = new URLSearchParams('search=خلاط');
    render(<ProductsFilters />);

    expect(screen.getByPlaceholderText('ابحث عن منتج…')).toHaveValue('خلاط');
  });

  it('shows "كل المدن" as the default city selection', () => {
    render(<ProductsFilters />);
    expect(screen.getByText('كل المدن')).toBeInTheDocument();
  });

  it('selecting a city updates the URL with that city and clears page', async () => {
    const user = setupUser();
    render(<ProductsFilters />);

    const triggers = screen.getAllByRole('combobox');
    await user.click(triggers[0]);
    await user.click(await screen.findByText('غزة'));

    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('city=%D8%BA%D8%B2%D8%A9'));
    expect(mockPush).toHaveBeenCalledWith(expect.not.stringContaining('page='));
  });

  it('selecting "كل المدن" again clears the city param entirely', async () => {
    mockSearchParams = new URLSearchParams('city=غزة');
    const user = setupUser();
    render(<ProductsFilters />);

    const triggers = screen.getAllByRole('combobox');
    await user.click(triggers[0]);
    await user.click((await screen.findAllByText('كل المدن'))[0]);

    expect(mockPush).toHaveBeenCalledWith(expect.not.stringContaining('city='));
  });

  describe('hasPromotion checkbox', () => {
    it('is unchecked by default', () => {
      render(<ProductsFilters />);
      expect(screen.getByRole('checkbox')).not.toBeChecked();
    });

    it('is checked when hasPromotion=true is in the URL', () => {
      mockSearchParams = new URLSearchParams('hasPromotion=true');
      render(<ProductsFilters />);
      expect(screen.getByRole('checkbox')).toBeChecked();
    });

    it('is unchecked when hasPromotion is any value other than the literal "true"', () => {
      mockSearchParams = new URLSearchParams('hasPromotion=false');
      render(<ProductsFilters />);
      expect(screen.getByRole('checkbox')).not.toBeChecked();
    });

    it('checking it sets hasPromotion=true and clears page', async () => {
      const user = setupUser();
      render(<ProductsFilters />);

      await user.click(screen.getByRole('checkbox'));

      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('hasPromotion=true'));
      expect(mockPush).toHaveBeenCalledWith(expect.not.stringContaining('page='));
    });

    it('unchecking it clears the hasPromotion param entirely', async () => {
      mockSearchParams = new URLSearchParams('hasPromotion=true');
      const user = setupUser();
      render(<ProductsFilters />);

      await user.click(screen.getByRole('checkbox'));

      expect(mockPush).toHaveBeenCalledWith(expect.not.stringContaining('hasPromotion='));
    });

    it('preserves other active filters (e.g. city) when toggling hasPromotion', async () => {
      mockSearchParams = new URLSearchParams('city=غزة');
      const user = setupUser();
      render(<ProductsFilters />);

      await user.click(screen.getByRole('checkbox'));

      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('city=%D8%BA%D8%B2%D8%A9'));
      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('hasPromotion=true'));
    });
  });
});

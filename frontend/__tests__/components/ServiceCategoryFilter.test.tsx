/**
 * __tests__/components/ServiceCategoryFilter.test.tsx
 *
 * Previously uncovered (0%), ~120 lines. Filter sidebar for /services —
 * search box, category/city/serviceLocation Selects, and min/max price
 * inputs, all writing to the URL via router.push and always clearing
 * ?page= on change.
 *
 * Coverage targets:
 *  - search input: Enter key and blur both call update('search', value)
 *  - category Select: renders "كل الفئات" + one option per category from
 *    useServiceCategories; selecting one pushes categoryId, selecting
 *    "كل الفئات" clears it
 *  - city Select: renders all CITIES as options
 *  - serviceLocation Select: renders all three location labels
 *  - min/max price inputs: blur calls update with the field's value
 *  - every update() call preserves other existing params and always
 *    deletes ?page=
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { ServiceCategoryFilter } from '@/components/services/ServiceCategoryFilter';
import { useServiceCategories } from '@/hooks/queries/useServiceCategories';

const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/hooks/queries/useServiceCategories', () => ({
  useServiceCategories: vi.fn(),
}));

function mockCategories(data: Array<{ id: string; nameAr: string }> | undefined) {
  vi.mocked(useServiceCategories).mockReturnValue({ data } as never);
}

describe('ServiceCategoryFilter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockCategories([
      { id: 'cat-1', nameAr: 'سباكة' },
      { id: 'cat-2', nameAr: 'كهرباء' },
    ]);
  });

  describe('search input', () => {
    it('pushes the search param when Enter is pressed', async () => {
      const user = setupUser();
      render(<ServiceCategoryFilter />);
      const input = screen.getByPlaceholderText('ابحث عن خدمة…');
      await user.type(input, 'سباك{Enter}');
      expect(mockPush).toHaveBeenCalledWith('/services?search=%D8%B3%D8%A8%D8%A7%D9%83');
    });

    it('pushes the search param on blur', async () => {
      const user = setupUser();
      render(
        <>
          <ServiceCategoryFilter />
          <button>elsewhere</button>
        </>
      );
      const input = screen.getByPlaceholderText('ابحث عن خدمة…');
      await user.type(input, 'تنظيف');
      await user.click(screen.getByText('elsewhere'));
      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('search='));
    });

    it('removes the search param when cleared', async () => {
      mockSearchParams = new URLSearchParams({ search: 'قديم' });
      const user = setupUser();
      render(
        <>
          <ServiceCategoryFilter />
          <button>elsewhere</button>
        </>
      );
      const input = screen.getByPlaceholderText('ابحث عن خدمة…');
      await user.clear(input);
      await user.click(screen.getByText('elsewhere'));
      const lastCall = mockPush.mock.calls.at(-1)?.[0] as string;
      expect(lastCall).not.toContain('search=');
    });
  });

  describe('category select', () => {
    it('renders "كل الفئات" plus one option per category', async () => {
      const user = setupUser();
      render(<ServiceCategoryFilter />);
      const triggers = screen.getAllByRole('combobox');
      await user.click(triggers[0]);
      expect(await screen.findByRole('option', { name: 'كل الفئات' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'سباكة' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'كهرباء' })).toBeInTheDocument();
    });

    it('pushes categoryId when a category is selected', async () => {
      const user = setupUser();
      render(<ServiceCategoryFilter />);
      const triggers = screen.getAllByRole('combobox');
      await user.click(triggers[0]);
      await user.click(await screen.findByRole('option', { name: 'سباكة' }));
      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('categoryId=cat-1'));
    });

    it('clears categoryId when "كل الفئات" is selected', async () => {
      mockSearchParams = new URLSearchParams({ categoryId: 'cat-1' });
      const user = setupUser();
      render(<ServiceCategoryFilter />);
      const triggers = screen.getAllByRole('combobox');
      await user.click(triggers[0]);
      await user.click(await screen.findByRole('option', { name: 'كل الفئات' }));
      const lastCall = mockPush.mock.calls.at(-1)?.[0] as string;
      expect(lastCall).not.toContain('categoryId=');
    });

    it('renders no category options when the hook has no data yet', async () => {
      mockCategories(undefined);
      const user = setupUser();
      render(<ServiceCategoryFilter />);
      const triggers = screen.getAllByRole('combobox');
      await user.click(triggers[0]);
      expect(await screen.findByRole('option', { name: 'كل الفئات' })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'سباكة' })).not.toBeInTheDocument();
    });
  });

  describe('city select', () => {
    it('renders every configured city as an option', async () => {
      const user = setupUser();
      render(<ServiceCategoryFilter />);
      const triggers = screen.getAllByRole('combobox');
      await user.click(triggers[1]);
      expect(await screen.findByRole('option', { name: 'غزة' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'رفح' })).toBeInTheDocument();
    });

    it('pushes city when selected', async () => {
      const user = setupUser();
      render(<ServiceCategoryFilter />);
      const triggers = screen.getAllByRole('combobox');
      await user.click(triggers[1]);
      await user.click(await screen.findByRole('option', { name: 'خان يونس' }));
      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('city=%D8%AE%D8%A7%D9%86'));
    });
  });

  describe('service location select', () => {
    it('renders all three location labels', async () => {
      const user = setupUser();
      render(<ServiceCategoryFilter />);
      const triggers = screen.getAllByRole('combobox');
      await user.click(triggers[2]);
      expect(await screen.findByRole('option', { name: 'لدى العميل' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'لدى مقدم الخدمة' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'عن بُعد' })).toBeInTheDocument();
    });

    it('pushes serviceLocation when selected', async () => {
      const user = setupUser();
      render(<ServiceCategoryFilter />);
      const triggers = screen.getAllByRole('combobox');
      await user.click(triggers[2]);
      await user.click(await screen.findByRole('option', { name: 'عن بُعد' }));
      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('serviceLocation=REMOTE'));
    });
  });

  describe('price inputs', () => {
    it('pushes minPrice on blur', async () => {
      const user = setupUser();
      render(
        <>
          <ServiceCategoryFilter />
          <button>elsewhere</button>
        </>
      );
      const [minInput] = screen.getAllByRole('spinbutton');
      await user.type(minInput, '50');
      await user.click(screen.getByText('elsewhere'));
      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('minPrice=50'));
    });

    it('pushes maxPrice on blur', async () => {
      const user = setupUser();
      render(
        <>
          <ServiceCategoryFilter />
          <button>elsewhere</button>
        </>
      );
      const [, maxInput] = screen.getAllByRole('spinbutton');
      await user.type(maxInput, '500');
      await user.click(screen.getByText('elsewhere'));
      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('maxPrice=500'));
    });
  });

  it('always removes the page param when any filter changes', async () => {
    mockSearchParams = new URLSearchParams({ page: '3', city: 'غزة' });
    const user = setupUser();
    render(<ServiceCategoryFilter />);
    const triggers = screen.getAllByRole('combobox');
    await user.click(triggers[0]);
    await user.click(await screen.findByRole('option', { name: 'سباكة' }));
    const lastCall = mockPush.mock.calls.at(-1)?.[0] as string;
    expect(lastCall).not.toContain('page=');
  });

  it('preserves existing params when updating one filter', async () => {
    mockSearchParams = new URLSearchParams({ city: 'غزة' });
    const user = setupUser();
    render(<ServiceCategoryFilter />);
    const triggers = screen.getAllByRole('combobox');
    await user.click(triggers[0]);
    await user.click(await screen.findByRole('option', { name: 'سباكة' }));
    const lastCall = mockPush.mock.calls.at(-1)?.[0] as string;
    expect(lastCall).toContain('categoryId=cat-1');
    expect(lastCall).toContain('city=');
  });
});

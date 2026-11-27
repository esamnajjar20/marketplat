/**
 * __tests__/components/ServiceCategoryFilter.test.tsx
 *
 * Previously uncovered (0%), ~120 lines. Filter sidebar for /services —
 * search box, service-type/city/serviceLocation Selects, and min/max price
 * inputs, all writing to the URL via router.push and always clearing
 * ?page= on change.
 *
 * Coverage targets:
 *  - search input: Enter key and blur both call update('search', value)
 *  - category selection is delegated to the shared quick-filter chips
 *    and is not duplicated inside this filter panel
 *  - city Select: renders all CITIES as options
 *  - serviceLocation Select: renders all three location labels
 *  - min/max price inputs: blur calls update with the field's value
 *  - every update() call preserves other existing params and always
 *    deletes ?page=
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { ServiceCategoryFilter } from '@/components/services/ServiceCategoryFilter';
import { useServiceTypes } from '@/hooks/queries/useServiceTypes';

const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/hooks/queries/useServiceTypes', () => ({
  useServiceTypes: vi.fn(),
}));

function mockServiceTypes(
  data: Array<{
    id: string;
    nameAr?: string;
    capabilities?: Record<string, boolean>;
    fields?: unknown[];
  }> | undefined = [],
) {
  vi.mocked(useServiceTypes).mockReturnValue({ data } as never);
}

describe('ServiceCategoryFilter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockServiceTypes([]);
  });


  it('loads service types only when the domain selector is opened', async () => {
    const user = setupUser();
    mockServiceTypes([{ id: 'type-1', nameAr: 'صيانة' }]);
    render(<ServiceCategoryFilter />);

    expect(useServiceTypes).toHaveBeenLastCalledWith({ enabled: false });
    const domainSelect = screen.getAllByRole('combobox')[0];
    await user.click(domainSelect);
    expect(useServiceTypes).toHaveBeenLastCalledWith({ enabled: true });
    expect(await screen.findByRole('option', { name: 'صيانة' })).toBeInTheDocument();
  });

  it('loads service types when a selected domain needs its label and dynamic fields', () => {
    mockSearchParams = new URLSearchParams({ serviceTypeId: 'type-1' });
    mockServiceTypes([{ id: 'type-1', nameAr: 'صيانة' }]);
    render(<ServiceCategoryFilter />);

    expect(useServiceTypes).toHaveBeenLastCalledWith({ enabled: true });
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

  it('does not duplicate category selection in the sidebar; category chips own categoryId', () => {
    render(<ServiceCategoryFilter />);
    expect(screen.getAllByRole('combobox')).toHaveLength(3);
    expect(screen.queryByRole('option', { name: 'سباكة' })).not.toBeInTheDocument();
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
    await user.click(triggers[1]);
    await user.click(await screen.findByRole('option', { name: 'دير البلح' }));
    const lastCall = mockPush.mock.calls.at(-1)?.[0] as string;
    expect(lastCall).not.toContain('page=');
  });

  it('preserves existing params when updating one filter', async () => {
    mockSearchParams = new URLSearchParams({ city: 'غزة' });
    const user = setupUser();
    render(<ServiceCategoryFilter />);
    const triggers = screen.getAllByRole('combobox');
    await user.click(triggers[2]);
    await user.click(await screen.findByRole('option', { name: 'عن بُعد' }));
    const lastCall = mockPush.mock.calls.at(-1)?.[0] as string;
    expect(lastCall).toContain('serviceLocation=REMOTE');
    expect(lastCall).toContain('city=');
  });
});

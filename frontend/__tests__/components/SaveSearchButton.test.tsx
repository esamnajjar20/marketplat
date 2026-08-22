/**
 * __tests__/components/SaveSearchButton.test.tsx
 *
 * PLATFORM-WIDE-01: covers the ads/products/services generalization —
 *  - filtersFromParams reads `q` vs `search` per queryParamKey
 *  - city/condition are only read (and only sent) for type='ads'
 *  - the built filters payload always carries the given `type`
 *  - guard rails: unauthenticated click, and a click with no filters
 *    applied at all, both toast an error and never open the dialog
 *
 * TYPE-PICK-STEP: covers the `type` prop being omitted (unified
 * /search page's "الكل" tab) — opens on a type-picker step instead of
 * defaulting to 'ads', with the no-filters guard now evaluated per
 * chosen type rather than up front.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { SaveSearchButton } from '@/components/ads/SaveSearchButton';
import { useCreateSavedSearch } from '@/hooks/mutations/useSavedSearchMutations';
import { useAuthStore } from '@/store/auth.store';
import { toast } from 'sonner';

let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/hooks/mutations/useSavedSearchMutations', () => ({
  useCreateSavedSearch: vi.fn(),
}));

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn(),
  selectIsAuthenticated: (s: { isAuthenticated: boolean }) => s.isAuthenticated,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockMutate = vi.fn();

function mockAuthed(isAuthenticated = true) {
  (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector: (s: { isAuthenticated: boolean }) => unknown) => selector({ isAuthenticated })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchParams = new URLSearchParams();
  mockAuthed(true);
  (useCreateSavedSearch as ReturnType<typeof vi.fn>).mockReturnValue({
    mutate: mockMutate,
    isPending: false,
  });
});

describe('SaveSearchButton', () => {
  it('errors and never opens the dialog when the user is not authenticated', async () => {
    mockAuthed(false);
    mockSearchParams = new URLSearchParams('q=iphone');
    const user = setupUser();
    render(<SaveSearchButton type="ads" />);

    await user.click(screen.getByRole('button', { name: /حفظ البحث/ }));

    expect(toast.error).toHaveBeenCalledWith('يرجى تسجيل الدخول أولاً');
    expect(screen.queryByLabelText('اسم البحث')).not.toBeInTheDocument();
  });

  it('errors when no filters are applied at all (explicit type)', async () => {
    mockSearchParams = new URLSearchParams();
    const user = setupUser();
    render(<SaveSearchButton type="ads" />);

    await user.click(screen.getByRole('button', { name: /حفظ البحث/ }));

    expect(toast.error).toHaveBeenCalledWith('أضف كلمة بحث أو فلتر واحد على الأقل');
  });

  it('reads q/city/categoryId/condition/price from the URL for an explicit type="ads"', async () => {
    mockSearchParams = new URLSearchParams(
      'q=iphone&city=غزة&categoryId=cat-1&condition=USED&minPrice=100&maxPrice=500'
    );
    const user = setupUser();
    render(<SaveSearchButton type="ads" />);

    await user.click(screen.getByRole('button', { name: /حفظ البحث/ }));
    await user.click(screen.getByRole('button', { name: 'حفظ' }));

    expect(mockMutate).toHaveBeenCalledWith(
      {
        label: expect.any(String),
        filters: {
          type: 'ads',
          q: 'iphone',
          city: 'غزة',
          categoryId: 'cat-1',
          condition: 'USED',
          minPrice: 100,
          maxPrice: 500,
        },
      },
      expect.anything()
    );
  });

  it('reads the free-text query from `search` (not `q`) when queryParamKey="search"', async () => {
    mockSearchParams = new URLSearchParams('search=case&categoryId=pcat-1');
    const user = setupUser();
    render(<SaveSearchButton type="products" queryParamKey="search" />);

    await user.click(screen.getByRole('button', { name: /حفظ البحث/ }));
    await user.click(screen.getByRole('button', { name: 'حفظ' }));

    expect(mockMutate).toHaveBeenCalledWith(
      {
        label: expect.any(String),
        filters: { type: 'products', q: 'case', categoryId: 'pcat-1' },
      },
      expect.anything()
    );
  });

  it('does not send city/condition for type="services" even if present in the URL', async () => {
    mockSearchParams = new URLSearchParams('search=تكييف&city=غزة&condition=NEW');
    const user = setupUser();
    render(<SaveSearchButton type="services" queryParamKey="search" />);

    await user.click(screen.getByRole('button', { name: /حفظ البحث/ }));
    await user.click(screen.getByRole('button', { name: 'حفظ' }));

    expect(mockMutate).toHaveBeenCalledWith(
      {
        label: expect.any(String),
        filters: { type: 'services', q: 'تكييف' },
      },
      expect.anything()
    );
  });

  // TYPE-PICK-STEP: `type` omitted entirely — used on the unified
  // /search page's "الكل" tab.
  describe('type omitted (unified "الكل" tab)', () => {
    it('opens on the type-picker step, not the label step, and does not toast immediately', async () => {
      mockSearchParams = new URLSearchParams('q=iphone');
      const user = setupUser();
      render(<SaveSearchButton />);

      await user.click(screen.getByRole('button', { name: /حفظ البحث/ }));

      expect(toast.error).not.toHaveBeenCalled();
      expect(screen.getByText('حفظ البحث كـ...')).toBeInTheDocument();
      expect(screen.queryByLabelText('اسم البحث')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'إعلان' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'منتج' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'خدمة' })).toBeInTheDocument();
    });

    it('errors and stays on the picker step when the chosen type has no applicable filters', async () => {
      // condition/city only ever apply to 'ads' — picking 'services'
      // here leaves zero filters for that type even though the URL
      // isn't empty.
      mockSearchParams = new URLSearchParams('city=غزة&condition=NEW');
      const user = setupUser();
      render(<SaveSearchButton />);

      await user.click(screen.getByRole('button', { name: /حفظ البحث/ }));
      await user.click(screen.getByRole('button', { name: 'خدمة' }));

      expect(toast.error).toHaveBeenCalledWith('أضف كلمة بحث أو فلتر واحد على الأقل');
      expect(screen.getByText('حفظ البحث كـ...')).toBeInTheDocument();
    });

    it('proceeds to the label step and submits with the chosen type after picking one', async () => {
      mockSearchParams = new URLSearchParams('q=iphone&city=غزة');
      const user = setupUser();
      render(<SaveSearchButton />);

      await user.click(screen.getByRole('button', { name: /حفظ البحث/ }));
      await user.click(screen.getByRole('button', { name: 'إعلان' }));

      expect(screen.getByLabelText('اسم البحث')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'حفظ' }));

      expect(mockMutate).toHaveBeenCalledWith(
        {
          label: expect.any(String),
          filters: { type: 'ads', q: 'iphone', city: 'غزة' },
        },
        expect.anything()
      );
    });

    it('"رجوع" returns from the label step to the picker step', async () => {
      mockSearchParams = new URLSearchParams('q=iphone');
      const user = setupUser();
      render(<SaveSearchButton />);

      await user.click(screen.getByRole('button', { name: /حفظ البحث/ }));
      await user.click(screen.getByRole('button', { name: 'منتج' }));
      expect(screen.getByLabelText('اسم البحث')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'رجوع' }));

      expect(screen.getByText('حفظ البحث كـ...')).toBeInTheDocument();
      expect(screen.queryByLabelText('اسم البحث')).not.toBeInTheDocument();
    });

    it('does not show "رجوع" when type is given explicitly', async () => {
      mockSearchParams = new URLSearchParams('q=iphone');
      const user = setupUser();
      render(<SaveSearchButton type="ads" />);

      await user.click(screen.getByRole('button', { name: /حفظ البحث/ }));

      expect(screen.getByLabelText('اسم البحث')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'رجوع' })).not.toBeInTheDocument();
    });
  });
});

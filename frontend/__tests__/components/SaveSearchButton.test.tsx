/**
 * __tests__/components/SaveSearchButton.test.tsx
 *
 * PLATFORM-WIDE-01: previously uncovered. Covers the behavior that
 * changed when this button was generalized from ads-only to also
 * support products/services:
 *  - filtersFromParams reads `q` vs `search` per queryParamKey
 *  - city/condition are only read (and only sent) for type='ads'
 *  - the built filters payload always carries the given `type`
 *  - guard rails: unauthenticated click, and a click with no filters
 *    applied at all, both toast an error and never open the dialog
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
    render(<SaveSearchButton />);

    await user.click(screen.getByRole('button', { name: /حفظ البحث/ }));

    expect(toast.error).toHaveBeenCalledWith('يرجى تسجيل الدخول أولاً');
    expect(screen.queryByLabelText('اسم البحث')).not.toBeInTheDocument();
  });

  it('errors when no filters are applied at all', async () => {
    mockSearchParams = new URLSearchParams();
    const user = setupUser();
    render(<SaveSearchButton />);

    await user.click(screen.getByRole('button', { name: /حفظ البحث/ }));

    expect(toast.error).toHaveBeenCalledWith('أضف كلمة بحث أو فلتر واحد على الأقل');
  });

  it('defaults to type "ads" and reads q/city/categoryId/condition/price from the URL', async () => {
    mockSearchParams = new URLSearchParams(
      'q=iphone&city=غزة&categoryId=cat-1&condition=USED&minPrice=100&maxPrice=500'
    );
    const user = setupUser();
    render(<SaveSearchButton />);

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
});

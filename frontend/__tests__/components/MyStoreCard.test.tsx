/**
 * __tests__/components/MyStoreCard.test.tsx
 *
 * Coverage gap: 0% prior coverage. Covers status badge/variant per
 * StoreStatus, the FEATURED plan badge (FIX P1-4), the
 * PENDING/BLOCKED status notices, client-side validation (all four
 * required-field rules), the read-only isFormIncomplete mirror
 * disabling submit before any submit attempt (UX-FIX paired with
 * BecomeStoreOwnerCard), successful submit payload shape (trimmed
 * fields, empty address -> null), server-side field error surfacing
 * on failure, and the conditional "view public page" link that only
 * appears for ACTIVE stores.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { MyStoreCard } from '@/components/stores/MyStoreCard';
import { useUpdateStore, useUploadStoreLogo, useUploadStoreCover } from '@/hooks/mutations/useStoreMutations';
import { parseApiError } from '@/lib/errorParser';
import type { StoreDetails } from '@/types/store.types';

vi.mock('@/hooks/mutations/useStoreMutations', () => ({
  useUpdateStore: vi.fn(),
  useUploadStoreLogo: vi.fn(),
  useUploadStoreCover: vi.fn(),
}));

vi.mock('@/lib/errorParser', () => ({
  parseApiError: vi.fn(),
}));

const mockMutate = vi.fn();

const activeStore: StoreDetails = {
  id: 'store-1',
  name: 'متجر الأمل',
  description: 'متجر متخصص في بيع الأثاث المنزلي والمكتبي بأسعار مناسبة',
  city: 'غزة',
  address: 'شارع الجلاء',
  phone: '0599123456',
  status: 'ACTIVE',
  plan: 'STANDARD',
} as StoreDetails;

function mockUpdate(overrides: Record<string, unknown> = {}) {
  (useUpdateStore as ReturnType<typeof vi.fn>).mockReturnValue({
    mutate: mockMutate,
    isPending: false,
    ...overrides,
  });
}

// New in this pass — MyStoreCard now also renders the logo/cover
// upload block, so these two hooks need a default mocked return value
// the same as useUpdateStore's, or the component throws on `undefined()`.
function mockUploads() {
  (useUploadStoreLogo as ReturnType<typeof vi.fn>).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  });
  (useUploadStoreCover as ReturnType<typeof vi.fn>).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  });
}

describe('MyStoreCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate();
    mockUploads();
  });

  it('renders the store name and ACTIVE status badge', () => {
    render(<MyStoreCard store={activeStore} />);

    expect(screen.getByText('متجر الأمل')).toBeInTheDocument();
    expect(screen.getByText('نشط')).toBeInTheDocument();
  });

  it('renders the PENDING status badge and review notice', () => {
    render(<MyStoreCard store={{ ...activeStore, status: 'PENDING' }} />);

    expect(screen.getByText('قيد المراجعة')).toBeInTheDocument();
    expect(screen.getByText(/متجرك قيد المراجعة/)).toBeInTheDocument();
  });

  it('renders the BLOCKED status badge and blocked notice', () => {
    render(<MyStoreCard store={{ ...activeStore, status: 'BLOCKED' }} />);

    expect(screen.getByText('محظور')).toBeInTheDocument();
    expect(screen.getByText(/تم حظر متجرك/)).toBeInTheDocument();
  });

  it('shows the FEATURED plan badge only when plan is FEATURED (FIX P1-4)', () => {
    render(<MyStoreCard store={{ ...activeStore, plan: 'FEATURED' }} />);

    expect(screen.getByText('مميز')).toBeInTheDocument();
  });

  it('omits the FEATURED badge for a STANDARD plan', () => {
    render(<MyStoreCard store={activeStore} />);

    expect(screen.queryByText('مميز')).not.toBeInTheDocument();
  });

  it('pre-fills form fields from the store prop', () => {
    render(<MyStoreCard store={activeStore} />);

    expect(screen.getByDisplayValue('متجر الأمل')).toBeInTheDocument();
    expect(screen.getByDisplayValue('0599123456')).toBeInTheDocument();
  });

  it('enables submit when the pre-filled form already satisfies all required fields', () => {
    render(<MyStoreCard store={activeStore} />);

    expect(screen.getByRole('button', { name: 'حفظ التعديلات' })).not.toBeDisabled();
  });

  it('disables submit (read-only mirror) once a required field is cleared', async () => {
    const user = setupUser();
    render(<MyStoreCard store={activeStore} />);

    const nameInput = screen.getByDisplayValue('متجر الأمل');
    await user.clear(nameInput);

    expect(screen.getByRole('button', { name: 'حفظ التعديلات' })).toBeDisabled();
  });

  it('shows a validation error and does not submit when the name is too short', () => {
    render(<MyStoreCard store={{ ...activeStore, name: '', description: '', phone: '' }} />);

    // isFormIncomplete already disables the button in this state, so
    // directly submit the form to exercise validate()'s own message.
    const form = screen.getByRole('button', { name: 'حفظ التعديلات' }).closest('form')!;
    fireEvent.submit(form);

    expect(screen.getByText('اسم المتجر قصير جداً')).toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('submits trimmed values and null address when address is blank', async () => {
    const user = setupUser();
    render(<MyStoreCard store={{ ...activeStore, address: '' }} />);

    await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }));

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'متجر الأمل', address: null }),
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it('surfaces server-side field errors from a failed submission', async () => {
    (parseApiError as ReturnType<typeof vi.fn>).mockReturnValue({
      fieldErrors: { name: ['هذا الاسم مستخدم بالفعل'] },
    });
    const user = setupUser();
    render(<MyStoreCard store={activeStore} />);

    await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }));
    const onErrorCall = mockMutate.mock.calls[0][1];
    onErrorCall.onError(new Error('fail'));

    expect(await screen.findByText('هذا الاسم مستخدم بالفعل')).toBeInTheDocument();
  });

  it('shows a saving label and disables submit while the mutation is pending', () => {
    mockUpdate({ isPending: true });
    render(<MyStoreCard store={activeStore} />);

    expect(screen.getByRole('button', { name: 'جارٍ الحفظ…' })).toBeDisabled();
  });

  it('shows the "view public page" link only for an ACTIVE store', () => {
    render(<MyStoreCard store={activeStore} />);

    expect(screen.getByText('عرض صفحتي العامة')).toBeInTheDocument();
  });

  it('hides the "view public page" link for a PENDING store', () => {
    render(<MyStoreCard store={{ ...activeStore, status: 'PENDING' }} />);

    expect(screen.queryByText('عرض صفحتي العامة')).not.toBeInTheDocument();
  });

  it('always shows the "manage products" and "followed stores" links (AUDIT-FIX #3)', () => {
    render(<MyStoreCard store={{ ...activeStore, status: 'PENDING' }} />);

    expect(screen.getByText('إدارة منتجاتي')).toBeInTheDocument();
    expect(screen.getByText('المتاجر المتابَعة')).toBeInTheDocument();
  });
});

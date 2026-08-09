/**
 * __tests__/components/BecomeStoreOwnerCard.test.tsx
 *
 * FIX P0-1 (unified pattern): mirrors BecomeSellerCard.test.tsx's
 * redirect coverage — CreateProductGate now sends users here via
 * ?from=/my-store/products/new when they try to add a product without
 * a store yet, and this must send them back on success instead of
 * stranding them on /my-store.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BecomeStoreOwnerCard } from '@/components/stores/BecomeStoreOwnerCard';
import { useMySellerProfile } from '@/hooks/queries/useSellers';
import { useCreateStore } from '@/hooks/mutations/useStoreMutations';

vi.mock('@/hooks/queries/useSellers', () => ({
  useMySellerProfile: vi.fn(),
}));

vi.mock('@/hooks/mutations/useStoreMutations', () => ({
  useCreateStore: vi.fn(),
}));

let mockSearchParams = new URLSearchParams();
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/my-store',
}));

const mockCreateStore = vi.fn();

describe('BecomeStoreOwnerCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    (useMySellerProfile as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { id: 'sp1' },
      isLoading: false,
    });
    (useCreateStore as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockCreateStore,
      isPending: false,
    });
  });

  async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText('اسم المتجر'), 'متجر أبو محمد');
    await user.type(screen.getByLabelText('الوصف'), 'وصف كافٍ لمتجرنا الجديد');
    await user.click(screen.getByLabelText('المدينة'));
    await user.click(screen.getByText('غزة'));
    await user.type(screen.getByLabelText('رقم الهاتف'), '0599123456');
    await user.click(screen.getByRole('button', { name: 'إنشاء المتجر' }));
  }

  it('does not redirect on success when there is no ?from= param', async () => {
    const user = userEvent.setup();
    render(<BecomeStoreOwnerCard />);
    await fillAndSubmit(user);

    const { onSuccess } = mockCreateStore.mock.calls[0][1];
    onSuccess();

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('redirects to the ?from= target on success (FIX P0-1)', async () => {
    mockSearchParams = new URLSearchParams('from=/my-store/products/new');
    const user = userEvent.setup();
    render(<BecomeStoreOwnerCard />);
    await fillAndSubmit(user);

    const { onSuccess } = mockCreateStore.mock.calls[0][1];
    onSuccess();

    expect(mockPush).toHaveBeenCalledWith('/my-store/products/new');
  });

  it('falls back to not redirecting when ?from= is an unsafe absolute URL', async () => {
    mockSearchParams = new URLSearchParams('from=https://evil.example.com');
    const user = userEvent.setup();
    render(<BecomeStoreOwnerCard />);
    await fillAndSubmit(user);

    const { onSuccess } = mockCreateStore.mock.calls[0][1];
    onSuccess();

    expect(mockPush).toHaveBeenCalledWith('/dashboard');
    expect(mockPush).not.toHaveBeenCalledWith('https://evil.example.com');
  });
});
